"""Splitting the pixels a user painted into training and test pixels."""
from dataclasses import dataclass

import numpy as np

from iris.segmentation.training import filter_training_pixels


@dataclass
class Split:
    classes: list
    train_pixels: np.ndarray
    train_labels: np.ndarray
    test_pixels: np.ndarray
    test_labels: np.ndarray


def split_train_test(pixels, labels, train_ratio, max_train_pixels, seed=42):
    """Per class, round(count * train_ratio) pixels, at most max_train_pixels,
    for training and the rest for testing, after a seeded shuffle.

    Only classes with more than MIN_CLASS_PIXELS painted pixels take part;
    ValueError when fewer than two remain.
    """
    pixels, labels = filter_training_pixels(pixels, labels)
    classes = sorted(int(c) for c in np.unique(labels))
    order = np.random.RandomState(seed).permutation(len(pixels))
    train = np.zeros(len(pixels), bool)
    for c in classes:
        of_class = order[labels[order] == c]
        quota = min(int(len(of_class) * train_ratio + 0.5), max_train_pixels)
        train[of_class[:quota]] = True
    return Split(classes, pixels[train], labels[train], pixels[~train], labels[~train])


def score(predictions, split, class_count):
    """Errors mask, confusion matrix and accuracies on the test pixels.

    The overall score is n * prod(accuracy) / sum(accuracy) over the classes
    that took part, as IRIS has always computed it: it punishes one bad class
    more than a mean would.
    """
    guess = predictions[split.test_pixels]
    errors = np.zeros(len(predictions), np.uint8)
    errors[split.test_pixels] = np.where(guess == split.test_labels, 1, 2)
    matrix = np.zeros((class_count, class_count), int)
    np.add.at(matrix, (split.test_labels, guess), 1)
    accuracy = {}
    for c in split.classes:
        tested = matrix[c].sum()
        accuracy[c] = float(matrix[c, c] / tested) if tested else float('nan')
    values = list(accuracy.values())
    total = sum(values)
    overall = len(values) * float(np.prod(values)) / total if total > 0 else 0.0
    worst = min(accuracy, key=accuracy.get) if accuracy else None
    return errors, {
        'confusion_matrix': matrix.tolist(),
        'per_class_accuracy': {str(c): a for c, a in accuracy.items()},
        'overall_accuracy': overall,
        'worst_class': worst,
        'n_train': int(len(split.train_pixels)),
        'n_test': int(len(split.test_pixels)),
    }
