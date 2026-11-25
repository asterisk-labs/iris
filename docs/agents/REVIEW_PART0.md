# Part 0 (0.2.C to 0.2.G): points for review

Decisions taken on `part0-remaining`, and things that still need a person to
look at them. Delete this file when the PR is merged.

## Settled on 2026-11-25

- The image dropdown sorts by name, with buttons for the user's own order and
  for images they have not annotated, and a search box.
- `n_jobs` defaults to 4 and always comes from the project file. A fit that
  took 0.03 s with 4 threads took 15 s with 192.
- Bing stays removed. ESA issues #47 and #59 can be closed under T0.9.
- Breaking changes to expressions and config settings are fine, and what
  saving preferences does to a config file is not a concern for now.
- The admin lists (users, actions, images) need an admin. Other users' emails
  are no longer shown through `/api/v1/users/<id>` or its profile. Only its
  owner or an admin can edit an action's difficulty, notes and complete flag.

## Still open

- `save_mask` still checks its marker bytes with `and` (in `bugs.md`).
- Logging out is a GET request.
- The JSON-template idea for views in fork issue #8 is undecided. `parse` is
  separate from `evaluate`, so a JSON form could map onto the same evaluator.
- The database columns `user.tested` and `action.type` remain: dropping them
  needs a migration.
- New runtime dependency: `pydantic>=2.5`. gt-sse-center PR #19 (rjsf form)
  was not reused; its form is a separate app and rjsf is a heavy dependency.
- The `/previous_image` redirect, which the UI does not call, steps back in
  the user's order rather than to where a prioritised "next" came from.
- `cy.login` guesses after a fixed wait whether a login is needed; the
  preferences spec still uses it.
- Python 3.12 is the minimum (supported until October 2028), and the Docker
  image uses it. Coverage and Cypress run in the Ubuntu 3.12 job.
- CI runs once, when a PR is marked ready for review, plus weekly. It no
  longer runs on pushes, including merges to `overhaul`.
