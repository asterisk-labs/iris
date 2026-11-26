import numpy as np
import pytest

from iris.project import Project


def setup_small_project(tmp_path):
    p = Project()
    p.file = str(tmp_path / "pr.json")
    p.config = {
        "images": {"path": str(tmp_path / "{id}.npy"), "shape": (2, 2)},
        "views": {},
        "name": "x",
    }
    # create dummy image file as numpy
    arr = np.arange(4).reshape(2, 2).astype(np.uint8)[..., np.newaxis]
    np.save(str(tmp_path / "1.npy"), arr, allow_pickle=False)
    p.image_ids = ["1"]
    return p


def test_render_view_clip_and_vmin_conflict(tmp_path):
    p = setup_small_project(tmp_path)
    view = {"name": "x", "data": ["$B1"], "clip": 1.0, "vmin": 0.0}
    with pytest.raises(ValueError):
        p.render_image("1", view)


def test_render_single_band_cmap(tmp_path):
    p = setup_small_project(tmp_path)
    view = {"name": "x", "data": ["$B1"], "cmap": "viridis"}
    img = p.render_image("1", view)
    assert img.dtype == np.uint8
    assert img.shape[2] == 3


def _ramp_project(tmp_path):
    p = Project()
    p.file = str(tmp_path / "pr.json")
    p.config = {"images": {"path": str(tmp_path / "{id}.npy")}, "views": {}, "name": "x"}
    np.save(str(tmp_path / "1.npy"), np.arange(0, 200, dtype=np.float32).reshape(10, 20, 1), allow_pickle=False)
    p.image_ids = ["1"]
    return p


@pytest.mark.parametrize("extra", [{}, {"vmin": 20, "vmax": 120}, {"clip": 5}, {"vmin": 50}, {"vmax": 150}])
def test_brightness_one_renders_as_before(tmp_path, extra):
    p = _ramp_project(tmp_path)
    view = {"name": "g", "data": ["$B1"], "cmap": "gray", **extra}
    assert np.array_equal(p.render_image("1", view), p.render_image("1", view, brightness=1.0))


def test_brightness_moves_the_stretch_window(tmp_path):
    p = _ramp_project(tmp_path)
    view = {"name": "g", "data": ["$B1"], "cmap": "gray", "vmin": 0, "vmax": 100}
    grey = lambda brightness: p.render_image("1", view, brightness=brightness)[..., 0].ravel()  # noqa: E731
    # As configured, everything above 100 is clipped to white
    assert (grey(1.0)[100:] == 255).all()
    # Darker: the window reaches 200, so those values are told apart again
    assert len(np.unique(grey(0.5)[100:])) > 50
    # Brighter: the window ends at 50
    assert (grey(2.0)[50:] == 255).all() and grey(2.0)[49] < 255


def test_view_route_takes_brightness(client, logged_in_user, project):
    image_id = project.image_ids[0]
    assert client.get(f"/api/v1/images/{image_id}/views/RGB?brightness=0.5").status_code == 200
    assert client.get(f"/api/v1/images/{image_id}/views/RGB?brightness=0").status_code == 400
    assert client.get(f"/api/v1/images/{image_id}/views/RGB?brightness=nan").status_code == 400
