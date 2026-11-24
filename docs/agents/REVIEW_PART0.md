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
