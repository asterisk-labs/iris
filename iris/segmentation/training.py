"""Helpers for fitting the per-image AI model in predict_mask.

Kept out of iris/segmentation/__init__.py so they can be tested without
a Flask request.
"""
import numpy as np

# The browser only trains on classes with more than this many painted
# pixels (src/segmentation/ai/sampling.ts). The server applies the same
# rule so that a stray class with one or two pixels, from any client,
# cannot make the stratified split fail.
MIN_CLASS_PIXELS = 10
MIN_CLASSES = 2


def filter_training_pixels(indices, labels, min_pixels=MIN_CLASS_PIXELS):
    """Keep only pixels of classes that have more than `min_pixels` samples.

    Returns (indices, labels) as arrays. Raises ValueError when fewer than
    MIN_CLASSES classes remain, since there is nothing to learn from one.
    """
    indices = np.asarray(indices)
    labels = np.asarray(labels)
    if indices.shape != labels.shape:
        raise ValueError(
            f'user_pixels and user_labels differ in length '
            f'({indices.size} vs {labels.size})'
        )

    classes, counts = np.unique(labels, return_counts=True)
    usable = classes[counts > min_pixels]
    if usable.size < MIN_CLASSES:
        raise ValueError(
            f'You need more than {min_pixels} pixels for at least '
            f'{MIN_CLASSES} classes to use the AI; got '
            + ', '.join(f'class {c}: {n}' for c, n in zip(classes, counts))
        )

    keep = np.isin(labels, usable)
    return indices[keep], labels[keep]


def meshgrid_features(shape, cells):
    """Two (height, width, 1) arrays giving each pixel's cell row and
    column, for `cells` of the form "3x3" or "pixelwise".

    These are appended to the per-pixel inputs when use_meshgrid is on, so
    the model can learn position as well as spectra.
    """
    height, width = shape[0], shape[1]
    if cells == 'pixelwise':
        rows, cols = height, width
    else:
        rows, cols = map(int, cells.split('x'))
    # Even cells covering the whole image; the old repeat-based version
    # oversized the cells so the last row and column of cells never
    # appeared.
    x = (np.arange(height) * rows) // height
    y = (np.arange(width) * cols) // width
    x_grid, y_grid = np.meshgrid(x, y, indexing='ij')
    return x_grid[..., np.newaxis], y_grid[..., np.newaxis]
