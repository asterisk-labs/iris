"""predict_mask helpers: server-side class filtering and meshgrid features,
and the endpoint surviving a class with too few pixels."""
import json

import numpy as np
import pytest

from iris.segmentation.training import (
    MIN_CLASS_PIXELS, filter_training_pixels, meshgrid_features,
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


def test_predict_mask_ignores_a_class_with_one_pixel(client, logged_in_user):
    from iris.project import project

    image_id = project.image_ids[0]
    width, height = project.get_mask_shape(image_id)
    pixels, labels = _training_pixels(width * height, [40, 40, 1], np.random.RandomState(0))

    response = client.post(
        f"/segmentation/predict_mask/{image_id}",
        data=json.dumps({"user_pixels": pixels, "user_labels": labels}),
        content_type="application/json",
    )

    assert response.status_code == 200, response.data
    predictions = np.frombuffer(response.data, dtype=np.uint8)
    assert predictions.size == width * height
    assert set(np.unique(predictions).tolist()) <= {0, 1}


def test_predict_mask_rejects_a_single_usable_class(client, logged_in_user):
    from iris.project import project

    image_id = project.image_ids[0]
    width, height = project.get_mask_shape(image_id)
    pixels, labels = _training_pixels(width * height, [40, 3], np.random.RandomState(1))

    response = client.post(
        f"/segmentation/predict_mask/{image_id}",
        data=json.dumps({"user_pixels": pixels, "user_labels": labels}),
        content_type="application/json",
    )

    assert response.status_code == 400
    assert b"at least 2 classes" in response.data


def test_predict_mask_with_meshgrid_and_edges(client, logged_in_user, monkeypatch):
    """The optional features run end to end on the demo image."""
    from copy import deepcopy

    from iris.project import project

    config = deepcopy(project.config)
    config["segmentation"]["ai_model"].update({"use_meshgrid": True, "use_edge_filter": True, "meshgrid_cells": "4x2"})
    monkeypatch.setattr(project, "get_user_config", lambda user_id: config)

    image_id = project.image_ids[0]
    width, height = project.get_mask_shape(image_id)
    pixels, labels = _training_pixels(width * height, [40, 40], np.random.RandomState(2))

    response = client.post(
        f"/segmentation/predict_mask/{image_id}",
        data=json.dumps({"user_pixels": pixels, "user_labels": labels}),
        content_type="application/json",
    )

    assert response.status_code == 200, response.data
    assert len(response.data) == width * height
