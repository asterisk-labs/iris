from os import makedirs
from os.path import dirname

import numpy as np

from iris.segmentation import NO_LABEL, compute_merged_mask, encode_mask, get_mask_filenames, read_masks


def _save_masks(final_mask, user_mask, image_id="IMG", user_id="u1"):
    final, user = get_mask_filenames(image_id, user_id)
    makedirs(dirname(final), exist_ok=True)
    np.save(final, encode_mask(final_mask, mode="binary"), allow_pickle=False)
    np.save(user, user_mask.astype(bool), allow_pickle=False)


def test_unlabelled_pixels_are_kept_apart_from_class_zero(tmp_path, project_snapshot, project):
    project["path"] = str(tmp_path)
    final = np.array([[0, NO_LABEL], [1, NO_LABEL]], dtype=np.uint8)
    _save_masks(final, np.array([[1, 0], [1, 0]]))

    final_mask, _ = read_masks("IMG", "u1")

    np.testing.assert_array_equal(final_mask, final)


def test_untouched_masks_saved_as_class_zero_are_read_as_unlabelled(tmp_path, project_snapshot, project):
    project["path"] = str(tmp_path)
    _save_masks(np.zeros((2, 2), dtype=np.uint8), np.zeros((2, 2)))
    assert (read_masks("IMG", "u1")[0] == NO_LABEL).all()

    # Once the user painted something, class 0 is a label
    _save_masks(np.zeros((2, 2), dtype=np.uint8), np.array([[1, 0], [0, 0]]))
    assert (read_masks("IMG", "u1")[0] == 0).all()


def test_merging_ignores_users_who_did_not_label_a_pixel():
    masks = np.dstack([
        np.array([[0, NO_LABEL, NO_LABEL]], dtype=np.uint8),
        np.array([[1, 1, NO_LABEL]], dtype=np.uint8),
        np.array([[0, NO_LABEL, NO_LABEL]], dtype=np.uint8),
    ])

    np.testing.assert_array_equal(compute_merged_mask(masks), [[0, 1, NO_LABEL]])
    assert (compute_merged_mask(np.full((1, 2, 2), NO_LABEL, dtype=np.uint8)) == NO_LABEL).all()


def test_unlabelled_pixels_are_blank_in_rgb_masks(project):
    rgb = encode_mask(np.array([[NO_LABEL, 1]], dtype=np.uint8), mode="rgb")

    assert rgb[0, 0].tolist() == [0, 0, 0]
    assert rgb[0, 1].tolist() == project["classes"][1]["colour"][:3]


def test_get_mask_filenames_and_read_masks(tmp_path, project_snapshot, project):
    project["path"] = str(tmp_path)
    final, user = get_mask_filenames("IMG", "u1")
    assert "u1_final" in final and "u1_user" in user

    # create dummy saved masks
    fm = np.zeros((2, 2, 2), dtype=np.uint8)
    um = np.ones((2, 2), dtype=np.uint8)
    # ensure parent directories exist
    makedirs(dirname(final), exist_ok=True)
    makedirs(dirname(user), exist_ok=True)
    # save final as one-hot (3rd dim)
    np.save(final, fm, allow_pickle=False)
    np.save(user, um, allow_pickle=False)

    final_mask, user_mask = read_masks("IMG", "u1")
    assert final_mask.ndim == 2
    assert user_mask.ndim == 2
