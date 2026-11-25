import json

import numpy as np
import rasterio as rio

from iris.project import Project, band_layout_problem


def _tif(path, bands, interleave='band', tiled=True):
    """A 64 x 64 float32 GeoTIFF."""
    profile = {
        'driver': 'GTiff', 'width': 64, 'height': 64, 'count': bands, 'dtype': 'float32',
        'interleave': interleave, 'tiled': tiled,
        'crs': 'EPSG:32633', 'transform': rio.transform.from_origin(500000, 4000000, 10, 10),
    }
    if tiled:
        profile.update(blockxsize=16, blockysize=16)
    else:
        profile.update(blockysize=4)
    with rio.open(path, 'w', **profile) as file:
        file.write(np.zeros((bands, 64, 64), np.float32))
    return str(path)


def _project(tmp_path, paths):
    config = {
        "images": {"path": paths},
        "classes": [{"name": "a", "colour": [0, 0, 0, 0]}, {"name": "b", "colour": [1, 1, 1, 1]}],
        "views": {"v": {"type": "image", "data": "$B1"}},
        "segmentation": {"path": str(tmp_path / "masks" / "{id}.png"), "mask_encoding": "rgb"},
    }
    path = tmp_path / "p.json"
    path.write_text(json.dumps(config))
    return str(path)


def test_pixel_interleaved_tif_with_many_bands(tmp_path):
    problem = band_layout_problem(_tif(tmp_path / "a.tif", 5, interleave='pixel'), "a.tif")
    assert "5 bands stored pixel interleaved (a.tif)" in problem
    assert "will read all 5" in problem
    assert "INTERLEAVE=BAND" in problem


def test_untiled_tif_with_many_bands(tmp_path):
    problem = band_layout_problem(_tif(tmp_path / "a.tif", 5, tiled=False))
    assert "stored in strips, not tiles" in problem


def test_tiled_band_interleaved_tif_is_fine(tmp_path):
    assert band_layout_problem(_tif(tmp_path / "a.tif", 8)) is None


def test_few_bands_are_never_reported(tmp_path):
    assert band_layout_problem(_tif(tmp_path / "a.tif", 3, interleave='pixel', tiled=False)) is None
    np.save(tmp_path / "rgb.npy", np.zeros((8, 8, 4), np.uint8))
    assert band_layout_problem(str(tmp_path / "rgb.npy")) is None


def test_channels_last_npy_with_many_bands(tmp_path):
    np.save(tmp_path / "cube.npy", np.zeros((8, 8, 6), np.float32))
    problem = band_layout_problem(str(tmp_path / "cube.npy"), "cube.npy")
    assert "6 bands stored channels last (cube.npy)" in problem


def test_loading_warns_once_per_source(tmp_path, capsys):
    for image_id in ("a", "b"):
        _tif(tmp_path / f"{image_id}_s2.tif", 6, interleave='pixel')
        _tif(tmp_path / f"{image_id}_rgb.tif", 3, interleave='pixel')
    Project().load_from(_project(tmp_path, {
        "Sentinel2": str(tmp_path / "{id}_s2.tif"),
        "RGB": str(tmp_path / "{id}_rgb.tif"),
    }))

    out = capsys.readouterr().out
    assert out.count("Warning: Sentinel2: 6 bands stored pixel interleaved (a_s2.tif)") == 1
    assert "b_s2.tif" not in out
    assert "RGB" not in out


def test_loading_a_well_stored_project_says_nothing(tmp_path, capsys):
    _tif(tmp_path / "a.tif", 12)
    Project().load_from(_project(tmp_path, {"Sentinel2": str(tmp_path / "{id}.tif")}))
    assert "Warning" not in capsys.readouterr().out
