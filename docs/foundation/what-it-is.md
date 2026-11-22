---
status: draft
---

# What mirror-subtree is

`mirror-subtree` is a composite GitHub Action that splits one subdirectory of the calling repository with `git subtree split` and force-pushes the result to a mirror repository over SSH with a deploy key.
Its readers are the people who publish one part of a monorepo, such as `apps/web`, as its own repository.

## Current shape

- One [`action.yaml`](../../action.yaml) with six inputs: `target-repo`, `prefix`, `ssh-private-key`, `sync-branches`, `git-user-name`, and `git-user-email`.
- Releases tagged `vX.Y.Z` with a moving `v2`, recorded in [`CHANGELOG.md`](../../CHANGELOG.md).

## What it is for

- Mirroring one subdirectory one way, with its history re-rooted so the prefix is the mirror's root.

## What it is not for

- Mirroring a whole repository, which [`mirror-repo`](https://github.com/aixelindonesia/mirror-repo) does.
- Two-way sync: the push is `--force`, so the mirror branch is overwritten.
