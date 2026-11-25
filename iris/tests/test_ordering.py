import random

import pytest

from iris.ordering import (
    OWN_ANNOTATION_WEIGHT,
    annotation_counts,
    least_annotated_next,
    next_in_order,
    seeded_order,
)

IDS = ["a", "b", "c", "d", "e", "f"]


def test_seeded_order_matches_earlier_versions():
    # numpy RandomState(0).shuffle(range(6)) is [5, 2, 1, 3, 0, 4]; users who
    # upgrade must keep the order they had.
    assert seeded_order(IDS, 0) == ["f", "c", "b", "d", "a", "e"]
    assert seeded_order(IDS, 123) == ["b", "d", "e", "a", "c", "f"]


def test_seeded_order_does_not_touch_its_input():
    ids = list(IDS)
    seeded_order(ids, 7)
    assert ids == IDS


def test_next_wraps_round():
    assert next_in_order(IDS, "a") == "b"
    assert next_in_order(IDS, "f") == "a"


def test_unknown_image_raises():
    with pytest.raises(ValueError):
        next_in_order(IDS, "z")


def test_annotation_counts_weights_own_annotations():
    counts = annotation_counts([("a", 1), ("a", 2), ("b", 2), ("c", 1)], user_id=1)
    assert counts == {
        "a": 2 + OWN_ANNOTATION_WEIGHT,
        "b": 1,
        "c": 1 + OWN_ANNOTATION_WEIGHT,
    }


def test_least_annotated_next_prefers_unannotated_then_next_in_order():
    # "b" has an annotation; "c" is the first unannotated image after "a"
    # (images missing from counts count as zero)
    assert least_annotated_next(IDS, "a", {"b": 1}) == "c"
    # Searching wraps round from the end of the order
    assert least_annotated_next(IDS, "e", {"f": 3}) == "a"


def test_least_annotated_next_skips_current_image():
    counts = dict.fromkeys(IDS, 5)
    counts["c"] = 0
    assert least_annotated_next(IDS, "c", counts) == "d"


def test_least_annotated_next_with_one_image():
    # The old implementation looped forever here
    assert least_annotated_next(["a"], "a", {}) == "a"


def _old_next(order, current, actions, user_id):
    """get_next_image as it was, minus the swap of the shared list."""
    index = order.index(current)
    mask_count = [0] * len(order)
    mask_count[index] = 99999
    for image_id, annotator in actions:
        mask_count[order.index(image_id)] += 1
        if annotator == user_id:
            mask_count[order.index(image_id)] += 9999
    lowest = min(mask_count)
    trial = index
    while True:
        trial = (trial + 1) % len(order)
        if mask_count[trial] == lowest and trial != index:
            return order[trial]


def test_least_annotated_next_agrees_with_old_choice():
    rng = random.Random(0)
    for _ in range(500):
        order = seeded_order(IDS, rng.randrange(1000))
        actions = [(rng.choice(IDS), rng.choice([1, 2, 3]))
                   for _ in range(rng.randrange(15))]
        current = rng.choice(IDS)
        expected = _old_next(order, current, actions, user_id=1)
        got = least_annotated_next(order, current, annotation_counts(actions, 1))
        assert got == expected
