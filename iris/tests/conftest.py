import os
import shutil
import tempfile

import pytest

from iris.models import db


@pytest.fixture(scope='session')
def app():
    """The app of a temporary copy of the demo project.

    Tests edit the config, rename the project and save masks, so they run on
    a copy and never write into the demo folder. The database and the
    project path (masks, user configs) are in the same temporary folder.
    """
    from iris import build_app, get_demo_file

    root = tempfile.mkdtemp()
    demo = os.path.join(root, 'demo')
    shutil.copytree(os.path.dirname(get_demo_file()), demo, ignore=shutil.ignore_patterns('*.iris'))
    test_project_dir = os.path.join(root, 'project.iris')
    os.makedirs(os.path.join(test_project_dir, 'user_config'))
    test_db = 'sqlite:///' + os.path.join(test_project_dir, 'iris.db')

    iris_app = build_app(
        os.path.join(demo, os.path.basename(get_demo_file())), {'debug': False}, db_uri=test_db
    )
    iris_app.config['TESTING'] = True
    iris_app.extensions['iris'].config['path'] = test_project_dir

    ctx = iris_app.app_context()
    ctx.push()
    try:
        yield iris_app
    finally:
        db.session.remove()
        ctx.pop()
        shutil.rmtree(root, ignore_errors=True)


@pytest.fixture
def project(app):
    """The Project of the test app (what current_project() returns)."""
    return app.extensions['iris']


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def clean_db(app, project):
    """Clean database before each test to ensure isolation."""
    with app.app_context():
        # Clear all data before each test
        db.session.remove()
        db.drop_all()
        db.create_all()

        # Ensure user_config directory exists in the project path
        # This is needed for user preferences tests
        user_config_dir = os.path.join(project.config['path'], 'user_config')
        os.makedirs(user_config_dir, exist_ok=True)

        yield
        # Clean up after test
        db.session.remove()


@pytest.fixture
def logged_in_user(app, client):
    """Create a logged-in user for testing authenticated endpoints."""
    import json

    from iris.models import User, db

    with app.app_context():
        # Create a test user
        user = User(id=1, name="test_user", admin=False)
        user.set_password("password123")
        db.session.add(user)
        db.session.commit()

        # Login the user
        login_response = client.post('/api/v1/auth/login',
            data=json.dumps({'username': 'test_user', 'password': 'password123'}),
            content_type='application/json'
        )
        assert login_response.status_code == 200

        return user


@pytest.fixture
def project_snapshot(project):
    """Snapshot and restore the test app's Project.

    Yields a dict containing the saved state. Tests may modify `project` and
    the fixture will restore the original values after the test completes.
    """
    from copy import deepcopy

    # Keys we care about and want to snapshot/restore
    keys = ['image_ids', 'file', 'config', 'debug']

    saved = {}
    for k in keys:
        saved[k] = deepcopy(getattr(project, k, None))

    try:
        yield saved
    finally:
        # restore
        for k, v in saved.items():
            setattr(project, k, deepcopy(v))


@pytest.fixture
def restore_config_file(app, project):
    """Snapshot and restore the project config file on disk.

    This fixture saves the config file content before the test and restores it
    after, ensuring tests that modify the config file don't affect other tests.
    Also cleans up any backup files created during testing.
    """

    config_file = project.file
    backup_file = config_file + '.backup'
    test_project_dir = project.config['path']

    # Save original config content
    with open(config_file) as f:
        original_content = f.read()

    try:
        yield config_file
    finally:
        # Restore original config file
        with open(config_file, 'w') as f:
            f.write(original_content)

        # Clean up backup file if it was created
        if os.path.exists(backup_file):
            os.remove(backup_file)

        # Reload project to ensure consistency, keeping the test project path
        project.load_from(config_file)
        project.config['path'] = test_project_dir


@pytest.fixture
def write_tif():
    """write_tif(path, bands=1, ...) writes a 64 x 64 GeoTIFF of zeros."""
    import numpy as np
    import rasterio as rio

    def write(path, bands=1, crs='EPSG:32633', interleave='band', tiled=True):
        profile = {
            'driver': 'GTiff', 'width': 64, 'height': 64, 'count': bands, 'dtype': 'float32',
            'interleave': interleave, 'tiled': tiled, 'crs': crs,
            'transform': rio.transform.from_origin(500000, 4000000, 10, 10),
        }
        if tiled:
            profile.update(blockxsize=16, blockysize=16)
        else:
            profile.update(blockysize=4)
        with rio.open(path, 'w', **profile) as file:
            file.write(np.zeros((bands, 64, 64), np.float32))
        return str(path)

    return write


@pytest.fixture
def write_project(tmp_path):
    """write_project(paths, **segmentation) writes a project file and returns its path."""
    import json

    def write(paths, **segmentation):
        config = {
            'images': {'path': paths},
            'classes': [{'name': 'a', 'colour': [0, 0, 0, 0]}, {'name': 'b', 'colour': [1, 1, 1, 1]}],
            'views': {'v': {'type': 'image', 'data': '$B1'}},
            'segmentation': {
                'path': str(tmp_path / 'masks' / '{id}.png'), 'mask_encoding': 'rgb', **segmentation,
            },
        }
        path = tmp_path / 'p.json'
        path.write_text(json.dumps(config))
        return str(path)

    return write
