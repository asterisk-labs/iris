# Part 0 (0.2.C to 0.2.G): points for review

Decisions taken on `part0-remaining` without asking, and things that still
need a person to look at them. Delete this file when the PR is merged.

## 0.2.D and navigation

- The UI follows each user's shuffled order, and the image dropdown shows
  that order too. Alphabetical may be easier for picking by name.
- The `/previous_image` redirect no longer returns to the image a prioritised
  "next" came from. The UI does, from a per-tab trail.

## 0.2.E expressions

- Some syntax that worked under `eval` is rejected: indexing (`$B1[...]`),
  `a if b else c`, chained comparisons and numpy keyword arguments other
  than `axis`. Check whether any live project uses these.
- A failing expression now fails the view (400). Before, the band was dropped,
  which gave either a wrong picture or a 500.
- Your JSON-template idea in fork issue #8 is undecided there, so the string
  syntax is unchanged. `parse` is separate from `evaluate`, so a JSON form
  could be mapped onto the same evaluator.

## 0.2.F removals

- Removing Bing contradicts T0.9, which keeps ESA issues #47 and #59 (both
  about Bing) as open work. I followed 0.2.F. If kept users rely on it,
  revert the Bing part; those two issues can otherwise be closed.
- Saving a project's config from the Preferences form removes its Bing views
  from the file, since they were dropped on load (a `.backup` is written).
- The database columns `user.tested` and `action.type` remain (see the plan).

## 0.2.C API and schema

- New runtime dependency: `pydantic>=2.5`. gt-sse-center PR #19 (rjsf form) was
  not reused; its form is a separate app and rjsf is a heavy dependency.
- Images, thumbnails and metadata now need a login. Anything that embedded
  them without one stops working.
- Not logged in is 403 everywhere; the config routes used to answer 401.
- Saving a config is stricter: it runs the same checks as the form's
  validation, where before it ran fewer. Unknown keys are accepted.
- Loading a config that breaks the schema only prints warnings.
- Scripts that do not follow redirects need the new paths. POST bodies survive
  the 307.
- Any logged-in user can read `/api/v1/admin/users`, `actions` and `images`,
  as before. This looks unintended, but existing tests cover it.
- `set_action_info` still lets a user edit anyone's action and `save_mask`
  still checks its marker bytes with `and` (both in `bugs.md`).
- Logging out is still a GET request.
- `src/config/validate.ts` is gone: the browser trusts the server's check.

## 0.2.G end-to-end test

- The spec logs in through the API. The shared `cy.login` command decides
  whether a login is needed after a fixed 2 s wait, and got it wrong once on
  a slow page load; the preferences spec still uses it.
- Painting uses synthetic pointer events, so pointer capture is stubbed.

## Found on the way, not changed

- `segmentation.ai_model.n_jobs` defaults to -1 (all cores) since T0.6. On a
  192-core machine a small fit took 15 s, against 0.03 s with 4 threads, and
  the AI button did not answer within 60 s. The old value was 10. I suggest
  a default of 4. Saved user configs hold a copy of the value, so they would
  keep -1.
- `src/pages/PasswordResetRequestsPage.test.tsx` failed once in a full vitest
  run and passed on the next three (known flaky, see `bugs.md`).
