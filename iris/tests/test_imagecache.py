"""The image cache: the LRU itself, and Project.get_image going through it."""
import os
import time

import numpy as np
import pytest

from iris.imagecache import ImageCache, array_bytes
from iris.project import Project


def _arr(nbytes):
    return np.zeros(nbytes, dtype=np.uint8)


def test_hit_and_miss_counting():
    cache = ImageCache(max_bytes=1000)
    assert cache.get("a") is None
    cache.put("a", _arr(10))
    assert cache.get("a") is not None
    assert (cache.hits, cache.misses) == (1, 1)
    assert "a" in cache


def test_budget_evicts_least_recently_used():
    cache = ImageCache(max_bytes=100)
    cache.put("a", _arr(40))
    cache.put("b", _arr(40))
    cache.get("a")  # a is now more recent than b
    cache.put("c", _arr(40))  # over budget: b goes
    assert "a" in cache
    assert "b" not in cache
    assert "c" in cache
    assert cache.nbytes == 80
    assert len(cache) == 2


def test_value_larger_than_budget_is_not_stored():
    cache = ImageCache(max_bytes=10)
    cache.put("big", _arr(11))
    assert len(cache) == 0
    assert cache.get("big") is None


def test_zero_budget_disables_cache():
    cache = ImageCache.from_mb(0)
    cache.put("a", {"B1": _arr(1)})
    assert len(cache) == 0


def test_dict_values_are_sized_and_frozen():
    value = {"B1": _arr(5), "nested": {"B2": _arr(7)}}
    assert array_bytes(value) == 12
    cache = ImageCache(max_bytes=100)
    cache.put("k", value)
    with pytest.raises(ValueError):
        value["B1"][0] = 1


def test_get_or_load_calls_loader_once():
    cache = ImageCache(max_bytes=100)
    calls = []

    def loader():
        calls.append(1)
        return _arr(1)

    cache.get_or_load("k", loader)
    cache.get_or_load("k", loader)
    assert len(calls) == 1


def test_clear():
    cache = ImageCache(max_bytes=100)
    cache.put("a", _arr(1))
    cache.clear()
    assert len(cache) == 0
    assert cache.nbytes == 0


# --- Project.get_image through the cache --------------------------------

def _project_with_npy(tmp_path, image_id="1", shape=(4, 4, 3)):
    p = Project()
    p.file = str(tmp_path / "pr.json")
    p.config = {"images": {"path": str(tmp_path / "{id}.npy")}, "views": {}, "name": "x"}
    np.save(str(tmp_path / f"{image_id}.npy"),
            np.arange(np.prod(shape), dtype=np.uint8).reshape(shape), allow_pickle=False)
    p.image_ids = [image_id]
    p.image_order = [0]
    return p


def test_get_image_is_cached_per_band_selection(tmp_path, monkeypatch):
    p = _project_with_npy(tmp_path)
    loads = []
    real = p.load_image
    monkeypatch.setattr(p, "load_image", lambda *a, **k: loads.append(a) or real(*a, **k))

    first = p.get_image("1", bands=["$B1", "$B2"])
    again = p.get_image("1", bands=["$B1", "$B2"])
    assert len(loads) == 1
    assert set(first) == {"$B1", "$B2"}
    assert np.array_equal(first["$B1"], again["$B1"])

    p.get_image("1", bands=["$B3"])
    assert len(loads) == 2  # a different selection is a different entry

    p.get_image("1")
    assert len(loads) == 3  # and so is "all bands"
    assert p._image_cache.hits == 1


def test_cached_arrays_are_read_only(tmp_path):
    p = _project_with_npy(tmp_path)
    image = p.get_image("1", bands=["$B1"])
    with pytest.raises(ValueError):
        image["$B1"][0, 0] = 99


def test_rewritten_file_is_reloaded(tmp_path, monkeypatch):
    p = _project_with_npy(tmp_path)
    path = str(tmp_path / "1.npy")
    before = p.get_image("1", bands=["$B1"])["$B1"].copy()

    np.save(path, np.full((4, 4, 3), 7, dtype=np.uint8), allow_pickle=False)
    # Make sure the mtime moves even on a coarse filesystem clock
    os.utime(path, (time.time() + 5, time.time() + 5))

    after = p.get_image("1", bands=["$B1"])["$B1"]
    assert not np.array_equal(before, after)
    assert after[0, 0] == 7


def test_budget_from_config_bounds_memory(tmp_path):
    p = _project_with_npy(tmp_path, shape=(64, 64, 4))  # 4 KiB per band
    p.config["images"]["cache_mb"] = 0.005  # ~5 KiB: one band fits, two do not
    p._image_cache = ImageCache.from_mb(p.config["images"]["cache_mb"])

    p.get_image("1", bands=["$B1"])
    p.get_image("1", bands=["$B2"])
    assert len(p._image_cache) == 1
    assert p._image_cache.nbytes <= p._image_cache.max_bytes


def test_load_from_resets_cache_and_reads_budget(app):
    from iris import get_demo_file
    from iris.project import project

    project.get_image(project.image_ids[0], bands=["$Sentinel2.B1"])
    assert len(project._image_cache) >= 1
    old_cache = project._image_cache

    saved_path = project.config["path"]
    try:
        project.load_from(get_demo_file())
    finally:
        project.config["path"] = saved_path

    assert project._image_cache is not old_cache
    assert len(project._image_cache) == 0
    assert project._image_cache.max_bytes == 1024 * 1024 * 1024


def test_demo_render_hits_cache_second_time(app):
    from iris.project import project

    project._image_cache.clear()
    image_id = project.image_ids[0]
    view = next(v for v in project["views"].values() if v.get("type", "image") == "image")
    misses_before = project._image_cache.misses

    first = project.render_image(image_id, view)
    hits_before = project._image_cache.hits
    second = project.render_image(image_id, view)

    assert project._image_cache.misses > misses_before
    assert project._image_cache.hits > hits_before
    assert np.array_equal(first, second)
