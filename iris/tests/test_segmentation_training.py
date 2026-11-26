"""predict_mask helpers: server-side class filtering and meshgrid features,
and the endpoint surviving a class with too few pixels."""
import json

import numpy as np
import pytest

from iris.segmentation.training import (
    MIN_CLASS_PIXELS,
    filter_training_pixels,
    meshgrid_features,
)


def test_filter_drops_classes_at_or_below_threshold():
    labels = [0] * 11 + [1] * 11 + [2] * 1 + [3] * MIN_CLASS_PIXELS
    indices = list(range(len(labels)))
    kept_indices, kept_labels = filter_training_pixels(indices, labels)
    assert set(kept_labels.tolist()) == {0, 1}
    assert kept_indices.tolist() == list(range(22))


def test_filter_raises_with_fewer_than_two_usable_classes():
    labels = [0] * 11 + [1] * 1
    with pytest.raises(ValueError, match="at least 2 classes"):
        filter_training_pixels(list(range(12)), labels)


def test_filter_raises_on_mismatched_lengths():
    with pytest.raises(ValueError, match="differ in length"):
        filter_training_pixels([1, 2, 3], [0, 0])


def test_filtered_split_cannot_fail_stratification():
    """The case that crashed train_test_split: a class with one sample."""
    from sklearn.model_selection import train_test_split

    labels = np.array([0] * 20 + [1] * 20 + [2])
    indices = np.arange(labels.size)
    with pytest.raises(ValueError):
        train_test_split(indices, labels, stratify=labels, test_size=0.3)

    indices, labels = filter_training_pixels(indices, labels)
    train_test_split(indices, labels, stratify=labels, test_size=0.3)


def test_meshgrid_features_use_configured_rows_and_columns():
    x_grid, y_grid = meshgrid_features((8, 12, 3), "4x2")
    assert x_grid.shape == (8, 12, 1)
    assert y_grid.shape == (8, 12, 1)
    assert sorted(np.unique(x_grid).tolist()) == [0, 1, 2, 3]
    # the stray y_size = 3 override used to make this [0, 1, 2]
    assert sorted(np.unique(y_grid).tolist()) == [0, 1]
    # rows vary down the image, columns across it
    assert np.all(x_grid[:, 0, 0] == x_grid[:, -1, 0])
    assert np.all(y_grid[0, :, 0] == y_grid[-1, :, 0])


def test_meshgrid_features_pixelwise():
    x_grid, y_grid = meshgrid_features((3, 5), "pixelwise")
    assert np.array_equal(x_grid[..., 0], np.arange(3)[:, None].repeat(5, axis=1))
    assert np.array_equal(y_grid[..., 0], np.arange(5)[None, :].repeat(3, axis=0))


def _training_pixels(mask_size, per_class, rng):
    """Random distinct pixel indices labelled round-robin over classes."""
    total = sum(per_class)
    pixels = rng.choice(mask_size, size=total, replace=False).tolist()
    labels = []
    for cls, n in enumerate(per_class):
        labels.extend([cls] * n)
    return pixels, labels


def _mask(response, key="mask"):
    import base64
    return np.frombuffer(base64.b64decode(response.json[key]), dtype=np.uint8)


def _predict(client, project, config, per_class=(60, 60), seed=3):
    image_id = project.image_ids[0]
    width, height = project.get_mask_shape(image_id)
    pixels, labels = _training_pixels(width * height, list(per_class), np.random.RandomState(seed))
    response = client.post(
        f"/api/v1/images/{image_id}/predict",
        data=json.dumps({"user_pixels": pixels, "user_labels": labels}),
        content_type="application/json",
    )
    return response, pixels, labels


@pytest.mark.parametrize("kind", ["lightgbm", "linear"])
def test_predict_returns_mask_errors_and_scores(client, logged_in_user, monkeypatch, project, kind):
    from copy import deepcopy
    config = deepcopy(project.config)
    config["segmentation"]["ai_model"].update({"type": kind, "train_ratio": 0.75})
    monkeypatch.setattr(project, "get_user_config", lambda user_id: config)

    response, pixels, labels = _predict(client, project, config)
    assert response.status_code == 200, response.data
    body = response.json
    assert body["model"]["type"] == kind
    assert body["n_train"] == 90 and body["n_test"] == 30  # round(60 * 0.75) per class
    errors = _mask(response, "errors")
    # Only test pixels are marked, as correct (1) or wrong (2)
    assert (errors > 0).sum() == 30 and set(np.unique(errors)) <= {0, 1, 2}
    assert np.isin(np.flatnonzero(errors), pixels).all()
    matrix = np.array(body["confusion_matrix"])
    assert matrix.shape == (len(project["classes"]),) * 2 and matrix.sum() == 30
    assert (np.trace(matrix) == (errors == 1).sum())
    assert set(body["per_class_accuracy"]) == {"0", "1"}
    assert 0 <= body["overall_accuracy"] <= 1


