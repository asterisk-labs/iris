"""/segmentation/next_image and /previous_image through the app.

The routes only redirect, so the project's image ids are replaced with six
made-up ones; no image is loaded.
"""
import json
from urllib.parse import parse_qs, urlparse

import pytest

from iris.models import Action, User, db
from iris.ordering import seeded_order

IDS = ["a", "b", "c", "d", "e", "f"]


@pytest.fixture
def six_images(project, project_snapshot):
    project.image_ids = list(IDS)
    return project


def _add_user(app, user_id, name, seed):
    with app.app_context():
        user = User(id=user_id, name=name, admin=False, image_seed=seed)
        user.set_password("password123")
        db.session.add(user)
        db.session.commit()


def _login(client, name):
    response = client.post(
        '/user/login',
        data=json.dumps({'username': name, 'password': 'password123'}),
        content_type='application/json',
    )
    assert response.status_code == 200


def _go(client, route, image_id):
    response = client.get(f'/segmentation/{route}?image_id={image_id}')
    assert response.status_code == 302
    return parse_qs(urlparse(response.location).query)['image_id'][0]


def _set_prioritise(project, value):
    project.config['segmentation']['prioritise_unmarked_images'] = value


def test_next_and_previous_follow_the_users_seeded_order(app, client, six_images):
    _set_prioritise(six_images, False)
    _add_user(app, 1, "u1", seed=0)
    _login(client, "u1")
    order = seeded_order(IDS, 0)

    assert _go(client, 'next_image', order[0]) == order[1]
    assert _go(client, 'next_image', order[-1]) == order[0]
    assert _go(client, 'previous_image', order[1]) == order[0]


def test_two_users_have_independent_orders(app, six_images):
    _set_prioritise(six_images, True)
    _add_user(app, 1, "u1", seed=0)
    _add_user(app, 2, "u2", seed=123)
    with app.app_context():
        db.session.add(Action(type='segmentation', image_id=seeded_order(IDS, 0)[1], user_id=2))
        db.session.commit()

    first, second = app.test_client(), app.test_client()
    _login(first, "u1")
    _login(second, "u2")
    order2 = seeded_order(IDS, 123)
    before = _go(second, 'next_image', order2[0])

    # u1 navigating used to swap entries of the shared list, which moved
    # u2's images about; now u2's answer does not change.
    for image_id in IDS:
        _go(first, 'next_image', image_id)
    assert _go(second, 'next_image', order2[0]) == before
    assert six_images.image_ids == IDS


def test_prioritise_skips_images_others_have_annotated(app, client, six_images):
    _set_prioritise(six_images, True)
    _add_user(app, 1, "u1", seed=0)
    _add_user(app, 2, "u2", seed=1)
    order = seeded_order(IDS, 0)
    with app.app_context():
        db.session.add(Action(type='segmentation', image_id=order[1], user_id=2))
        db.session.commit()
    _login(client, "u1")

    assert _go(client, 'next_image', order[0]) == order[2]


def test_unknown_image_is_404(app, client, six_images):
    _add_user(app, 1, "u1", seed=0)
    _login(client, "u1")
    assert client.get('/segmentation/next_image?image_id=nope').status_code == 404
    assert client.get('/segmentation/previous_image?image_id=nope').status_code == 404
