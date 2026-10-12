# finish-migration: detailed plan for 0.2.A and 0.2.B

Branch `finish-migration`, cut from `overhaul` (732f437) on
`asterisk-labs/iris`. Draft for review; nothing implemented yet.

Goal: the segmentation page is one TypeScript application. No legacy
script tags, no `vars`, no `window.*FromStore` bridge, no custom-event
plumbing between layers, and state held in one store built from slice files
with clear boundaries. Wire formats to the backend do not change; T1.1.2 (server-side
prediction contract) stays a separate task.

Baseline on this branch: vitest 388 passed / 1 skipped, `tsc --noEmit`
clean. Needs Node 20 (`~/.nvm/versions/node/v20.20.2`); the system
`node` is v10 and fails on vitest.

---

## 1. What the code actually does today

Findings beyond Part 0 of IMPLEMENTATION_PLAN.md, from reading every
legacy file, the bridge, both stores and the three layers.

### 1.1 Live versus dead legacy code

The legacy `ViewManager` (`iris/static/javascripts/views.js`) and the
legacy `MaskLayer`/`PreviewLayer` (`segmentation/views.js`) are **dead**.
`init_views` only builds them when an element `#views-container` exists,
and nothing renders that id. Every page load takes the mock-ViewManager
branch. Both files, and the mock, can go in the first commit.

What is live in `segmentation.js` (2,904 lines):

| Piece | Lines | Called from |
|---|---|---|
| `mouse_move/down/up/enter/wheel`, `update_cursor_coords` | ~250 | `ReactPreviewLayer` via `window.mouse_*` |
| `user_draws_on_mask` + `updateMaskPixels` | ~560 | mouse handlers |
| `reload_hidden_mask`, `get_current_mask_and_colours`, `get_current_class_colour` | ~150 | `setMaskType`, undo/redo, reset, predict |
| `undo`/`redo` wrappers (re-render after `setTimeout`) | ~110 | keyboard, `LeftToolbar` |
| `reset_mask` | ~40 | reset-mask modal |
| `legacyLoadMask`, `legacySaveMask`, `download` | ~250 | `segmentationStore.loadMaskForImage/saveCurrentMask` |
| `legacyPredictMask`, `update_ai_box` | ~430 | `segmentationStore.predictMask` |
| `dialogue_before_next_image(+_save_and_continue)` | ~110 | dropdown navigation, Enter key |
| `key_down`/`key_up`, `init_events` (incl. unload beacon save) | ~120 | `document.body.onkeydown` |
| `init_views` | ~110 | `segmentation-app.tsx` after polling `legacyScriptsReady` |
| `constrain_view`, `zoom`, `move`, `reset_views` | ~130 | `viewManagerStore.zoomCanvas/moveCanvas` via `w.constrain_view` |

`utils.js` is live only for `trackTransforms` (SVGMatrix monkeypatch on
every view canvas context), `round_number`, `RNG`, `rgba2css`,
`get_object`, `nice_number`. `dialogue.js` provides `show_dialogue`,
`show_loader`, `show_message`, which write into DOM nodes in `base.html`.

Control flow is a loop: store action → `window.legacyX` → reads store
through `window.getXFromStore` → writes store through `window.setXInStore`
→ `window.render_mask` (wrapped by `legacyBridge.ts`) → `viewManagerStore.renderMask`
→ `CustomEvent('react-mask-render')` → `ReactMaskLayer` draws the hidden
canvas that lives in `segmentationStore`.

### 1.2 Dead React code

Not imported by anything except their own tests:

- `SegmentationToolbar.tsx` and its whole `toolbar/` tree except
  `ToolButton`, `PaintbrushSelector`, `ImageNavigationDropdown`
  (i.e. `NavigationTools`, `EditingTools`, `ClassSelector`, `DrawingTools`,
  `MaskTools`, `FilterTools`, `FilterSlider`, `SettingsTools`,
  `ToolbarSeparator`).
- `SegmentationStatusBar.tsx` and `statusbar/` except `AIScore` and
  `AIRecommendation` (i.e. `UserInfo`, `AdminButton`, `ImageInfo`,
  `StatsDisplay`).
