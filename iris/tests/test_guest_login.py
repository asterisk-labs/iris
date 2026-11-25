from iris.models import User


def test_guests_enter_as_new_users_and_never_as_admin(client, project, project_snapshot):
    project.config["guests"] = True

    response = client.post("/api/v1/auth/guest")

    assert response.status_code == 200
    guest = User.query.one()
    assert guest.name.startswith("guest-")
    # The first user who registers becomes an admin, a guest must not
    assert not guest.admin
    assert client.get("/api/v1/auth/session").get_json()["user"]["name"] == guest.name


def test_guests_are_turned_away_unless_the_project_takes_them(client, project, project_snapshot):
    project.config.pop("guests", None)

    assert client.post("/api/v1/auth/guest").status_code == 403
    assert User.query.count() == 0


def test_the_page_says_whether_guests_may_enter(client, project, project_snapshot):
    project.config["guests"] = True
    assert b'"guests": true' in client.get("/segmentation/").data

    project.config["guests"] = False
    assert b'"guests": false' in client.get("/segmentation/").data
