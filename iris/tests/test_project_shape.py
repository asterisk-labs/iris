"""images.shape is optional and derived; mask_area is optional and per image."""
import json

import numpy as np
import pytest

from iris.project import Project


def _write(tmp_path, images, config_extra=None, mask_area="unset"):
    """Write npy images {id: (h, w)} and a config; return the config path."""
    for image_id, (h, w) in images.items():
        np.save(tmp_path / f"{image_id}.npy", np.zeros((h, w, 3), np.uint8))
    config = {
        "images": {"path": str(tmp_path / "{id}.npy")},
        "classes": [{"name": "a", "colour": [0, 0, 0, 0]}, {"name": "b", "colour": [1, 1, 1, 1]}],
        "views": {"v": {"type": "image", "data": "$B1"}},
        "segmentation": {"path": str(tmp_path / "masks" / "{id}.png"), "mask_encoding": "rgb"},
    }
    if mask_area != "unset":
        config["segmentation"]["mask_area"] = mask_area
    if config_extra:
        for k, v in config_extra.items():
            config.setdefault(k, {}).update(v)
    path = tmp_path / "p.json"
    path.write_text(json.dumps(config))
    return path


def test_shape_is_derived_when_absent(tmp_path):
    p = Project()
    p.load_from(str(_write(tmp_path, {"a": (30, 40)})))
    assert p["images"]["shape"] == [30, 40]  # [height, width]
    assert p.configured_shape is None
    assert p.get_image_shape("a") == (30, 40)


def test_configured_shape_must_match_in_height_width_order(tmp_path):
    ok = _write(tmp_path, {"a": (30, 40)}, {"images": {"shape": [30, 40]}})
    p = Project()
    p.load_from(str(ok))
    assert p.configured_shape == [30, 40]

    swapped = _write(tmp_path, {"a": (30, 40)}, {"images": {"shape": [40, 30]}})
    with pytest.raises(Exception, match=r"\[height, width\]"):
        Project().load_from(str(swapped))

    wrong = _write(tmp_path, {"a": (30, 40)}, {"images": {"shape": [10, 10]}})
    with pytest.raises(Exception, match="does not match"):
        Project().load_from(str(wrong))


def test_mask_area_defaults_to_whole_image_per_image(tmp_path):
    p = Project()
    p.load_from(str(_write(tmp_path, {"a": (30, 40), "b": (12, 16)})))
    assert p["segmentation"]["mask_area"] is None
    assert p.get_mask_area("a") == [0, 0, 40, 30]
    assert p.get_mask_shape("a") == (40, 30)  # (width, height)
    assert p.get_mask_area("b") == [0, 0, 16, 12]
    assert p.get_mask_shape("b") == (16, 12)


def test_configured_mask_area_applies_to_every_image(tmp_path):
    p = Project()
    p.load_from(str(_write(tmp_path, {"a": (30, 40), "b": (30, 40)}, mask_area=[2, 4, 22, 14])))
    assert p.get_mask_area("b") == [2, 4, 22, 14]
    assert p.get_mask_shape("b") == (20, 10)
    assert p["segmentation"]["mask_shape"] == (20, 10)


def test_bad_mask_area_is_rejected(tmp_path):
    with pytest.raises(Exception, match="mask_area"):
        Project().load_from(str(_write(tmp_path, {"a": (30, 40)}, mask_area=[5, 5, 5, 20])))


def test_scalar_band_broadcasts_to_the_image_shape(tmp_path):
    p = Project()
    p.load_from(str(_write(tmp_path, {"a": (30, 40)}, {"views": {"c": {"type": "image", "data": ["$pictures.B1", "0.5", "1"]}}})))
    img = p.render_image("a", p["views"]["c"])
    assert img.shape == (30, 40, 3)
