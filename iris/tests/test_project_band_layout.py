import numpy as np

from iris.project import Project, band_layout_problem


def test_pixel_interleaved_tif_with_many_bands(tmp_path, write_tif):
    problem = band_layout_problem(write_tif(tmp_path / "a.tif", 5, interleave='pixel'), "a.tif")
    assert "5 bands stored pixel interleaved (a.tif)" in problem
    assert "will read all 5" in problem
    assert "INTERLEAVE=BAND" in problem


def test_untiled_tif_with_many_bands(tmp_path, write_tif):
    problem = band_layout_problem(write_tif(tmp_path / "a.tif", 5, tiled=False))
    assert "stored in strips, not tiles" in problem


def test_tiled_band_interleaved_tif_is_fine(tmp_path, write_tif):
    assert band_layout_problem(write_tif(tmp_path / "a.tif", 8)) is None


def test_few_bands_are_never_reported(tmp_path, write_tif):
    assert band_layout_problem(write_tif(tmp_path / "a.tif", 3, interleave='pixel', tiled=False)) is None
    np.save(tmp_path / "rgb.npy", np.zeros((8, 8, 4), np.uint8))
    assert band_layout_problem(str(tmp_path / "rgb.npy")) is None


def test_channels_last_npy_with_many_bands(tmp_path):
    np.save(tmp_path / "cube.npy", np.zeros((8, 8, 6), np.float32))
    problem = band_layout_problem(str(tmp_path / "cube.npy"), "cube.npy")
    assert "6 bands stored channels last (cube.npy)" in problem


def test_loading_warns_once_per_source(tmp_path, capsys, write_tif, write_project):
    for image_id in ("a", "b"):
        write_tif(tmp_path / f"{image_id}_s2.tif", 6, interleave='pixel')
        write_tif(tmp_path / f"{image_id}_rgb.tif", 3, interleave='pixel')
    Project().load_from(write_project({
        "Sentinel2": str(tmp_path / "{id}_s2.tif"),
        "RGB": str(tmp_path / "{id}_rgb.tif"),
    }))

    out = capsys.readouterr().out
    assert out.count("Warning: Sentinel2: 6 bands stored pixel interleaved (a_s2.tif)") == 1
    assert "b_s2.tif" not in out
    assert "RGB" not in out


def test_loading_a_well_stored_project_says_nothing(tmp_path, capsys, write_tif, write_project):
    write_tif(tmp_path / "a.tif", 12)
    Project().load_from(write_project({"Sentinel2": str(tmp_path / "{id}.tif")}))
    assert "Warning" not in capsys.readouterr().out
