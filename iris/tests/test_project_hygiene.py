"""T0.6: configured path honoured, render_image independent of the global
project, colormaps via matplotlib.colormaps, n_jobs from config."""
import json
import os

import numpy as np
import pytest

from iris.project import Project


def _write_project(tmp_path, extra=None, name="hyg"):
    """A one-image npy project file in tmp_path; returns its path."""
    np.save(str(tmp_path / "1.npy"), np.zeros((4, 4, 1), dtype=np.uint8), allow_pickle=False)
    config = {
        "name": name,
        "images": {"path": "{id}.npy"},
        "views": {"v": {"type": "image", "data": "$B1"}},
        "classes": [{"name": "a", "colour": [0, 0, 0, 255]}],
        "segmentation": {"path": "masks/{id}.png"},
    }
    config.update(extra or {})
    path = tmp_path / "project.json"
    path.write_text(json.dumps(config))
    return str(path)


def test_configured_path_is_honoured(tmp_path):
    file = _write_project(tmp_path, {"path": "elsewhere"})
    p = Project()
    p.load_from(file)
    assert p["path"] == str(tmp_path / "elsewhere")
    assert os.path.isdir(tmp_path / "elsewhere" / "user_config")
    assert not os.path.exists(tmp_path / "hyg.iris")


def test_default_path_when_none_configured(tmp_path):
    file = _write_project(tmp_path)
    p = Project()
    p.load_from(file)
    assert p["path"] == str(tmp_path / "hyg.iris")


def test_default_segmentation_path_when_none_configured(tmp_path):
    file = _write_project(tmp_path, {"segmentation": {}})
    p = Project()
    p.load_from(file)
    assert p.segmentation
    assert p["segmentation"]["path"] == str(tmp_path / "hyg.iris" / "segmentation" / "{id}" / "mask.png")


def test_warns_when_configured_and_default_folders_both_exist(tmp_path, capsys):
    (tmp_path / "hyg.iris").mkdir()
    file = _write_project(tmp_path, {"path": "elsewhere"})
    Project().load_from(file)
    out = capsys.readouterr().out
    assert "Warning" in out
    assert "hyg.iris" in out
    assert "elsewhere" in out


def test_no_warning_without_a_stale_default_folder(tmp_path, capsys):
    file = _write_project(tmp_path, {"path": "elsewhere"})
    Project().load_from(file)
    assert "Warning: using path" not in capsys.readouterr().out


def test_render_image_uses_own_shape_not_global(tmp_path, project):
    """A standalone Project renders from its own config even when the app's
    project (the demo) has a different image size."""

    np.save(str(tmp_path / "1.npy"), np.zeros((3, 5, 1), dtype=np.uint8), allow_pickle=False)
    p = Project()
    p.file = str(tmp_path / "pr.json")
    p.config = {"images": {"path": str(tmp_path / "{id}.npy")}, "views": {}, "name": "x"}
    p.image_ids = ["1"]

    # A constant expression has no shape of its own, so the shape must come
    # from this project's image, not the demo's
    out = p.render_image("1", {"name": "c", "data": ["1", "0.5", "0"]})
    assert out.shape == (3, 5, 3)
    assert out.shape[:2] != project.get_image_shape(project.image_ids[0])


def test_single_band_view_uses_matplotlib_colormaps(tmp_path, monkeypatch):
    import matplotlib

    np.save(str(tmp_path / "1.npy"), np.arange(16, dtype=np.uint8).reshape(4, 4, 1), allow_pickle=False)
    p = Project()
    p.file = str(tmp_path / "pr.json")
    p.config = {"images": {"path": str(tmp_path / "{id}.npy")}, "views": {}, "name": "x"}
    p.image_ids = ["1"]

    out = p.render_image("1", {"name": "g", "data": ["$B1"], "cmap": "viridis"})
    expected = (255 * matplotlib.colormaps["viridis"](np.arange(16).reshape(4, 4) / 15)[..., :3]).astype("uint8")
    assert out.shape == (4, 4, 3)
    assert np.array_equal(out, expected)

    with pytest.raises(KeyError):
        p.render_image("1", {"name": "g", "data": ["$B1"], "cmap": "no-such-colormap"})


def test_default_config_sets_n_jobs():
    default_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "default_config.json")
    with open(default_file) as f:
        defaults = json.load(f)
    assert defaults["segmentation"]["ai_model"]["n_jobs"] == 4


def test_bing_views_are_dropped_on_load(tmp_path, capsys):
    file = _write_project(tmp_path, {
        "views": {"Bing": {"type": "bingmap"}, "Grey": {"type": "image", "data": "$B1"}},
        "view_groups": {"default": ["Bing", "Grey"]},
    })
    p = Project()
    p.load_from(file)
    assert list(p['views']) == ["Grey"]
    assert p['view_groups'] == {"default": ["Grey"]}
    assert "no longer supported" in capsys.readouterr().out


def test_users_can_be_added_to_a_database_with_the_old_tested_column(app):
    from iris.models import User, db
    user = User(name="new")
    db.session.add(user)
    db.session.commit()
    assert db.session.execute(db.text("select tested from user")).scalar() == 0
    assert "tested" not in user.to_json()


def test_users_cannot_override_n_jobs(project, app):
    project.save_user_config(77, {"segmentation": {"ai_model": {"n_jobs": -1, "max_depth": 7}}})
    ai_model = project.get_user_config(77)["segmentation"]["ai_model"]
    assert ai_model["n_jobs"] == 4
    assert ai_model["max_depth"] == 7
