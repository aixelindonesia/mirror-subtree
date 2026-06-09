# mirror-subtree

A composite GitHub Action that force-pushes a **subdirectory (subtree)** of the
current repository to a **mirror repo** using an SSH deploy key. The subtree is
extracted with `git subtree split` (re-rooted history — the prefix becomes the
repo root) and force-pushed. Sibling of
[`mirror-repo`](https://github.com/aixelindonesia/mirror-repo), which mirrors a
whole repository.

## Usage

```yaml
name: Mirror Subtree

on:
  push:
    branches: [main]
    paths: ['apps/web/**']
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: mirror-subtree-${{ github.ref }}
  cancel-in-progress: false

jobs:
  mirror:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: aixelindonesia/mirror-subtree@v2
        with:
          target-repo: git@github.com:OWNER/REPO.git
          prefix: apps/web
          sync-branches: main
          ssh-private-key: ${{ secrets.PERSONAL_REPO_SSH_KEY }}
```

> The action does its own `checkout` (full history) — the caller workflow needs
> no separate checkout step. Full history is required for `git subtree split`.
>
> The SSH secret name is the **caller's** choice — pass whatever secret the repo
> already has (`PERSONAL_REPO_SSH_KEY`, `PRIVATE_REPO_SSH_KEY`, etc.). The action
> never hardcodes it.

## Inputs

| Input             | Required | Default              | Description                                                                 |
| ----------------- | -------- | -------------------- | --------------------------------------------------------------------------- |
| `target-repo`     | yes      | —                    | SSH URL of the mirror, `git@github.com:owner/repo.git`                       |
| `prefix`          | yes      | —                    | Subdirectory to mirror, relative to repo root (e.g. `apps/web`)             |
| `ssh-private-key` | yes      | —                    | Private key; pass the repo's existing SSH secret                            |
| `sync-branches`   | no       | `main`               | Space-separated source branches or `source:target` mappings, e.g. `"main staging"` or `"dev:main"` |
| `git-user-name`   | no       | — (skips commit)     | Committer name for the empty sync commit; needs `git-user-email` too        |
| `git-user-email`  | no       | — (skips commit)     | Committer email; needs `git-user-name` too                                  |

## Branch mapping

- `sync-branches: dev` mirrors source `dev` to mirror `dev`.
- `sync-branches: dev:main` mirrors source `dev` to mirror `main`.
- Multiple entries are supported, e.g. `sync-branches: "dev:main staging:preview"`.

## One-time setup per consuming repo

1. Generate a keypair (no passphrase):
   ```bash
   ssh-keygen -t ed25519 -C "<repo>-subtree" -f /tmp/<repo>-subtree -N ""
   ```
2. **Mirror repo** → Settings → Deploy keys → add the **public** key with **write** access.
3. **Source repo** → Settings → Secrets and variables → Actions → add the
   **private** key as a secret (any name), and reference that name in
   `ssh-private-key`.
4. Add the caller workflow above as `.github/workflows/mirror-subtree.yml`.

## Notes

- History is **re-rooted**: only commits touching `prefix` are kept, with the
  prefix stripped so its contents sit at the mirror's root. Split commit SHAs are
  deterministic for a given history, so re-runs are idempotent.
- `git subtree split` is O(history) — it walks the full history each run. On large
  monorepos this can be slow; bump `timeout-minutes` accordingly.
- The push is `--force` — the mirror branch is overwritten; treat it as one-way.
- When both `git-user-name` and `git-user-email` are set, each mirrored entry
  appends an empty `chore: sync` commit on top of the split. Leave both empty to
  push the split verbatim.
- Filter `on.push.paths` to the prefix so the mirror only runs when the subtree
  actually changes.

## Versioning

Consumers pin `@v2`. Releases are cut as `vX.Y.Z` tags with a moving `vX` tag.
