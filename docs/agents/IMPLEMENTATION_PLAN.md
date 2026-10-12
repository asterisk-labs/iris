# IRIS Evolution towards Embeddings: implementation plan

Working plan for WP1 (technical). Written against the `overhaul` branch as of
2026-09-14 (merge of PR #66). Part 0 is an assessment of the codebase and the
bigger changes worth making now. T0 covers pre-project blockers and hygiene;
T1.1 to T1.4 follow the proposal's task structure.

Each task lists steps, then "Risks and known unknowns": places where the
change can have side effects, where I could not fully verify behaviour from
reading the code, or where a design decision is still open. File references
are to the current tree.

---

## Part 0: assessment and bigger changes

### 0.1 Honest assessment

**What is good.** The core idea and data flow are sound and have survived
years of use: a project JSON describing images, views and classes; views as
server-rendered PNGs from band expressions; masks as per-user pixel arrays
with a merged result and agreement scoring; a per-image AI assist. The React
migration done with gt-sse-center added real value: user accounts, an admin
interface, a config editor, theming, undo/redo with history, a large vitest
suite (388 tests) and a passing pytest suite (232 tests). `uv` packaging and a
Typer CLI are modern and pleasant.

**Backend (Python, about 3,800 lines excluding tests).** Small and readable,
but structurally dated:

- `Project` is a process-global singleton (`iris/project.py`, `project =
  Project()` at module bottom) that is loaded at import time by
  `iris/__init__.py`. Every module reaches for the global. This is why the
  package cannot be imported outside the repo root, why tests share state,
  and why anything multi-project or multi-process is off the table.
- Per-request mutation of shared state: `set_image_seed` reshuffles the
  global `image_order` on every navigation request, and `get_next_image`
  swaps entries of the global `image_ids` list to reorder the queue
  (`project.py:532`). Under the threaded dev server two users' requests
  interleave on this state, and the swap silently scrambles the canonical
  image index for everyone.
- Five API styles coexist: legacy HTML-era routes (`/segmentation/next_image`
  redirects, octet-stream masks), `/segmentation/api/*` JSON, `/api/config/*`
  with its own admin check, `/admin/api/*`, and `/user/*` plus `/user/api/*`.
  Auth is enforced by three different mechanisms and is missing on
  `/image/<id>/<view>`, `/metadata`, `/thumbnail` (`iris/main/__init__.py`).
- View expressions are evaluated with `eval` against a numpy environment,
  guarded by a substring blocklist (`_check_band_expression`). It is
  adequate while only admins write views; it is not a foundation for
  user-authored views.
- Config validation is hand-rolled twice: 446 lines in
  `iris/api/routes/config.py` and about 180 lines of `validateConfig` in
  `segmentationStore.ts`, plus the TS types in `src/types/iris.ts` which do
  not match the actual config shape (they describe `views` as an array and
  `segmentation.mask_path`, neither of which exists).
- The AI path is stateless and browser-driven: sampling and metrics in
  JavaScript, indices posted, LightGBM refit and discarded. Nothing can be
  reused across images, which is the whole point of the new work.
- Remnants of features that no longer exist: `classification` and
  `detection` action types, the Bing layer (needs a key; issues #47, #59),
  `test_images`, `tested` user flag.

**Frontend (about 26,700 lines TS plus 4,000 lines legacy JS).** The
migration is roughly two thirds done and stalled at the hardest third:

- The pixel path (brush, pointer, wheel, keyboard, mask IO, AI round-trip)
  is still `segmentation.js`. About 2,300 of its 2,904 lines are live.
- The two worlds talk through about 175 `window.*` globals. The stores
  export `*FromStore`/`*InStore` accessors that legacy code calls, and
  React calls legacy functions by name. Several bridge functions are defined
  three times (template, `legacyBridge.ts`, store) with last-writer-wins.
  Stores mutate legacy DOM ids directly (`tb_tool_*`, `ai-recommendation`).
- `segmentationStore.ts` is 2,657 lines mixing mask data, history, tools,
  filters, config validation, navigation, API URLs and a window-export block.
- The view manager exists three times: the legacy `ViewManager` in
  `views.js`, a mock of it created in `init_views`, and the React one. The
  React one still waits for the mock to be "set in store".
- Zoom and pan live in canvas context matrices (now mirrored into the store
  by last week's fix); `zoomLevel`/`panOffset` in the store are decorative.
- Timing hacks (busy-waits on `legacyScriptsReady`, 100 ms polls for
  `mouse_*`, `_pending*` slots) exist only because two loaders race.
- Tests are broad on the React side but the drawing and AI paths, being
  legacy, are untested apart from one Cypress spec that does not paint.

**Net.** The tool works and the React shell is a good base, but the current
architecture taxes every new feature twice: once to implement it, once to
thread it through the bridge and the singleton. Adding embeddings features
on top of this would deepen the hybrid rather than resolve it.

### 0.2 Bigger changes worth making now

Ordered by how much they simplify what follows. Each is independent.

**0.2.A Finish the frontend migration and delete the bridge.** Port the
remaining live legacy pieces into TypeScript modules that React owns, then
delete `segmentation.js`, `views.js`, `segmentation/views.js`,
`legacyBridge.ts` and every `window.*FromStore` export. The pieces are:
the brush (`user_draws_on_mask`, 560 lines, mostly geometry), pointer and
wheel handlers, keyboard map, mask load/save/predict (already thin wrappers
over fetch), hidden-mask rendering, and dialogue helpers. Keep the canvas
rendering imperative (a plain TS `CanvasController` class, not React
re-renders per frame), but owned by the app, not by a script tag. Payoff: no
race between loaders, one source of truth, testable drawing, and every
later task in this plan gets simpler. This is the single change I would
make before anything in T1.

**0.2.B Split and slim the stores.** Break `segmentationStore.ts` into
`maskStore` (data, history, undo/redo), `toolStore` (tool, class, size,
shape), `filterStore`, `configStore` (project + user config), and
`navigationStore` (image list, current, next/prev). Move DOM mutation and
CSS filter application into components or the canvas controller. Delete the
`vars` ghost global (`viewManagerStore.ts:894-945` is its last real reader
and duplicates `useConfigLoader`).

**0.2.C One typed API and one config schema.** Define the config with Pydantic
(gt-sse-center PR #19 already started this) and generate a JSON schema that
the frontend consumes for both types and form validation. Consolidate routes
under `/api/v1/` with one auth decorator pair (`requires_auth`,
`requires_admin`) applied everywhere, including image rendering. Keep old
routes as thin redirects for one release. The TS types in `src/types/iris.ts`
get generated, not hand-written.

**0.2.D Replace the Project singleton with an app-scoped object.** `create_app`
builds a `Project` and stores it on `app.extensions['iris']`; a
`current_project()` helper replaces `from iris.project import project`.
Per-user image order becomes a pure function of `(image_ids, seed, policy,
annotation counts)` computed per request, with no mutation of shared lists.
This removes the import-time crash, the request races, and the swap bug in
one move.

**0.2.E A real expression evaluator.** Replace `eval` with a small
`ast`-based evaluator that permits names, attribute access on band sources,
arithmetic, and a whitelist of functions. Same syntax as today, so configs do
not change. This is what makes user-authored views (T1.3.2) safe.

**0.2.F Retire dead product surface.** Remove `classification`/`detection`
action types, the Bing layer, `test_images`, `tested`. Each removal deletes
special cases in the admin pages, the `Action` model and the view manager.

**0.2.G Test the pixel path.** After 0.2.A, add vitest coverage for the brush
geometry and mask IO, and one Playwright or Cypress flow: paint two classes,
predict, save, reload, assert mask persisted. This becomes the regression
net for T1.2.

If only two of these can be done, do 0.2.A and 0.2.D. They are the two that every
T1 task otherwise has to work around.

---

## Conventions

- Every task lands as its own PR onto `overhaul`, with pytest and vitest
  additions where the task touches that side.
- New backend code goes in new modules rather than growing `project.py` or
  `segmentation/__init__.py`. New frontend logic goes in TypeScript that
  React owns; nothing new goes into `segmentation.js`.
- Every new user-facing feature is gated by a `features` block in the
  project config (T1.3.4) so the base tool is unchanged when the block is
  absent.
- Any change to config keys is accompanied by an update to
  `docs/config.md`, the validator, and the demo config.

---

## T0: pre-project (blockers and hygiene)

### T0.1 Make the package importable outside the repo root

**Problem.** `iris/__init__.py` (bottom) calls `create_app()` on the demo
project at import time. `iris --help`, `iris label` and `import iris` all
fail from any directory without a `demo/` folder. Reproduced.

**Steps.**
1. Delete the module-level `app = create_app(...)`, `db.create_all()` and
   `register_extensions(app)` block, and the module-level
   `from iris.models import Action, User`.
2. `iris/tests/conftest.py` currently does `from iris import app as iris_app`
   and then rewrites its `SQLALCHEMY_DATABASE_URI`. Replace with a fixture
   that calls `create_app(demo_file, {'debug': False})`,
   `register_extensions`, `db.create_all()` inside an app context.
3. `get_demo_file()` resolves via `importlib.resources` to a `demo/`
   shipped inside the package (move `demo/` under `iris/` or add it as
   package data), not `os.getcwd()`. `iris launch` copies from there.
4. CI step: run `iris --help` and `iris demo --help` from `/tmp`.

**Risks and known unknowns.**
- `iris/models.py` does `from iris import db`, which is fine because `db`
  comes from `iris/extensions.py` and is created without an app. But any
  module that imports `iris.models` before an app exists and then queries
  will fail with "working outside of application context"; the current
  import-time app masks such cases. Run the whole suite after the change
  rather than trusting the import graph.
- Moving `demo/` changes what `git ls-files` and `.gitignore` cover. The
  demo TIFFs are currently tracked despite `demo/images` being ignored (we
  had to `git add` by explicit path last week). Fix the ignore rule as part
  of the move or the demo images will be lost on the next clean checkout.
- `handle_launch_command` and `find_config_file` in `iris/__init__.py`
  assume `Path.cwd() / "demo"`. Both need the packaged path.
- Tests that rely on the module-level app having already created tables in
  the demo `.iris` folder will now depend on the fixture; watch for
  ordering assumptions between test files.

### T0.2 Ship the frontend bundle

**Problem.** `iris/static/dist` is gitignored; neither `pip install` nor the
Dockerfile builds it. A fresh install serves an empty page.

**Options.**
- (a) Commit the built bundle and add a CI job that rebuilds and fails on
  `git diff --exit-code iris/static/dist`.
- (b) Keep it untracked; build in CI and attach to releases; Dockerfile gets
  a Node build stage; pip install from git is documented as requiring
  `npm run build`.

Recommendation: (a) for now, because "pip install from the branch" is how
champions will get pre-releases.

**Steps for (a).**
1. Un-ignore `iris/static/dist`, commit the current build.
2. CI job: `npm ci && npm run build` then `git diff --exit-code`.
3. Dockerfile: fix the uv install PATH (`~/.local/bin`, not
   `~/.cargo/bin`), use `/app/.venv/bin/iris` as entrypoint, align the README
   port (config default is 5000, README says 80).
4. Confirm `pyproject` package data includes `static/dist/*`.

**Risks and known unknowns.**
- Committed build output conflicts on every PR that touches the frontend,
  because both sides regenerate the same files. Mitigation: never hand-merge
  `dist`; resolve by rebuilding. Document this. If it becomes painful,
  switch to (b).
- Vite output must be byte-stable for the CI diff check. The config uses
  fixed file names (no `[hash]`), but minifier output can differ across Node
  versions. Pin the Node version in CI and `.nvmrc` to the one used to
  build.
- `client.js` in `dist` is a shared chunk; verify nothing references a
  hashed name.

### T0.3 Chat defaults

**Problem.** `iris/default_config.json` has `chat.enabled: true` with
`github_repo: gt-sse-center/iris`. Every project posts feedback as GitHub
issues on the fork (issues #57 and #58 there are this).

**Steps.** Default `enabled: false` and empty `github_repo`; validation in
`iris/api/routes/config.py` requires a repo when enabled; document the
`chat` block in `docs/config.md` (it is currently undocumented).

**Risks and known unknowns.**
- `iris/tests/test_api_config.py` and `ChatSection.test.tsx` reference the
  chat block; check whether any test asserts the enabled default.
- Users of the fork who rely on chat being on by default will need to opt
  in; call it out in the changelog.

### T0.4 Per-user image ordering seed

**Problem.** `User.image_seed` in `iris/models.py` has
`default=randint(0, 10_000_000)`, evaluated once at import. All users
created in one process share a seed and see the same image order.

**Steps.** `default=lambda: randint(...)`; test that two users get
different seeds.

**Risks and known unknowns.**
- Existing databases keep their (shared) seeds. Provide a one-off
  `iris users reseed` command or document it. Changing seeds changes the
  order users see, which some may notice mid-project.
- This interacts with T1.2.1: if the ordering policy stops being a seeded
  shuffle, the seed becomes irrelevant. Fix it anyway; it is cheap and the
  random policy stays available.

### T0.5 Image cache and cheap band listing

**Problem.** `Project.load_image` re-reads whole files per view render.
`get_image_bands` loads a full image just to list band names and is called
by `/segmentation/api/user-config` on every preferences open. With 64 to
128 band embeddings this is seconds per click.

**Steps.**
1. `iris/imagecache.py`: LRU keyed on `(image_id, source, bands tuple)`
   with a byte budget (`images.cache_mb`, default 1024), a lock, and
   invalidation on `Project.load_from`. Wrap `Project.get_image`.
2. `get_image_bands` reads band counts from headers (`rio.open(...).count`,
   `np.load(..., mmap_mode='r').shape[-1]`) and caches per source.
3. Benchmark the demo RGB render and a 64-band render before and after.

**Risks and known unknowns.**
- `.npy` sources are memory-mapped; caching the mapped array is free, but
  `array[..., bands]` fancy-indexing copies. Cache the selection result,
  bounded by the budget, not the mmap.
- The dev server is threaded (`flask_app.run` default). The cache needs a
  lock; the production path is single-process gevent, so no cross-process
  invalidation is needed today. If anyone runs multiple workers later the
  cache is per-worker, which is fine but wastes memory.
- Files edited on disk while the server runs (re-running a preprocessing
  script) will be served stale. Key the cache on file mtime as well as id.
- `render_image` calls `felzenszwalb` and `sobel` inside view expressions;
  those are not cached by this change and remain slow. Out of scope.

### T0.6 Project object hygiene

Correctness fixes in `iris/project.py` and `iris/segmentation/__init__.py`:

1. `_init_paths_and_files`: `if project not in self.config` compares the
   Project object with dict keys and is always true, so a user-set `path`
   is ignored. Change to `'path' not in self.config`.
2. `render_image` uses the global `project` for `images.shape`; use `self`.
3. `cm.get_cmap` is removed in Matplotlib 3.11; use
   `matplotlib.colormaps[name]`.
4. `predict_mask`: remove the stray `y_size = 3` after the meshgrid size is
   computed.
5. `get_next_image`: stop swapping entries of `self.image_ids`. This is
   folded into T1.2.1's ordering rewrite; until then, document it.
6. `train_test_split(stratify=user_labels)` in `predict_mask` raises when
   any class has fewer than two samples; the browser gate ("more than 10
   pixels in at least two classes") does not guarantee this for classes
   between 1 and 10 pixels, which are still sent. Filter to the gated
   classes server-side too.

**Risks and known unknowns.**
- Item 1: projects that set `path` in their JSON will start honouring it,
  which moves where masks, user configs and the SQLite DB are read from.
  That is the documented behaviour, but existing users may have data in the
  default location. Log a warning when both locations exist.
- Item 4 changes meshgrid features for anyone who had `use_meshgrid` on;
  their AI results will differ. Nobody should depend on the bug, but note it.
- Item 3: `colormaps[name]` raises `KeyError` on unknown names where
  `get_cmap` raised `ValueError`; the render error path prints and continues,
  so behaviour is a different exception in a log line.

### T0.7 CI and packaging hygiene

1. Add `npm test` (vitest) to `ci.yml`. Remove `working-directory: iris`
   from the npm steps: they work only because npm walks up to the root
   `package.json`, which is confusing rather than broken.
2. `requires-python = ">=3.9"`; regenerate `uv.lock` to drop the `<3.9`
   branch.
3. Add a Matplotlib upper bound until T0.6 item 3 lands, then remove.
4. Bump `actions/setup-python` and `astral-sh/setup-uv`.
5. README: add `export-all`; fix "run all tests" wording; Codespaces
   instructions need the build step.

**Risks and known unknowns.**
- Vitest in CI on Windows runners: the suite uses jsdom and canvas stubs;
  it has only been run on Linux here. Run it on ubuntu only at first.
- Regenerating `uv.lock` will move many transitive pins at once. Do it in
  its own PR and run the full matrix.

### T0.8 Store and bridge cleanup

1. `viewManagerStore.ts`: `setZoomLevel`, `setPanOffset`, `resetView`,
   `updateCanvasDimensions` call `w.update_zoom`, `w.update_pan`,
   `w.reset_view`, `w.update_canvas_size`, none of which exist. Remove the
   calls. Make `zoomLevel` and `panOffset` derived from `viewTransform`, or
   delete them and their consumers (the debug overlay in
   `ReactViewManager.tsx`).
2. Delete dead legacy functions: `set_contrast`, `set_invert`,
   `render_mask_to_hidden_canvas`, `login_finished`, `logout_finished`.
3. Collapse the triple definitions of `setViewManagerInStore` and
   `setCurrentImageIdInStore` (template, `legacyBridge.ts`, store) into
   one, keeping the `_pending*` handoff until 0.2.A removes the race.
4. `vars`: the only real reader in src is
   `initializeViewManagerFromLegacy` (`viewManagerStore.ts:894-945`), which
   duplicates what `useConfigLoader` already does from the API. Delete the
   function and the writes in `ReactViewManager.tsx` and
   `coordinateTransform.ts`, then remove `vars` from `base.html` and
   `react-app.html`.
5. Strip "PHASE n" and "IRIS Migration" scaffolding comments.

**Risks and known unknowns.**
- Item 4: `segmentation-app.tsx` reads `w.vars` nowhere, but the legacy
  `next_image`/`prev_image` in `react-app.html` and `goto_url` in
  `base.html` are template-level and stay. Check `base.html` for any
  `vars.url` use by `goto_url` before deleting `vars`.
- Item 1: `ReactViewManager.tsx` passes `zoomLevel`/`panOffset` as props
  into every layer; the layers ignore them for rendering but re-render on
  change. Removing them changes re-render frequency, which is a performance
  improvement but touch each layer's effect dependencies.
- If 0.2.A is adopted, most of this task is subsumed. Do items 1 and 4
  regardless; they are prerequisites for A.

### T0.9 Issue and fork triage

1. ESA-PhiLab issues: close the 2023 install notes (#35, #37, #38, #46,
   #52, #36, #21) as resolved by the overhaul; keep #55 (concurrent
   annotation), #50 (named indices), #42 (blank view), #47 and #59 (Bing),
   #51 (binary PNG masks), #58 (document score) and label them by task.
2. gt-csse open PRs: #19 (Pydantic config form) overlaps 0.2.C; #39
   (General panel) and #42 (packaging) are small. Decide take or drop.
3. Agree with gt-sse-center whether `overhaul` becomes the shared upstream
   and where issues live.

**Risks and known unknowns.**
- PR #19 is described as 80% done with rjsf; adopting rjsf adds a heavy
  dependency to the admin app. Evaluate before merging rather than after.

---

## T1.1 Non-breaking embedding integration

### T1.1.1 Server-side model abstraction

**Goal.** Replace the inline LightGBM code in `predict_mask` with a
pluggable pixel model so a linear model on embeddings is a config switch.

**Steps.**
1. New package `iris/ml/`:
   - `features.py`: `build_features(image, config) -> (N, F)` extracted from
     `predict_mask` (bands, edge filter, meshgrid, superpixels). Pure
     function, unit-tested on a synthetic image. Must reproduce the current
     column order: `image_dict_to_array` stacks sources in `images.path`
     dict order and bands in the order returned by `get_image`.
   - `models.py`: `PixelModel` protocol (`fit`, `predict`,
     `predict_proba`, `describe`). `LightGBMModel` keeps the current
     hyperparameters and early stopping; `LinearModel` is
     `StandardScaler` + multinomial `LogisticRegression` with `C` from
     config and optional balanced class weights.
   - `registry.py`: `get_model(ai_model_config)` keyed on `ai_model.type`
     in `{"lightgbm", "linear"}`, default `lightgbm`.
   - `sampling.py`: stratified split with per-class caps (`train_ratio`,
     `max_train_pixels`), seeded. Moved from `legacyPredictMask`.
2. `default_config.json`: `ai_model.type`, `ai_model.linear.C`,
   `ai_model.class_weight`.
3. Validator and `AIModelConfig` TS type learn the new keys.

**Risks and known unknowns.**
- Exact-output regression tests for LightGBM are fragile across platforms
  and versions (thread count, float ordering). Assert accuracy on the demo
  within a tolerance and the number of predicted pixels per class, not the
  array.
- `n_jobs=10` is hard-coded in the current LightGBM call. Make it a config
  value defaulting to `-1`; on small VMs 10 threads oversubscribe.
- The linear model on raw reflectance bands will be worse than LightGBM;
  the default stays `lightgbm` so nobody's results change. The AI tab must
  make it obvious that `linear` is meant for embedding bands.
- `LogisticRegression` on 20k by 128 features is fast, but on
  `max_train_pixels` raised by a user to 200k it is not. Keep the cap
  visible in the UI.

### T1.1.2 Prediction API contract

**Goal.** One JSON endpoint owned by React, with sampling and metrics
computed server-side, so later features plug in behind it.

**Contract.** `POST /segmentation/api/predict/<image_id>`

Request:
```json
{
  "user_pixels": [int],        // mask-area indices the user painted
  "user_labels": [int],
  "model": "lightgbm" | "linear" | null,   // null = user config
  "options": {"seed": 42}
}
```
Response:
```json
{
  "mask": "<base64 uint8, mask_shape>",
  "errors": "<base64 uint8: 0 unused, 1 test-correct, 2 test-wrong>",
  "confusion_matrix": [[int]],
  "per_class_accuracy": {"0": 0.93},
  "overall_accuracy": 0.91,
  "n_train": int, "n_test": int,
  "model": {"type": "linear", "n_features": 64, "fit_seconds": 0.4}
}
```

**Steps.**
1. Implement in `iris/segmentation/api.py` using `iris/ml`, reading band
   selection from `project.get_user_config(user)` exactly as
   `predict_mask` does today.
2. `src/services/prediction.ts`: typed client; base64 to `Uint8Array`.
3. Port `legacyPredictMask` into the store's `predictMask`: apply predicted
   pixels only where `userMaskData` is 0 (this preserves the fix from
   commit 9b95570), set the errors mask, build the confusion matrix with the
   existing `createConfusionMatrix`, push history, set
   `showDialogueBeforeNextImage`. Delete `legacyPredictMask` and
   `update_ai_box`.
4. Same for `legacySaveMask` and `legacyLoadMask`: move to
   `src/services/masks.ts`; keep the octet mask format on the wire.
5. Delete the old `predict_mask` octet endpoint once the frontend has
   switched.

**Risks and known unknowns.**
- Call sites of the legacy wrappers are not only in the store:
  `segmentation.js:320-324` (`save_mask(next_image)` on key handlers),
  `segmentation.js:2001` (logout), `init_views` (awaits `load_mask()`),
  `dialogue_before_next_image_save_and_continue`, and
  `UserProfileModal.tsx:107`. Each must move to the store action or the
  keyboard behaviour "save then next image" silently stops working.
- `createConfusionMatrix` in the store reads `w.vars.test_n_samples`,
  which nothing sets; it falls back to row sums. With server-side metrics
  the per-class accuracy comes from the response and this code path goes
  away. Make sure the modal reads the new fields.
- Base64 of a 2000 by 2000 mask is about 5 MB per prediction. Acceptable,
  but for very large tiles keep the option of an octet body with a JSON
  header. The current octet endpoint has the same payload size.
- The `errors` mask marks only held-out test pixels; the "errors" mask
  view in the UI relies on that. Keep the semantics.
- Server-side stratified split inherits the too-few-samples crash noted in
  T0.6 item 6; filter before splitting.
- Browser-side `RNG(42)` shuffling gave users deterministic splits; the
  server seed reproduces that, but results will not be bit-identical to the
  old path. Nobody should depend on it.

### T1.1.3 Embedding ingestion and views

**Goal.** A project can add AlphaEarth or TESSERA style pixel embeddings as
a source and use them for the model and for views without RAM blowups.

**Steps.**
1. `docs/config.md`: document the pattern (`images.path` dict with an
   embeddings source such as `"AlphaEarth": "emb/{id}.npy"`, bands as
   `$AlphaEarth.B1..B64`, `ai_model.bands` restricted to that source).
2. `load_image` for `.npy` keeps `mmap_mode='r'`, selects bands before
   materialising, and upcasts float16 on disk to float32.
3. Render environment (`Project._get_render_environment`): add
   `pca(source, n=3)` and `norm(x)` helpers so an embedding can be viewed
   as false colour. PCA on a random pixel subset per image, cached via T0.5.
4. `BandSelector.tsx`: group bands by source with select-all per source and
   a count so 128-band lists stay usable.
5. Demo: a small synthetic embedding (`demo/images/*/emb.npy`, 16 bands,
   generated by a script under `demo/`) and an "Embedding PCA" view.
6. `scripts/fetch_embeddings.py` example for AlphaEarth and TESSERA, kept
   outside the package.

**Risks and known unknowns.**
- Referring to a whole source in an expression does not work today.
  `render_image` extracts band tokens with the regex
  `(?:\$\w+\.{0,1}\w+)`; `$AlphaEarth` alone matches (by backtracking) as a
  token that `get_image` then filters to nothing, so the source is never
  loaded and the expression fails with a NameError. `pca($AlphaEarth)`
  needs either a `$AlphaEarth.*` token that `get_image` expands to all
  bands, or `pca` to take the source name as a string. Decide the syntax
  before writing docs.
- Loading all 64 to 128 bands for a PCA view is the heaviest render in the
  tool; without T0.5 it is unusable. Order T0.5 first.
- `get_image_bands` (used to populate the band selector) lists bands per
  source by loading; after T0.5 it reads headers. Until then a 128-band
  source makes the preferences modal slow to open.
- The demo `images` directory is gitignored; new demo files must be added
  by explicit path (see T0.1).
- Real AlphaEarth access is through Google Earth Engine and needs an
  account; TESSERA distribution format and licence need checking. The
  synthetic demo embedding exists so the feature is testable regardless.
- Band identifiers are parsed as `int(s.replace("$B", "")) - 1`; a source
  whose band names are not `B<n>` (some embedding exports name channels)
  will break. Keep `B<n>` as the only supported form and say so.

### T1.1.4 Dataset creation workflow (`iris init`)

**Goal.** From an area, a date range and a list of sources, produce a
ready project folder. Scripted first; an agent wrapper is optional.

**Steps.**
1. `iris init <folder> --spec spec.yaml`: AOI (bbox or GeoJSON), dates,
   tile size, sources, classes.
2. `iris/dataset/` with one fetcher per source behind
   `Source.fetch(aoi, dates, out_dir) -> list[tile]`. Start with
   Sentinel-2 via STAC (`pystac-client` against Earth Search or CDSE) and
   one embedding source. Optional dependency group `[dataset]`.
3. Writer produces `images/{id}/<source>.tif|npy`, `metadata.json` with
   location and date, `thumbnail.png`, and a project JSON with sensible
   views and `images.shape`.
4. Agent wrapper, only after 1 to 3 work: expose `init` as a tool for an LLM
   so a user can describe the dataset in prose. Lives in `scripts/`.

**Risks and known unknowns.**
- Scope. This can absorb unlimited time (auth for CDSE, GEE, cloud masking,
  reprojection, tiling edge cases). Fix the first version to one STAC
  provider, one CRS handling rule (reproject to the tile's UTM zone), and
  square tiles; treat everything else as later.
- `images.shape` in the config is a single shape for all images and the
  mask area is fixed in pixels; every tile must be the same size, which the
  writer must guarantee.
- The STAC and GEE client libraries pull in large dependency trees; keep
  them in the optional extra so `iris` itself stays light.
- The "agentic" part in the proposal is under-specified; the scripted
  version delivers the actual value and the wrapper is a demonstration.

---

## T1.2 Breaking workflow changes

### T1.2.1 Image-level embeddings and smart ordering

**Goal.** Serve the next image by a configurable policy, including "most
dissimilar to what is annotated", without the current shared-state
mutation.

**Steps.**
1. Config: `images.embedding: "emb/{id}_image.npy"` (one vector per image)
   or `images.embedding_index: "index.npz"`. `Project` loads an `(N, D)`
   matrix with an id lookup; if absent and a pixel embedding source exists,
   compute the mean vector lazily and cache it under `<project>.iris/`.
2. `iris/ordering.py`: pure functions taking `(image_ids, annotation
   counts per image, per-user annotated set, seed, embeddings)` and
   returning an ordered list. Policies: `random` (current seeded shuffle),
   `fewest_annotations` (current `prioritise_unmarked_images`), `diverse`
   (max-min embedding distance from the annotated set, ties by fewest
   annotations), `similar_to_current`.
3. `Project.get_next_image`/`get_previous_image` call the policy per
   request and do not mutate `image_ids` or `image_order`. Remove
   `set_image_seed`'s reshuffle side effect.
4. Issue #55: an optional soft lock so two users are not served the same
   unannotated image. New table `ImageLock(image_id, user_id, expires_at)`
   set when served, cleared on save, ignored after expiry.
5. `GET /segmentation/api/images/list` adds `suggested` and `distance`;
   `ImageNavigationDropdown.tsx` shows a badge and sort.
6. Policy selector in the project menu (T1.3.1) and in config.

**Risks and known unknowns.**
- The current implementation swaps entries of the global `image_ids` list
  to reorder the queue (`project.py:532`). Any existing deployment running
  `prioritise_unmarked_images` has been quietly permuting that list across
  users and requests. Replacing it changes the order users see mid-project.
  Ship this with the "next image" behaviour clearly described in the
  changelog.
- Do not put the lock on `Action`. `list_images` counts `Action` rows as
  annotations (`has_any_annotation`, `annotation_count`) and `merge_masks`
  iterates them; a lock row would look like an annotation. Hence the
  separate table.
- `diverse` needs the annotated set; with three users annotating in
  parallel the "annotated set" is per project, so users converge on
  different images automatically, which is the desired behaviour, but
  `get_previous_image` becomes "the image I was on before", not "previous
  in a fixed order". Store per-user navigation history in the session or
  in `Action.last_modification` ordering, and say so in the UI.
- Mean-of-pixel-embeddings as an image vector is a stand-in; the proposal
  mentions THOR and TerraMind. Their outputs have different dimensions and
  normalisations; the distance metric (cosine) must be configurable per
  index.
- The `image_seed` column and T0.4 remain relevant only for `random`.

### T1.2.2 Dataset-wide annotations as priors

**Goal.** A model trained on annotations across the dataset that can
propose a mask for a fresh image and warm-start the per-image model.

**Design.**
- Training data is persisted server-side at save time. On `save_mask`,
  sample up to `priors.max_pixels_per_class` user-painted pixels per class
  from the saved mask, compute their feature vectors from the configured
  embedding source, and write
  `<project>.iris/priors/samples/<user>_<image>.npz` (indices, labels,
  features as float16, source fingerprint).
- A project model (a `PixelModel`, default `linear`) is trained on the
  pooled samples and cached as `<project>.iris/priors/model.joblib` with a
  manifest (sample counts, images, users, timestamp). Retrain on demand or
  when the sample set changed by more than a threshold since the last fit.
- Optional gating by image similarity (T1.2.1): train on the k nearest
  images to the target, or weight samples by similarity.
- Prior predictions fill only pixels where `userMask == 0`, exactly as the
  per-image AI does, so the final/user mask split and agreement scoring
  are untouched.

**Steps.**
1. `iris/ml/priors.py`: `SampleStore` (write, read, iterate, prune),
   `PriorModel` (train, predict, manifest), `similarity_filter`.
2. Hook in `save_mask` after the mask files are written; wrap in
   try/except so sampling failure cannot fail a save.
3. Endpoints: `POST /segmentation/api/prior/train`,
   `GET /segmentation/api/prior/status`, and `use_prior: "off" | "init" |
   "only"` on the predict endpoint. `init` adds prior samples to the local
   fit; `only` returns the prior's prediction with no local pixels.
4. Frontend: AI tab section "Dataset prior" (enable, mode, similarity k,
   status line), a "Prior" button in the left toolbar. Predictions are
   applied through the same path as AI predictions; no new mask layer.
5. `iris priors rebuild <project>` CLI for offline retraining.
6. Tests: sample store round trip; prior on the demo gives a non-trivial
   mask for an unannotated image after two annotated ones; a save whose
   sampling raises still returns 200.

**Risks and known unknowns.**
- `save_mask` already calls `merge_masks` synchronously, which loads every
  user's mask for the image. Adding feature extraction (loading the
  embedding source) lengthens the save. With T0.5 the source is usually
  cached; without it, saves on 128-band projects get noticeably slower.
  Measure; if needed, sample in a background thread with a file lock.
- Storage: 20k pixels by 64 features by 2 bytes is about 2.5 MB per user
  per image; 200 images by 3 users is 1.5 GB. Set `max_pixels_per_class`
  conservatively (2000) and prune samples for images whose mask was
  re-saved (overwrite, not append).
- Concurrency: a train request while saves are writing sample files.
  Write samples atomically (temp file plus rename) and have the trainer
  snapshot the file list first.
- Prior and per-image models must see the same feature construction; if a
  user changes `ai_model.bands` in their preferences, their local features
  no longer match the prior's. Bind the prior to a project-level feature
  spec (`priors.bands`), not to the user config, and refuse `init` mode
  when they differ.
- Class drift: if an admin edits classes (reorder, delete) after samples
  exist, labels in the sample store are wrong. Store class names alongside
  ids and invalidate the store when the class list changes (compare a hash
  in the manifest).
- Quality expectations: the proposal's premise is that embeddings are
  linearly separable across images. For clouds on AlphaEarth annual
  composites that is doubtful (annual embeddings average out clouds); the
  champion use-cases need to be chosen with this in mind. This is a
  research unknown, not a code one, and the D1.1 report should measure it.
- The "trained on everyone's annotations" prior mixes users of different
  reliability; the scoring system already computes agreement, which could
  weight samples later. Not in the first version.

### T1.2.3 Time-series viewer and temporal mode

**Goal.** Step through dates of the same location, and optionally label
per date.

**Design (revised after checking path handling).** Rather than adding a
time dimension to `images.path`, treat each `(location, date)` pair as its
own image id of the form `<location>@<date>`, expanded at project load
from `images.times` (a list) or from per-image metadata. Path templates
then use `{id}` as now, with `{location}` and `{t}` available as derived
placeholders. Everything downstream (masks, `Action.image_id`, navigation,
export) keeps working unchanged, and the time slider is navigation between
sibling ids.

**Steps.**
1. `Project`: `images.times` config; id expansion; `siblings(image_id)`
   returns the ordered list of ids sharing a location; path formatting
   accepts `{id}`, `{location}`, `{t}`.
2. Frontend: a time slider in `TopBar.tsx` driven by
   `/segmentation/api/images/siblings/<id>`; stepping navigates to the
   sibling id (same code path as next/previous). Optional: a "lock view to
   sibling" per viewport so two viewports show `t` and `t+1`.
3. Temporal mode is then just "masks exist per sibling", which is already
   true. The only addition is a per-location completion indicator in the
   navigation dropdown.
4. Ordering policies (T1.2.1) get a `group_by_location` option so a user
   is offered the next date of the location they are on.

**Risks and known unknowns.**
- `.format(id=...)` is called at nine sites across `project.py` and
  `segmentation/__init__.py`; all must accept the extended id and derived
  placeholders. The regex in `_init_paths_and_files` that recovers ids from
  globbed paths must be replaced by explicit expansion when `times` is set.
- `@` in ids flows into URLs (`?image_id=coast@2020`), mask folder names
  and `Action.image_id`. URL-encode in the frontend (`encodeURIComponent`
  is already used in navigation), and check that Windows paths accept the
  character (they do).
- The admin images page and `export-all` list ids; with expansion a
  20-location, 10-date project shows 200 rows. Group by location in the
  UI.
- Priors across years (annual embeddings) work automatically since each
  sibling is an image, but sample storage grows with the number of dates.
- If a champion wants per-location labels that apply to all dates
  (change detection style), that is a different product and not covered.

### T1.2.4 Language-aligned priors (stretch)

**Goal.** A class can carry a text prompt; a language-aligned embedding
model turns it into a prior mask.

**Design.** `PriorProvider` protocol in `iris/ml/priors.py` with
`predict(image_id, classes) -> mask`; the dataset prior from T1.2.2 is the
first provider. A `LanguageProvider` calls an external HTTP service
(`priors.language.endpoint`) with the image's embedding tile and the class
prompts, gets per-class similarity maps, and argmaxes them with a
confidence threshold into a mask. Class config gains `prompt`.

**Steps.**
1. Provider protocol and registry; the "Prior" button lists providers.
2. `ClassListEditor.tsx` gains a prompt field, shown only when the feature
   flag is on.
3. Feasibility spike on the champion datasets with GLUE or DINOv3 text
   heads; go or no-go at the mid-term review.

**Risks and known unknowns.**
- The provider runs a model server outside IRIS; who hosts it, on what GPU,
  and how the tile gets there (upload of a 128-band array per request) are
  open. For local use it can be a subprocess; for a shared server it is an
  ops question.
- Similarity maps are at the embedding's resolution (10 m for AlphaEarth,
  coarser for others); upsampling to the mask grid is part of the provider.
- GLUE is unreleased; the plan must not depend on it. DINOv3 with a text
  head is the fallback named in the proposal.

---

## T1.3 GUI and project administration

### T1.3.1 Project-level menu

**Goal.** A place outside the per-image screen for dataset-wide
workflows.

**Steps.**
1. Grow the admin SPA (`src/admin-app.tsx`, React Router with basename
   `/admin`) into a "Project" app: Dataset (image grid with thumbnails,
   annotation status, suggested-next, a 2D scatter of the image index),
   Models (prior status, retrain, sample counts, per-class accuracy over
   time), Ordering (policy), Views (T1.3.2), Users and Password resets
   (existing).
2. Entry from `TopBar.tsx` and a "Back to image" link; non-admins see
   Dataset and Views read-only.
3. Backend: `/admin/api/dataset/summary` (counts, per-class pixel totals,
   scatter coordinates cached under `<project>.iris/`).
4. Vitest per page; one end-to-end flow (open project menu, retrain prior,
   return).

**Risks and known unknowns.**
- `iris/admin/spa.py` enumerates routes explicitly (`/users`,
  `/actions/<type>`, `/images`, `/password-resets`, `/`); every new page
  needs a Flask route or deep links 404. Add a catch-all under `/admin/`.
- All `/admin/api/*` endpoints are `requires_admin`. "Non-admins see
  Dataset read-only" needs new endpoints under `/segmentation/api/` with
  `requires_auth`, or the admin pages must be admin-only. Decide; the
  simpler answer is admin-only for the first version.
- The scatter needs a 2D projection of the image index; PCA is cheap and
  deterministic, UMAP is a heavy dependency. Use PCA.
- Thumbnails are optional in config (`images.thumbnails: false` default);
  the grid must degrade to a rendered RGB view at small size, which is
  slow without T0.5.

### T1.3.2 View creator and sharer

**Goal.** Users can define views over any source, including embeddings,
and admins can promote them to the project.

**Steps.**
1. Replace the `ViewsTab.tsx` placeholder with an editor built on the
   existing `ViewListEditor.tsx`: name, type, one or three data
   expressions, cmap, clip or vmin/vmax, and a live preview.
2. Per-user views: `get_user_config` deliberately overwrites `views` from
   the project config. Add a separate `user_views` key that is merged for
   rendering and validated with the same rules.
3. Sharing: "Propose to project" writes to a `proposed_views` list; an
   admin accepts through the existing `PUT /api/config/project`.
4. Named indices (issue #50): helpers `ndi(a, b)`, `pca`, `norm`; a blank
   view (issue #42) as `type: "blank"`.

**Risks and known unknowns.**
- `/image/<id>/<view>` has no auth decorator and looks up
  `project['views'][view]` only. Per-user views need a new, authenticated
  render route (`/segmentation/api/render/<id>?view=<name>` resolving
  project then user views) and the old route should gain `requires_auth`.
  Note that `/metadata` and `/thumbnail` are also unauthenticated today.
- Letting non-admin users author expressions that go through `eval` is
  the point at which the substring blocklist in `_check_band_expression`
  stops being acceptable. 0.2.E (AST evaluator) is a prerequisite for
  step 2, not an optional nicety. If 0.2.E is not done, restrict view
  authoring to admins.
- Live preview means rendering on every keystroke; debounce and cap the
  preview to a downsampled image.
- `view_groups` reference views by name; a user view with the same name as
  a project view must be rejected or namespaced.
- `PUT /api/config/project` rewrites the whole config file and reloads the
  project (`project.load_from`), which resets the image cache and any
  in-memory ordering state. Accepting a proposed view is therefore a
  project-wide reload; do it rarely and log it.

### T1.3.3 Keyboard and modal ownership in React

**Goal.** New modes add keys; the legacy `key_down` on `document.body`
must go.

**Steps.** A `useKeyboardShortcuts` hook owning a single table (tool,
class digits, brightness, undo/redo, group cycle, time step, save-and-next)
with modals disabling it via context instead of saving and restoring
`document.body.onkeydown`. Delete `key_down`, `key_up` and the keyboard
part of `init_events`; the Help modal renders from the same table.

**Risks and known unknowns.**
- `key_down` also implements Shift-held tool resizing and the `save_mask(next_image)` chain; these move to the store actions from T1.1.2.
- `HelpModal.tsx` and `PreferencesModal.tsx` currently save and restore
  `onkeydown`; both must switch to the context or shortcuts fire inside
  text inputs.
- The Cypress spec does not exercise keys, so there is no existing
  regression coverage; add a vitest for the table and a Cypress step that
  presses a class digit.
- Subsumed by 0.2.A if adopted.

### T1.3.4 Feature flags and config surface

**Goal.** Everything new is opt-in per project (proposal trade-off 2).

**Steps.** `features: {priors, smart_ordering, timeseries,
language_priors, user_views}` in `default_config.json`, all false;
endpoints return 404 when off; frontend hides UI when off; config tab
exposes toggles; a `docs/config.md` section per feature.

**Risks and known unknowns.**
- `merge_deep_dicts` fills defaults, so old configs get the block
  automatically. The hand-written validator in `config.py` and the TS
  `validateConfig` both need to accept the new key or the config editor
  will refuse to save. 0.2.C removes this duplication.
- Flags that gate backend behaviour (ordering policy, prior sampling on
  save) must be read from the project config, not the user config, or two
  users can disagree on whether samples are being stored.

---

## T1.4 Refinement and quality control

1. Beta loop: champion users file issues on ESA-PhiLab with a template;
   weekly triage; fixes as small PRs on `overhaul`.
2. Performance pass on a 128-band, 200-image project: render latency,
   prior training time, memory; tune the T0.5 cache and sampling caps.
3. Legacy retirement: if 0.2.A was not done up front, do it here with
   what remains (brush, pointer, mask rendering). Delete `views.js`
   duplicates.
4. Docs and release: `docs/config.md`, README quick start with embeddings,
   a tutorial notebook per champion dataset; tag `v2.0.0` on `overhaul`;
   decide with ESA whether `overhaul` replaces `master` or ships as a
   parallel release.
5. Deliverables: the D1.1 report draws on the acceptance measurements
   recorded in each task.

**Risks and known unknowns.**
- Replacing `master` breaks every existing `pip install
  git+...@master` user with a new data model for user accounts and a
  required admin password on first start. Ship a migration note and keep a
  `v1` tag.
- The `Action` table and mask file layout are compatible between v1 and
  the overhaul (same `<user>_final.npy` scheme), so existing project
  folders should open; verify on a real v1 project before claiming it.

---

## Suggested order

0.2.A and 0.2.D first, then T0 in full, then T1.1.1 to T1.1.3, T1.2.1,
T1.2.2, T1.3.4, T1.3.1, T1.2.3, T1.3.2, with T1.1.4, T1.2.4 and T1.3.3
slotted where champion needs pull them forward.
