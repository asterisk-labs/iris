import json

import numpy as np
import pytest
import yaml
from skimage.io import imsave

from iris.project import project


def test_get_metadata_json_yaml_and_raw(tmp_path, project_snapshot):
    # prepare project config
    project.file = str(tmp_path / "proj.json")
    project.config = {"images": {}}

    # JSON metadata
    j = tmp_path / "meta.json"
    j.write_text(json.dumps({"location": [1, 2]}))
    project["images"] = {"metadata": str(j)}
    md = project.get_metadata("1")
    assert md.get("location") == [1, 2]

    # YAML metadata
    y = tmp_path / "meta.yaml"
    y.write_text(yaml.safe_dump({"foo": "bar"}))
    project["images"] = {"metadata": str(y)}
    md2 = project.get_metadata("1")
    assert md2.get("foo") == "bar"

    # Raw text fallback (unknown extension)
    r = tmp_path / "meta.txt"
    r.write_text("hello world")
    project["images"] = {"metadata": str(r)}
    md3 = project.get_metadata("1")
    assert md3.get("__body__") == "hello world"


def test_get_thumbnail_and_image_path_and_bands(tmp_path, project_snapshot, monkeypatch):
    # setup a small thumbnail
    img = (np.arange(6).reshape(3, 2)).astype(np.uint8)
    thumb = tmp_path / "thumb.png"
    imsave(str(thumb), img)

    project["images"] = {"thumbnails": str(thumb)}
    t = project.get_thumbnail("1")
    assert t.shape[0] == 3

    # image path non-dict
    project["images"] = {"path": str(tmp_path / "{id}.npy")}
    pth = project.get_image_path("X")
    assert "{id}" not in pth

    # get_image_bands reads band counts from the file headers, for a single
    # file and for a dict of files, without loading pixels
    np.save(str(tmp_path / "1.npy"), np.zeros((2, 2, 3), dtype=np.uint8), allow_pickle=False)
    np.save(str(tmp_path / "1_other.npy"), np.zeros((2, 2), dtype=np.uint8), allow_pickle=False)
    monkeypatch.setattr(project, "load_image", lambda *a, **k: pytest.fail("pixels were loaded"))

    assert project.get_image_bands("1") == ["$B1", "$B2", "$B3"]

    project["images"] = {"path": {
        "main": str(tmp_path / "{id}.npy"),
        "other": str(tmp_path / "{id}_other.npy"),
    }}
    assert project.get_image_bands("1") == ["$main.B1", "$main.B2", "$main.B3", "$other.B1"]
