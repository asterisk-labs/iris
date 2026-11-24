import os

import numpy as np
import pytest
from skimage.io import imsave

from iris.project import Project


def test_make_absolute_varieties(tmp_path, monkeypatch, project):
    # simulate a project.file location
    fake_cfg = tmp_path / "cfg.json"
    fake_cfg.write_text("{}")
    monkeypatch.setattr(project, "file", str(fake_cfg))
    # relative path
    rel = "images/img.tif"
    abs_expected = os.path.normpath(os.path.join(os.path.dirname(str(fake_cfg)), rel))
    assert project.make_absolute(rel) == abs_expected
    # nested structures
    assert project.make_absolute({"a": rel}) == {"a": abs_expected}

    # Use an absolute path that's valid on the current platform
    #   in particular, Win w/py313+ needs "//already/abs" while others "/already/abs"
    already_abs = os.path.abspath(os.path.join(os.sep, "already", "abs"))

    assert project.make_absolute([rel, already_abs]) == [abs_expected, already_abs]


def test_make_absolute_dict_and_list(tmp_path):
    p = Project()
    p.file = str(tmp_path / "project.json")

    rel = "images/{id}.png"
    res = p.make_absolute(rel)
    assert os.path.isabs(res)

    d = {"a": "foo/{id}.png", "b": "bar/{id}.png"}
    out = p.make_absolute(d)
    assert isinstance(out, dict) and "a" in out and os.path.isabs(out["a"])

    lst = ["one/{id}", "two/{id}"]
    out2 = p.make_absolute(lst)
    assert isinstance(out2, list)


def test_image_order_depends_only_on_seed(project_snapshot, project):
    project.image_ids = ["1", "2", "3", "4", "5"]
    first = project.image_order(123)
    assert project.image_order(123) == first
    assert project.image_order(124) != first
    assert sorted(first) == project.image_ids
    # Asking for an order leaves the project's own list alone
    assert project.image_ids == ["1", "2", "3", "4", "5"]
    assert project.get_start_image_id(123) == first[0]


def test_get_image_bands_from_headers(monkeypatch, project):
    """Band names come from the file headers; no pixels are read."""
    import rasterio as rio

    monkeypatch.setattr(project, "load_image", lambda *a, **k: pytest.fail("pixels were loaded"))
    image_id = project.image_ids[0]
    expected = []
    for file_id, filename in project.get_image_path(image_id).items():
        with rio.open(filename) as f:
            expected.extend(f"${file_id}.B{i+1}" for i in range(f.count))

    assert project.get_image_bands(image_id) == expected
    assert len(expected) > 3


def test_load_image_npy_and_png(tmp_path):
    p = Project()
    # create npy
    arr = np.arange(12).reshape(3, 2, 2).astype(np.uint8)
    npyfile = tmp_path / "img.npy"
    np.save(str(npyfile), arr, allow_pickle=False)
    out = p.load_image(str(npyfile))
    assert "B1" in out and out["B1"].shape == (3, 2)

    # create a small PNG (single-band)
    png = tmp_path / "img.png"
    im = (np.arange(6).reshape(3, 2)).astype(np.uint8)
    imsave(str(png), im)
    out2 = p.load_image(str(png))
    assert out2["B1"].ndim == 2
