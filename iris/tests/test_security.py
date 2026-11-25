import json
import os
import stat

import numpy as np
import pytest

from iris import create_app
from iris.secret_key import load_secret_key


def test_login_cookie_is_not_sent_by_other_sites(app, client, logged_in_user):
    response = app.test_client().post(
        '/api/v1/auth/login', data=json.dumps({'username': 'test_user', 'password': 'password123'}))
    cookie = response.headers['Set-Cookie']
    assert 'SameSite=Lax' in cookie
    assert 'HttpOnly' in cookie


@pytest.mark.parametrize('path', ['/api/v1/auth/logout', '/user/logout'])
def test_logging_out_takes_a_post(client, logged_in_user, path):
    assert client.get(path).status_code == 405
    assert client.get('/api/v1/auth/session').json['user'] is not None
    assert client.post(path, follow_redirects=True).status_code == 200
    assert client.get('/api/v1/auth/session').json['user'] is None


@pytest.mark.parametrize('first, last, status', [(254, 254, 200), (0, 254, 400), (254, 0, 400), (0, 0, 400)])
def test_save_mask_checks_both_markers(client, logged_in_user, project, first, last, status, monkeypatch):
    monkeypatch.setattr('iris.segmentation.merge_masks', lambda image_id: None)
    image_id = project.image_ids[0]
    width, height = project.get_mask_shape(image_id)
    data = np.zeros(2 * width * height + 2, dtype=np.uint8)
    data[0], data[-1] = first, last
    response = client.post(f'/api/v1/images/{image_id}/mask', data=data.tobytes(),
                           content_type='application/octet-stream')
    assert response.status_code == status


def test_secret_key_is_kept_and_private(tmp_path):
    key = load_secret_key(tmp_path)
    assert len(key) == 32
    assert load_secret_key(tmp_path) == key
    assert os.listdir(tmp_path) == ['secret_key']
    if os.name == 'posix':
        assert stat.S_IMODE((tmp_path / 'secret_key').stat().st_mode) == 0o600


def test_each_project_has_its_own_key(tmp_path):
    (tmp_path / 'a').mkdir()
    (tmp_path / 'b').mkdir()
    assert load_secret_key(tmp_path / 'a') != load_secret_key(tmp_path / 'b')


def test_a_damaged_key_is_not_used(tmp_path):
    (tmp_path / 'secret_key').write_bytes(b'')
    with pytest.raises(ValueError, match='not a valid key'):
        load_secret_key(tmp_path)


def test_missing_folder_gets_a_key_for_this_run(tmp_path, capsys):
    assert len(load_secret_key(tmp_path / 'nowhere')) == 32
    assert 'log everyone out' in capsys.readouterr().out


def test_app_uses_the_key_of_the_project(tmp_path, write_tif, write_project):
    write_tif(tmp_path / 'a.tif')
    file = write_project({'S': str(tmp_path / '{id}.tif')})
    first, second = create_app(file), create_app(file)
    assert first.config['SECRET_KEY'] == second.config['SECRET_KEY']
    assert first.config['SECRET_KEY'] == load_secret_key(first.extensions['iris']['path'])