- `DebugPanel.tsx`.
- In `viewManagerStore`: `zoomLevel`, `panOffset`, `zoomFactor`,
  `canvasDimensions`, `mousePosition`, `isMouseDown`, `isDragging`,
  `screenToImageCoordinates` (wrong formula, unused), the legacy-instance
  sync, `initializeFromLegacy` and its 10 s poll, `getLayers`,
  `addStandardLayer`, `switchToView` (calls nonexistent `set_view`),
  `filters` (see 1.3).
- In `segmentationStore`: `nextAction`, `justLoggedIn` (never set true),
  `updateMaskRegion`, `fillMaskRegion`, `getMaskPixel`/`setMaskPixel`
  (each copies the whole mask), the `*FromStore` helpers, the debug info.

### 1.3 Bugs found while reading

Policy for this branch (agreed 2026-10-12): the migration preserves
current behaviour, bugs included, and bugs go to `docs/agents/bugs.md`
for issues to be raised separately. The exception is a bug that lives
only in code being deleted, where preserving it would mean rebuilding
dead or broken code on purpose; there the port takes the natural
behaviour and the PR description lists it. Below, **[port]** marks those
exceptions and **[bugs.md]** marks preserved ones.

1. **[port] Keyboard filters do nothing.** `C`, `I`, `X` update
   `viewManagerStore.filters`, which nothing renders. The sliders and
   arrow keys update `segmentationStore.brightness` etc., which
   `applyFiltersToLayers` writes into canvas CSS. Two filter states, one
   of them dead.
2. **[bugs.md] Reset-view key.** The handler binds `KeyY`; the command table and
   Help say `Z` (QWERTZ heritage).
3. **[bugs.md] Action-info dialogue is nearly unreachable.** `setMaskChanged(false)`
   after a save also clears `showDialogueBeforeNextImage`. So Enter
   (save, then `next_image`) and the TopBar Next button (save, then
   navigate) never show the difficulty/notes/complete dialogue. It only
   appears when navigating from the dropdown with unsaved changes.
4. **Undefined functions.** `dialogue_login` (called on any 403 from
   `download`) does not exist, so a 403 during mask load throws a
   `ReferenceError`. **[port]**: the 403 path opens the login modal.
   `dialogue_help` (new-user popup) does not exist either, but the popup
   can never fire because `justLoggedIn` is never set true.
   **[bugs.md]**: not ported.
5. **[port] BottomBar admin flag** reads `window.vars.is_admin`, which is never
   set, so admin-only items never show there.
6. **[port] Cost per mouse move while painting:** `updateMaskPixels` copies both
   masks, `setMaskData`/`setUserMaskData` copy them again, then
   `calculatePixelCounts` scans the full mask and `setMaskChanged` fires.
   Every component that calls `useSegmentationStore()` without a
   selector (`RightPanel`, `TopBar`, `LeftToolbar`, `ReactMaskLayer`, ...)
   re-renders on each of those `set`s. With a 2000×2000 mask that is
   roughly 16 MB of copying and 4 M iterations per event.
7. **[port] Brush rendering is inconsistent by shape.** Square brushes paint the
   hidden canvas with the class colour (class 0 gets its colour); round
   brushes *clear* pixels for class 0. Undo, reload and mask-type switch
   then redraw from data, so what you see while painting can differ from
   what you see after.
8. Not a bug: Shift+wheel computes up to the larger mask dimension but
   goes through `setToolSize`, which clamps to 100, so 100 is the
   effective limit everywhere. The port keeps one constant.
9. **[bugs.md] Image shape convention is mixed.** `docs/config.md` says
   `images.shape` is `[width, height]`; `useConfigLoader` reads it as
   `[width, height]`; all three layers and `viewTransform.ts` index it as
   `[height, width]`; `constrain_view` uses `[0]` as x. The backend
   reshapes bands with `reshape(*shape)`, i.e. `(rows, cols)`. All demo
   projects are square, so none of this shows.
10. The hidden mask canvas, drag start, cursor position and canvas mouse
    position all live in zustand. `cursorImage` changes on every mouse
    move and `ReactPreviewLayer` subscribes to it.
11. `mouse_wheel` uses the deprecated `wheelDelta` (the port reads
    `deltaY`, same sign). **[bugs.md]** Strokes are stamped only at event
    positions, so fast strokes leave gaps; the port keeps that.
