import json

import numpy as np
import rasterio as rio

from iris.project import Project

ORIGIN = rio.transform.from_origin(500000, 4000000, 10, 10)


def _tif(path, crs='EPSG:32633'):
    profile = {
        'driver': 'GTiff', 'width': 64, 'height': 64, 'count': 1, 'dtype': 'uint8',
        'crs': crs, 'transform': ORIGIN if crs else rio.transform.from_origin(0, 64, 1, 1),
    }
    with rio.open(path, 'w', **profile) as file:
        file.write(np.zeros((1, 64, 64), np.uint8))


def _project(tmp_path, paths, mask_area=None):
    config = {
        "images": {"path": paths},
        "classes": [{"name": "a", "colour": [0, 0, 0, 0]}, {"name": "b", "colour": [1, 1, 1, 1]}],
        "views": {"v": {"type": "image", "data": "$B1"}},
        "segmentation": {"path": str(tmp_path / "masks" / "{id}.png"), "mask_encoding": "rgb"},
    }
    if mask_area:
        config["segmentation"]["mask_area"] = mask_area
    path = tmp_path / "p.json"
    path.write_text(json.dumps(config))
    project = Project()
    project.load_from(str(path))
    return project


def test_georef_of_a_geotiff(tmp_path):
    _tif(tmp_path / "a.tif")
    crs, transform = _project(tmp_path, str(tmp_path / "{id}.tif")).get_georef("a")
    assert crs == rio.crs.CRS.from_epsg(32633)
    assert transform == ORIGIN


def test_georef_starts_at_the_mask_area(tmp_path):
    _tif(tmp_path / "a.tif")
    project = _project(tmp_path, str(tmp_path / "{id}.tif"), mask_area=[8, 16, 40, 48])
    _, transform = project.get_georef("a")
    assert transform * (0, 0) == (500080, 3999840)


def test_georef_from_the_first_source_with_a_crs(tmp_path):
    _tif(tmp_path / "a_s1.tif", crs=None)
    _tif(tmp_path / "a_s2.tif")
    crs, transform = _project(tmp_path, {
        "S1": str(tmp_path / "{id}_s1.tif"),
        "S2": str(tmp_path / "{id}_s2.tif"),
    }).get_georef("a")
    assert crs == rio.crs.CRS.from_epsg(32633)
    assert transform == ORIGIN


def test_no_crs_keeps_pixel_coordinates(tmp_path):
    np.save(tmp_path / "a.npy", np.zeros((64, 64, 3), np.uint8))
    crs, transform = _project(tmp_path, str(tmp_path / "{id}.npy")).get_georef("a")
    assert crs is None
    assert transform == rio.transform.from_bounds(0, 0, 64, 64, 64, 64)
