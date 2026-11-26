import numpy as np
import rasterio as rio

from iris.project import Project

UTM_33N = rio.crs.CRS.from_epsg(32633)
ORIGIN = rio.transform.from_origin(500000, 4000000, 10, 10)


def _load(path):
    project = Project()
    project.load_from(path)
    return project


def test_georef_of_a_geotiff(tmp_path, write_tif, write_project):
    write_tif(tmp_path / "a.tif")
    project = _load(write_project(str(tmp_path / "{id}.tif")))
    assert project.get_georef("a") == (UTM_33N, ORIGIN)


def test_georef_starts_at_the_mask_area(tmp_path, write_tif, write_project):
    write_tif(tmp_path / "a.tif")
    project = _load(write_project(str(tmp_path / "{id}.tif"), mask_area=[8, 16, 40, 48]))
    _, transform = project.get_georef("a")
    assert transform * (0, 0) == (500080, 3999840)


def test_georef_from_the_first_source_with_a_crs(tmp_path, write_tif, write_project):
    write_tif(tmp_path / "a_s1.tif", crs=None)
    write_tif(tmp_path / "a_s2.tif")
    project = _load(write_project({
        "S1": str(tmp_path / "{id}_s1.tif"),
        "S2": str(tmp_path / "{id}_s2.tif"),
    }))
    assert project.get_georef("a") == (UTM_33N, ORIGIN)


def test_no_georef_without_a_crs(tmp_path, write_project):
    np.save(tmp_path / "a.npy", np.zeros((64, 64, 3), np.uint8))
    project = _load(write_project(str(tmp_path / "{id}.npy")))
    assert project.get_georef("a") == (None, None)
    assert project.get_corners("a") is None


def test_corners_of_the_image_in_longitude_and_latitude(tmp_path, write_tif, write_project):
    write_tif(tmp_path / "a.tif")
    project = _load(write_project(str(tmp_path / "{id}.tif"), mask_area=[8, 16, 40, 48]))
    height, width = project.get_image_shape("a")

    corners = project.get_corners("a")

    # Of the whole image, not the mask area, clockwise from the top left
    utm = [ORIGIN * pixel for pixel in [(0, 0), (width, 0), (width, height), (0, height)]]
    expected = zip(*rio.warp.transform(UTM_33N, "EPSG:4326", *zip(*utm, strict=True)), strict=True)
    np.testing.assert_allclose(corners, list(expected))
    assert corners[0][0] < corners[1][0] and corners[0][1] > corners[3][1]