12. `HelpModal` and `PreferencesModal` disable shortcuts by swapping
    `document.body.onkeydown`.

---

## 2. Target shape

```
src/segmentation/                  plain TS, no React, no window
  geometry/transform.ts            ViewTransform maths: fit, zoom about a point,
                                   pan, clamp to image, canvas<->image
  geometry/brush.ts                brushFootprint(shape, size) -> offsets
  mask/MaskDocument.ts             mutable final/user/errors Uint8Arrays,
                                   paint/erase/applyPrediction/reset,
                                   dirty rect, incremental per-class counts,
                                   revision counter
  mask/history.ts                  undo/redo snapshots (see D3)
  mask/palette.ts                  maskType + classes -> RGBA lookup;
                                   renderToImageData(doc, rect)
  mask/codec.ts                    octet format: encode (254|final|user|254),
                                   decode
  ai/sampling.ts                   seeded RNG + stratified train/test split,
                                   ported verbatim from legacyPredictMask
  ai/metrics.ts                    confusion matrix, per-class accuracy,
                                   harmonic score (absorbs createConfusionMatrix)
  canvas/CanvasController.ts       owns the viewports' canvases, one shared
                                   ViewTransform, the offscreen mask canvas,
                                   a requestAnimationFrame render loop and
                                   pointer handling
  input/shortcuts.ts               one key table: handler + label + help text

src/services/                      fetch wrappers, typed
  masks.ts                         load, save, saveBeacon
  prediction.ts                    current /predict_mask contract
  actionInfo.ts                    get/set action info
  images.ts                        images list
  config.ts                        (exists)

src/stores/segmentation/           0.2.B, slices of one store, section 4
src/hooks/useCanvasController.tsx  context provider; viewports register canvases
src/hooks/useKeyboardShortcuts.ts  binds the table; disabled by modal context
```

Layer components (`ReactRGBLayer`, `ReactMaskLayer`, `ReactPreviewLayer`)
shrink to "render a `<canvas>` and register it with the controller". All
drawing is imperative in the controller, driven by store subscriptions,
not React renders.

### Design decisions (recommendations)

**D1. One transform, held by the controller.** Replace `trackTransforms`
and per-canvas context matrices with a single `ViewTransform`
(`{zoom, originX, originY}`, already defined in `viewTransform.ts`). Each
draw calls `ctx.setTransform` from it. Canvas↔image conversion is a pure
function, so pointer maths becomes testable and the SVGMatrix patching
goes. The controller writes the transform to `viewTransform` in the view slice
(throttled) so remounts and reloads keep it, as last week's fix does now.

**D2. Mask pixels live outside zustand.** `MaskDocument` is mutated in
place. The mask slice holds a reference plus reactive summary fields:
`revision`, `savedRevision`, `counts`, `canUndo`, `canRedo`. Components
subscribe to summaries; the controller subscribes to the document's
dirty-rect events. `maskChanged` becomes `revision !== savedRevision`
instead of a flag set from five places.

**D3. History.** Unchanged: a full snapshot of both masks on stroke
end, 30 entries. The memory cost on large masks is logged in `bugs.md`
as a follow-up.

**D4. Render from data, always.** The offscreen mask canvas is updated by
`putImageData` of the dirty rect computed from `MaskDocument` +
`palette`, for every tool shape and mask type. That removes bug 7 and the
four near-duplicate canvas-painting branches in `user_draws_on_mask`.
Visible canvases are redrawn once per animation frame at most.

**D5. Pointer Events.** `pointerdown/move/up` with `setPointerCapture`,
`wheel` with `deltaY`. Middle/right drag and the move tool pan; left
paints. The canvas under the pointer is used for coordinates (today it is
always the first `.view-canvas` in the document).

**D6. Legacy chrome becomes React.** `show_message` → toast,
`show_loader` → loading overlay, `show_dialogue` → existing `ErrorModal`,
action-info dialogue → `ActionInfoModal`, all driven by a small
the UI slice. `base.html` loses `#dialogue`, `#loader`, `#message`,
`#block-screen` and both script tags; admin does not use them (checked:
no references under `src/pages`).

