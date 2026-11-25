"""The order in which a user is shown a project's images.

Every function here is pure: the order is computed from the image ids, the
user's seed and, optionally, how often each image has been annotated. No
shared list is reordered, so one user's navigation cannot change another
user's sequence.
"""
from collections.abc import Iterable, Mapping, Sequence

import numpy as np

# Weights used by least_annotated_next. An image the user has annotated
# themselves ranks behind any number of other users' annotations, and the
# current image is never chosen while another one is available.
OWN_ANNOTATION_WEIGHT = 9999


def seeded_order(image_ids: Sequence[str], seed: int) -> list:
    """The image ids shuffled with the user's seed.

    Uses the same numpy RandomState shuffle as earlier versions, so a
    given seed produces the same order as before.
    """
    positions = list(range(len(image_ids)))
    np.random.RandomState(seed=seed).shuffle(positions)
    return [image_ids[i] for i in positions]


def next_in_order(order: Sequence[str], image_id: str) -> str:
    """The image after image_id, wrapping round at the end."""
    index = order.index(image_id)
    return order[(index + 1) % len(order)]


def annotation_counts(
    annotations: Iterable[tuple], user_id
) -> dict:
    """How strongly each image is already covered, from one user's view.

    annotations are (image_id, user_id) pairs, one per saved action. Each
    adds one to its image, and the user's own add OWN_ANNOTATION_WEIGHT on
    top, so the user is sent to images nobody has done before images other
    people have done, and to those before ones they did themselves.
    """
    counts = {}
    for image_id, annotator in annotations:
        weight = 1 + (OWN_ANNOTATION_WEIGHT if annotator == user_id else 0)
        counts[image_id] = counts.get(image_id, 0) + weight
    return counts


def least_annotated_next(
    order: Sequence[str], image_id: str, counts: Mapping[str, int]
) -> str:
    """The first image after image_id with the lowest count.

    Searches forward from image_id, wrapping round, so ties go to the image
    that comes next in the user's order. The current image is skipped
    unless it is the only one.
    """
    index = order.index(image_id)
    candidates = [
        order[(index + step) % len(order)] for step in range(1, len(order))
    ]
    if not candidates:
        return image_id
    lowest = min(counts.get(c, 0) for c in candidates)
    return next(c for c in candidates if counts.get(c, 0) == lowest)
