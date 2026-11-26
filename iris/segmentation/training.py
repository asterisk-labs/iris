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


def image_bands(image_dict):
    """The 2D band arrays from Project.get_image, in the order
    image_dict_to_array stacks them."""
    if isinstance(image_dict, np.ndarray):
        if image_dict.ndim == 2:
            return [image_dict]
        return [image_dict[..., i] for i in range(image_dict.shape[-1])]
    return [band for value in image_dict.values() for band in image_bands(value)]


def feature_dtype(features):
    """float32 for band values, float64 when a feature (e.g. edges) already
    is, so that the model sees the same numbers as with one stacked array."""
    return np.result_type(np.float32, *(f.dtype for f in features))


def feature_rows(features, indices):
    """The feature vectors of the pixels at `indices`, as rows."""
    rows = np.stack([f.ravel()[indices] for f in features], axis=-1)
    return rows.astype(feature_dtype(features))


def predict_in_strips(model, features, rows=32, **kwargs):
    """model.predict over every pixel, a strip of rows at a time.

    Stacking all bands of a whole image into one (pixels, features) array
    and handing it to LightGBM, which converts it to float64, copies
    gigabytes for a cube of embeddings. Strips stay in cache: with 77 bands
    of 1024 x 1024 this took 1 to 2 s instead of 5 to 8 s, with the same
    result.
    """
    height = features[0].shape[0]
    dtype = feature_dtype(features)
    out = []
    for row in range(0, height, rows):
        block = np.stack([f[row:row + rows] for f in features], axis=-1)
        out.append(model.predict(block.reshape(-1, len(features)).astype(dtype), **kwargs))
    return np.concatenate(out)