**D7. Boot data, not globals.** The template emits
`<script type="application/json" id="iris-boot">{image_id,
image_location, debug, urls}</script>`; `src/boot.ts` parses it once. No
`vars`, no `IRIS_DEBUG` global (a `debug` flag in the config slice), no
`_pending*` handoffs, no `legacyScriptsReady` polling.

**D8. Image shape.** Parse `images.shape` once into a
`{width, height}` object, keeping the indexing the current layers and
`viewTransform.ts` use (`shape[1]` is width, `shape[0]` is height), so
behaviour on today's projects is unchanged. The conflicting conventions
(docs, `useConfigLoader`, `constrain_view`, backend) are in `bugs.md`
pending tests on a non-square project; with one parse point, changing
the convention later is a one-line fix.

---

## 3. Steps (0.2.A)

Each step leaves the app working, `tsc` clean and vitest green, and is
one or a few commits. New state lands directly in its 0.2.B slice, so
each piece of state moves once (section 4 says where).

### S0. Clear dead code

- Delete `views.js`, `segmentation/views.js`, their script tags, and the
  legacy branch plus mock in `init_views`. Remove
  `setViewManagerInStore`, `legacyViewManagerInstance` and every
  `getViewManagerFromStore` caller (filters sync, `show_mask` sync in
  `segmentation-app.tsx`).
- Delete the dead component trees and their tests (1.2), `DebugPanel`,
  and the dead `viewManagerStore` surface. This is T0.8 items 1, 2 and 5.
- Add `.nvmrc` (20) and an `engines` field, so `npx vitest` cannot pick
  up Node 10.

Risk: low. Tests for deleted components go with them; the count drops by
about 60.

### S1. Pure core modules, with tests first

`transform.ts`, `brush.ts`, `MaskDocument.ts`, `history.ts`,
`palette.ts`, `codec.ts`, `sampling.ts`, `metrics.ts`. Nothing wired yet.

Tests that pin current behaviour:

- Brush footprints for square 1..8, round 1, 3 (cross), 5 (13-pixel
  diamond), 6, 9, at mask edges and with canvas clipping. Expected values
  generated once by running the legacy `user_draws_on_mask` under jsdom
  against a stub store, then frozen as fixtures, so the port is checked
  against the real old output rather than my reading of it.
- `round_number` is `(x + .5) | 0`, which truncates towards zero for
  negatives. Keep it as `roundHalfUp` where footprints depend on it.
- Sampling: `RNG(42)` shuffle output and train/test split for a fixed
  input match the legacy implementation exactly.
- Transform: zoom about cursor, pan, clamping (`constrain_view`
  semantics: no zoom-out past fit, no panning off the image), round trips.
- `MaskDocument`: paint/erase sets `user` and `final`, counts stay equal
  to a full recount after random operations (property-style test),
  `applyPrediction` only writes where `user == 0` (keeps 9b95570), dirty
  rects cover every changed pixel.
- Codec: round trip, and rejection of bad length/magic bytes.

### S2. CanvasController and layers

- `CanvasController` with `attachViewport(id, {rgb, mask, preview})` and
  `detachViewport(id)`, zoom/pan/reset, resize via `ResizeObserver`,
  render loop, pointer handling (D5) calling `MaskDocument` through the
  mask slice's actions, preview (brush outline and mask-area rectangle)
  drawn from controller-local cursor state.
- RGB layer: image loading stays in the component (it is per view), the
  draw call moves to the controller; filters applied as CSS from
  the filter slice.
- Delete `coordinateTransform.ts`, `trackTransforms` use,
  `iris-transform-change`, `iris-update-views`, `react-mask-render`,
  `react-preview-render`, `iris-mask-loaded`, `window.react*Layers`,
  `zoomCanvas/moveCanvas/resetCanvas/captureViewTransform` in the store.
- After this step the legacy mouse handlers and `user_draws_on_mask` have
  no callers.

Risk: the highest of the series. jsdom has no real canvas, so tests cover
the controller's maths and call sequence (stubbed context recording
`setTransform`/`putImageData`/`drawImage`), not pixels. The manual smoke
list in section 5 is the real check. Keep the controller thin over S1's
pure modules so most logic is tested there.

### S3. Mask IO, prediction, navigation in TypeScript

- `services/masks.ts`: load (404 → empty mask), save, `saveBeacon` on
  `pagehide` when `maskChanged`. 403 opens the login modal (bug 4,
  [port]).
