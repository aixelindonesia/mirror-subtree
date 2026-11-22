---
status: draft
---

# Glossary

| Term | Meaning here | Not to be confused with |
| --- | --- | --- |
| Mirror | The repository the action pushes to, named by `target-repo`. | A GitHub fork. |
| Prefix | The subdirectory to mirror, relative to the repository root. | A branch prefix. |
| Split | The re-rooted history `git subtree split` makes from the commits that touch the prefix. | `git subtree push`, which the action does not use. |
| Branch mapping | One `sync-branches` entry, `source` or `source:target`. | |
| Sync commit | The empty `chore: sync` commit added on the split when both git identity inputs are set. | A merge commit. |
| Moving major tag | `v2`, moved to each `v2.x.y` release so callers of `@v2` take it. | A release tag, `vX.Y.Z`. |
