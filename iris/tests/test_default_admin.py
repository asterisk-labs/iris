import pytest

import iris
from iris import create_default_admin
from iris.models import User, db


def _add_user(name, admin):
    user = User(name=name, admin=admin)
    user.set_password('first')
    db.session.add(user)
    db.session.commit()


def _admins():
    return [user.name for user in User.query.filter_by(admin=True)]


@pytest.fixture
def no_prompt(monkeypatch):
    def getpass(prompt):
        raise AssertionError(f'asked for a password: {prompt}')
    monkeypatch.setattr(iris, 'getpass', getpass)


def test_default_admin_is_created_once(app):
    create_default_admin(app, 'boss', 'secret')
    create_default_admin(app, 'boss', 'secret')

    assert _admins() == ['boss']
    assert User.query.filter_by(name='boss').one().check_password('secret')


def test_an_admin_with_another_name_is_kept(app, no_prompt):
    _add_user('someone', admin=True)

    create_default_admin(app)
    create_default_admin(app, 'boss', 'secret')

    assert _admins() == ['someone']


def test_a_regular_user_named_admin_is_not_promoted(app, no_prompt, capsys):
    _add_user('admin', admin=False)

    create_default_admin(app)

    assert _admins() == []
    assert 'the user "admin" exists but is not one' in capsys.readouterr().out


def test_an_admin_can_be_created_next_to_a_regular_user_named_admin(app, no_prompt):
    _add_user('admin', admin=False)

    create_default_admin(app, 'boss', 'secret')

    assert _admins() == ['boss']