- Store actions: `load(imageId)`, `save()`, `reset()`, `undo()`,
  `redo()`, `predict()`. `predict` ports `legacyPredictMask` on top of
  `sampling.ts` and `metrics.ts`, posts to the existing octet endpoint,
  applies the result, sets the errors mask and confusion matrix, and
  pushes history. `update_ai_box`'s recommendation text becomes derived
  state read by `AIRecommendation`.
- Navigation: one `goTo(imageId)` flow (save, then navigate; the
  action-info modal shows under exactly today's conditions, bug 3), used
  by Enter, Backspace, TopBar
  buttons and the dropdown. Replaces `next_image`/`prev_image` in the
  template, `dialogue_before_next_image`, `pendingNavigationImageId`,
  `goto_url`, `goto_image`, and the `save_mask` call in
  `UserProfileModal`.

Risk: "save then navigate" ordering and the beacon on close are the
data-loss paths. Unit-test the flow with mocked fetch: save failure must
not navigate; navigation after save uses the post-save state.

### S4. Keyboard and chrome

- `input/shortcuts.ts` table and `useKeyboardShortcuts`; modals and text
  inputs disable it via context. `HelpModal` renders its key list from the
  table. Remove the `onkeydown` swapping (bug 12). Shift-held resize mode
  becomes controller state, not store state.
- UI slice with toast, loading overlay and error; replace every
  `show_message`, `show_loader`, `hide_loader`, `show_dialogue` call
  (TopBar export, view-group switch, save confirmation).
- `ActionInfoModal` (difficulty, notes, complete) as a React component.
- Tooltip text on toolbar buttons from the shortcut table (replaces
  `init_toolbar_events`).

This subsumes T1.3.3.

### S5. Bootstrap and deletion

- `segmentation-app.tsx` initialisation becomes a straight async
  sequence: boot data → config + user → images list → mask load →
  controller ready. No polling, no `init_views`.
- Templates per D7. `base.html` loses `vars`, `initializeApiUrls`,
  `goto_url`, `goto_image`, legacy DOM nodes and script tags.
- Delete `segmentation.js`, `utils.js`, `dialogue.js`, `dialogue.css`
  (after checking `main.css` for overlap), `legacyBridge.ts`, the global
  `interface Window` declarations, and the parts of `segmentation.css`
  that only styled legacy ids (audit; some toolbar classes may still be
  used).
- Guard against regression: a vitest that greps `src/` for
  `window as any`, `(window as`, `w.vars`, `FromStore`, `InStore` and
  fails on any hit outside an explicit allowlist (likely empty, or one
  `window.irisDebug` handle in debug mode only).

Definition of done for 0.2.A: no legacy JS served, the grep gate passes,
the smoke list in section 5 passes on the demo, vitest and tsc green,
and the PR description lists every [port] behaviour change.

---

## 4. Store split (0.2.B)

One Zustand store, `useSegmentationStore`, assembled from slice files.
This keeps gt-sse's single-store model and atomic cross-cutting updates,
and gives the file-level separation 0.2.B is after. `viewManagerStore`
folds in as a slice, so the segmentation page has one store.

```
src/stores/segmentation/
  index.ts            create() spreading the slices, plus cross-slice
                      actions: loadImage, saveThenNavigate, predict
  maskSlice.ts
  toolSlice.ts
  filterSlice.ts
  configSlice.ts
  navigationSlice.ts
  viewSlice.ts
  uiSlice.ts
  types.ts            SegmentationState = intersection of slice types
```

Slices are spread flat, so access does not change:
`useSegmentationStore(s => s.showMask)`, as today. The name stays, so
components and tests keep their imports. Rules:

- Components always read through narrow selectors, never
  `useSegmentationStore()` bare. Enforced by the grep test in S5.
- Action names say what they act on (`resetMask`, `resetFilters`,
  `setToolSize`), because slices share one namespace. A type-level check
  fails the build if two slice types declare the same key.
- A slice may read other slices through `get()`; writes that span slices
  live in `index.ts` as named actions, so cross-cutting flows are in one
  place.

| Slice | Owns | Comes from |
|---|---|---|
| `maskSlice` | `MaskDocument` ref, `revision`, `savedRevision`, `counts`, history flags, `maskType`, `showMask`, errors mask, `confusionMatrix`, `lastSaveTime`; paint/reset/undo/redo | segmentationStore mask, history, pixel counts, confusion matrix, `maskChanged`, `isLoading` |
| `toolSlice` | `tool`, `toolSize`, `toolShape`, `currentClass` | segmentationStore tool fields (the dropdown-open flags become component state) |
| `filterSlice` | `brightness`, `saturation`, `contrast`, `invert` | both filter copies (bug 1); `expandedFilterSlider` becomes component state |
| `configSlice` | project `config`, `user`, derived `classes`, `imageSize`, `maskArea`, `maskSize`, `debug` | segmentationStore config/user/classes/maskArea/apiUrls, `useConfigLoader` |
| `navigationSlice` | `images`, `currentImageId`, derived prev/next | segmentationStore navigation, template `next_image`/`prev_image` |
| `viewSlice` | `views`, `viewGroups`, `currentGroup`, `showControls`, `viewTransform`, active view, layout persistence | slimmed `viewManagerStore` |
| `uiSlice` | toast, loading overlay, error modal, action-info modal state | `errorModal`, `dialogue.js` |

Leaving the store rather than getting a slice: the mask pixel arrays
(held by reference in `MaskDocument`, D2); cursor position, drag start,
canvas mouse position, hidden mask canvas, resize mode (controller-local);
config validation, about 180 lines, to `src/config/validate.ts`
unchanged, for 0.2.C to replace with the generated schema; the window
bridge exports; `nextAction`, `justLoggedIn`, `apiUrls` and the debug-info
getters (deleted; URLs are constants plus a base path from boot data).

Expected size: about 1,000 lines across the slice files, against 3,900
in the two stores today.

Tests: about 20 store test files target the current API, many of them the
bridge helpers. Plan: rewrite per slice, keeping the behaviours (pixel
counts, confusion matrix, history, config validation, navigation, image
location, mask area) and dropping tests of deleted bridge functions.
Expect the vitest count to dip after S0 and climb with S1.

---

## 5. Verification

Automated: vitest per step (pure modules carry most of it), `tsc`, the
grep gate, and the Cypress preferences spec still passing.

Manual smoke list, run on the demo after S2, S3 and S5:

- Paint square and round at sizes 1, 3, 5, 8; erase; class digits;
  Shift+wheel resize.
- Wheel zoom stays anchored at the cursor; right/middle drag and move
  tool pan; reset view; switching view group (`B`) and adding/removing a
  view keep zoom and pan; reload keeps them.
- Mask types `F`/`G`/`H`, Space toggle, filters by keys and sliders,
  filter reset, `Y` resets the view.
- Undo/redo across strokes, predict, reset.
- Predict (`A`) fills only unpainted pixels; errors mask; confusion matrix
  modal; AI score and recommendation.
- Save (`S`), Enter and Backspace, TopBar arrows, dropdown with unsaved
  changes (action-info modal), reload shows the saved mask, closing the
  tab with unsaved changes saves (beacon).
- Session expiry during load or save opens the login modal.
- Help modal: shortcuts disabled while open and inside text inputs.

Optional, and really 0.2.G: one Cypress flow that paints two classes,
predicts, saves, reloads and checks the mask persisted. Worth doing in
this branch if S2 turns out fiddly.

---

## 6. Decisions (settled 2026-10-12)

1. **Order.** 0.2.A first, with state landing in its 0.2.B slice as it
   moves (S0–S5), then a final sweep for config and navigation. One
   store built from flat slices, not several stores.
2. **PR shape.** One branch, one PR onto `overhaul`, reviewed commit by
   commit; open it as a draft after S1.
3. **Bugs.** Preserved and logged in `docs/agents/bugs.md` unless they
   live only in deleted code (the [port] cases in 1.3). That covers the
   action-info dialogue, the reset-view key (`Z` is correct, fix
   separately), gap-free strokes and history memory.
4. **Image shape.** Keep current indexing; test on a non-square project
   and decide the convention separately.
5. **Bing layer.** Keep it working through this branch.

Out of scope here: server-side prediction (T1.1.2), the Pydantic config
schema (0.2.C), the backend singleton (0.2.D), backend shape handling
(T0.6).
