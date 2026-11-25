import contextlib
import json
import re
from pathlib import Path

import pytest

import iris.api
from iris.schema import TYPESCRIPT_FILE, check_config, typescript

ROUTES = iris.api.all_routes()


def _fill(path):
    return re.sub(r'<[^>]+>', '1', path)


@pytest.mark.parametrize('route', ROUTES, ids=lambda r: f'{r.method} {r.path}')
def test_every_route_needs_a_login_unless_public(client, route):
    if route.public and route.method == 'POST':
        pytest.skip('needs a body; covered by the user tests')
    response = client.open('/api/v1' + _fill(route.path), method=route.method)
    assert response.status_code == (200 if route.public else 403)


@pytest.mark.parametrize('route', [r for r in ROUTES if '/admin/' in r.path or 'project-config' in r.path],
                         ids=lambda r: f'{r.method} {r.path}')
def test_admin_routes_refuse_other_users(client, logged_in_user, route):
    assert client.open('/api/v1' + _fill(route.path), method=route.method).status_code == 403


@pytest.mark.parametrize('route', [r for r in ROUTES if r.legacy], ids=lambda r: f'{r.method} {r.path}')
def test_legacy_paths_redirect_and_keep_method_and_query(client, route):
    for legacy in route.legacy:
        response = client.open(_fill(legacy) + '?a=1', method=route.method)
        assert response.status_code == 307
        assert response.location.endswith('/api/v1' + _fill(route.path) + '?a=1')


def test_login_through_the_legacy_path(app, client):
    from iris.models import User, db
    user = User(name='u')
    user.set_password('p')
    db.session.add(user)
    db.session.commit()
    response = client.post('/user/login', data=json.dumps({'username': 'u', 'password': 'p'}),
                           follow_redirects=True)
    assert response.status_code == 200
    assert client.get('/api/v1/auth/session').json['user']['name'] == 'u'


def test_generated_types_are_up_to_date():
    # Run `python -m iris.schema` when this fails
    assert TYPESCRIPT_FILE.read_text(encoding='utf-8') == typescript()


def test_default_and_demo_configs_fit_the_schema(project):
    from iris.utils import merge_deep_dicts
    package = Path(iris.__file__).parent
    defaults = json.loads((package / 'default_config.json').read_text())
    demo = json.loads(Path(project.file).read_text())
    assert check_config(merge_deep_dicts(defaults, demo)) == ([], [])


def test_messages_point_at_the_problem(project):
    demo = json.loads(Path(project.file).read_text())
    demo['segmentation']['ai_model'] = {'n_jobs': 0}
    demo['classes'][0]['colour'] = [0, 0, 0, 999]
    demo['views']['RGB']['data'] = 'open($B1)'
    errors, _ = check_config(demo)
    assert len(errors) == 3
    assert errors[0].startswith('classes.0.colour.3: ')
    assert errors[1].startswith('views.RGB.data: Only these functions')
    assert errors[2] == 'segmentation.ai_model.n_jobs: must be a positive integer or -1 (all cores)'


SOURCES = Path(__file__).parents[2] / 'src'
FRONTEND_URLS = sorted({
    '/' + re.sub(r'\$\{[^}]*\}', '1', url)
    for path in SOURCES.rglob('*.ts*') if '.test.' not in path.name
    for url in re.findall(r"api/v1/(?:\$\{[^}]*\}|[^'\"`?$\s])+", path.read_text(encoding='utf-8'))
})


@pytest.mark.parametrize('url', FRONTEND_URLS)
def test_urls_used_by_the_frontend_exist(app, url):
    from werkzeug.exceptions import MethodNotAllowed
    with contextlib.suppress(MethodNotAllowed):  # exists, with another method
        app.url_map.bind('').match(url)


def test_frontend_urls_were_found():
    assert len(FRONTEND_URLS) > 20
    assert '/api/v1/images/1/mask' in FRONTEND_URLS


def test_emails_are_only_shown_to_the_user_and_admins(app, client, logged_in_user):
    from iris.models import User, db
    User.query.get(1).email = 'me@example.org'
    db.session.add(User(id=2, name='other', email='other@example.org'))
    db.session.commit()
    for path in ('/api/v1/users/{}', '/api/v1/users/{}/profile'):
        assert client.get(path.format(1)).json['email'] == 'me@example.org'
        assert client.get(path.format('current')).json['email'] == 'me@example.org'
        other = client.get(path.format(2))
        assert other.json['name'] == 'other'
        assert b'other@example.org' not in other.data
        assert 'config' not in other.json
    User.query.get(1).admin = True
    db.session.commit()
    assert client.get('/api/v1/users/2').json['email'] == 'other@example.org'


def test_only_the_owner_or_an_admin_can_edit_an_action(app, client, logged_in_user):
    from iris.models import Action, User, db
    db.session.add(User(id=2, name='other'))
    db.session.add(Action(id=1, type='segmentation', image_id='a', user_id=1))
    db.session.add(Action(id=2, type='segmentation', image_id='a', user_id=2, notes='mine'))
    db.session.commit()

    def edit(action_id):
        return client.post(f'/api/v1/actions/{action_id}', data=json.dumps({'notes': 'edited'})).status_code

    assert edit(1) == 200
    assert edit(2) == 403
    db.session.expire_all()
    assert Action.query.get(1).notes == 'edited'
    assert Action.query.get(2).notes == 'mine'

    User.query.get(1).admin = True
    db.session.commit()
    assert edit(2) == 200
    assert edit(99) == 404
