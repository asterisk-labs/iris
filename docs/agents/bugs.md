# Known bugs

Bugs spotted while working on other branches and deliberately left alone
there. Raise an issue for any of these when it is worth fixing; when one
is fixed, delete its entry.

Each entry says where it is, what goes wrong, and anything learned about
the fix. Line numbers are as of the branch named in the entry.

---

## Frontend

### Action-info dialogue almost never appears

*Found on `finish-migration`, preserved by the migration.*

The "Before you continue" dialogue (difficulty, notes, complete) is meant
to appear when leaving an image the user worked on. Saving calls
`setMaskChanged(false)`, which also clears `showDialogueBeforeNextImage`
(`src/stores/segmentationStore.ts`, `setMaskChanged`). Enter saves and
then calls `next_image`, and the TopBar arrows save and then navigate, so
by the time either checks the flag it is false. The dialogue only appears
when navigating from the image dropdown with unsaved changes. On that
path the dialogue's "Save and continue" stores the action info and
navigates but does not save the mask; the mask is saved only by the
`sendBeacon` on page unload.

Needs a decision on when the dialogue should show before fixing.

### Image shape convention is inconsistent

*Found on `finish-migration`; the migration keeps the current frontend
indexing.*

`docs/config.md` says `images.shape` is `[width, height]`, and
`useConfigLoader` destructures it that way. The React layers and
`src/utils/viewTransform.ts` treat `shape[0]` as height and `shape[1]` as
width. Legacy `constrain_view` treated `shape[0]` as x. The backend
reshapes bands with `reshape(*project['images']['shape'])`
(`iris/project.py`), i.e. `(rows, cols)`. Every demo project is square,
so none of this shows. Needs testing on a non-square project, then one
convention applied in docs, frontend and backend.

### New-user help popup never fires

*Found on `finish-migration`; not ported.*

`newuser_help_popup` in `segmentation.js` opens Help for a user with no
saved masks who just logged in. `justLoggedIn` is never set true, so it
never runs; if it did, it would throw, since `dialogue_help` is not
defined anywhere. If the feature is wanted, set the flag on login and
call the React Help modal.

### Undo history holds full mask snapshots

*Found on `finish-migration`, preserved by the migration. Performance
rather than correctness.*

History keeps 30 full copies of both the final and user masks. For a
2000×2000 mask that is about 240 MB. Storing the before/after contents
of each stroke's bounding rectangle, with full snapshots only for load,
reset and predict, would cut this to a few MB in normal use.

---

## Backend

### `save_mask` magic-byte check uses `and`

*Found on `finish-migration`.*

`iris/segmentation/__init__.py`, `save_mask`:
`elif data[0] != 254 and data[-1] != 254:` rejects the upload only when
*both* magic bytes are wrong. It should be `or`. The length check above
it catches most corruption, so impact is low.

### Any logged-in user can edit any action's info

*Found on `finish-migration`.*

`iris/main/__init__.py`, `set_action_info`: loads the `Action` by id with
`get_or_404` and updates difficulty, notes and complete without checking
that it belongs to `session['user_id']`. A user can change another
user's annotation metadata by posting to `/set_action_info/<id>`.

---

## Tests

### Timing-sensitive tests fail intermittently under the full suite

*Found on `finish-migration`.*

`src/pages/ImagesPage.test.tsx` ("disables export button during export")
and `src/pages/PasswordResetRequestsPage.test.tsx` ("refreshes list after
successful password generation") pass on their own but occasionally fail
when the whole vitest suite runs, which runs test files in parallel. Both
race a mocked `setTimeout` delay against `waitFor`. Use fake timers or
wait on the resulting state instead of elapsed time.