def test_unknown_model_type_is_a_400(client, logged_in_user, monkeypatch, project):
    from copy import deepcopy
    config = deepcopy(project.config)
    config["segmentation"]["ai_model"]["type"] = "transformer"
    monkeypatch.setattr(project, "get_user_config", lambda user_id: config)
    response, _, _ = _predict(client, project, config)
    assert response.status_code == 400 and b"Unknown ai_model.type" in response.data


def test_split_is_seeded_and_per_class():
    from iris.ml.sampling import split_train_test
    pixels = np.arange(100)
    labels = np.repeat([0, 1, 2], [50, 45, 5])
    a = split_train_test(pixels, labels, 0.8, 30)
    b = split_train_test(pixels, labels, 0.8, 30)
    assert np.array_equal(a.train_pixels, b.train_pixels)
    assert a.classes == [0, 1]  # class 2 has too few pixels
    assert np.bincount(a.train_labels).tolist() == [30, 30]  # capped at 30
    assert len(a.test_pixels) == 20 + 15
    assert not set(a.train_pixels) & set(a.test_pixels)


def test_score_uses_the_iris_formula():
    from iris.ml.sampling import Split, score
    split = Split([0, 1], np.array([], int), np.array([], int), np.array([0, 1, 2, 3]), np.array([0, 0, 1, 1]))
    predictions = np.array([0, 1, 1, 1], np.uint8)
    errors, metrics = score(predictions, split, 3)
    assert errors.tolist() == [1, 2, 1, 1]
    assert metrics["confusion_matrix"] == [[1, 1, 0], [0, 2, 0], [0, 0, 0]]
    assert metrics["per_class_accuracy"] == {"0": 0.5, "1": 1.0}
    assert metrics["overall_accuracy"] == 2 * 0.5 * 1.0 / 1.5
    assert metrics["worst_class"] == 0


def test_predict_mask_ignores_a_class_with_one_pixel(client, logged_in_user, project):

    image_id = project.image_ids[0]
    width, height = project.get_mask_shape(image_id)
    pixels, labels = _training_pixels(width * height, [40, 40, 1], np.random.RandomState(0))

    response = client.post(
        f"/api/v1/images/{image_id}/predict",
        data=json.dumps({"user_pixels": pixels, "user_labels": labels}),
        content_type="application/json",
    )

    assert response.status_code == 200, response.data
    predictions = _mask(response)
    assert predictions.size == width * height
    assert set(np.unique(predictions).tolist()) <= {0, 1}


def test_predict_mask_rejects_a_single_usable_class(client, logged_in_user, project):

    image_id = project.image_ids[0]
    width, height = project.get_mask_shape(image_id)
    pixels, labels = _training_pixels(width * height, [40, 3], np.random.RandomState(1))

    response = client.post(
        f"/api/v1/images/{image_id}/predict",
        data=json.dumps({"user_pixels": pixels, "user_labels": labels}),
        content_type="application/json",
    )

    assert response.status_code == 400
    assert b"at least 2 classes" in response.data


def test_predict_mask_with_meshgrid_and_edges(client, logged_in_user, monkeypatch, project):
    """The optional features run end to end on the demo image."""
    from copy import deepcopy


    config = deepcopy(project.config)
    config["segmentation"]["ai_model"].update({"use_meshgrid": True, "use_edge_filter": True, "meshgrid_cells": "4x2"})
    monkeypatch.setattr(project, "get_user_config", lambda user_id: config)

    image_id = project.image_ids[0]
    width, height = project.get_mask_shape(image_id)
    pixels, labels = _training_pixels(width * height, [40, 40], np.random.RandomState(2))

    response = client.post(
        f"/api/v1/images/{image_id}/predict",
        data=json.dumps({"user_pixels": pixels, "user_labels": labels}),
        content_type="application/json",
    )

    assert response.status_code == 200, response.data
    assert _mask(response).size == width * height


def test_image_bands_follow_the_order_of_image_dict_to_array():
    from iris.segmentation import image_dict_to_array
    from iris.segmentation.training import image_bands
    rng = np.random.default_rng(0)
    image = {"A": {"B1": rng.random((4, 5)), "B2": rng.random((4, 5))}, "C": {"B1": rng.random((4, 5))}}
    assert np.array_equal(np.dstack(image_bands(image)), image_dict_to_array(image))


@pytest.mark.parametrize("dtype", [np.int16, np.float64])
def test_predicting_in_strips_matches_one_stacked_array(dtype):
    import lightgbm as lgb

    from iris.segmentation.training import feature_rows, predict_in_strips
    rng = np.random.default_rng(1)
    features = [(rng.random((50, 30)) * 1000).astype(dtype) for _ in range(6)]
    stacked = np.dstack(features).reshape(-1, 6)
    labels = (stacked[:, 0] > 500).astype(int) + (stacked[:, 1] > 500)
    train = rng.choice(len(stacked), 300, replace=False)
    model = lgb.LGBMClassifier(n_estimators=10, n_jobs=1, verbose=-1).fit(feature_rows(features, train), labels[train])
    assert np.array_equal(feature_rows(features, train), stacked[train])
    assert np.array_equal(predict_in_strips(model, features, rows=7), model.predict(stacked))
