<!-- readme:product -->
# mirror-subtree

A composite GitHub Action that force-pushes one subdirectory of the current repository to a mirror repository using an SSH deploy key.
It extracts the subdirectory with `git subtree split`, so the prefix becomes the mirror's root; its sibling [`mirror-repo`](https://github.com/aixelindonesia/mirror-repo) mirrors a whole repository.

<!-- readme:contents -->
## What is inside

| Path | What it holds |
| --- | --- |
| [`action.yaml`](action.yaml) | The composite action: its inputs and steps. |
| [`CHANGELOG.md`](CHANGELOG.md) | The releases, folded from `.changes/` by [`scripts/assemble-changelog.mjs`](scripts/assemble-changelog.mjs). |
| [`docs/`](docs/README.md) | What it is, why it exists, its glossary, how it works, and how to verify a change. |

<!-- readme:usage -->
## Use it

Add this caller as `.github/workflows/mirror-subtree.yaml`:

```yaml
name: Mirror Subtree

on:
  push:
    branches: [main]
    paths: ['apps/web/**']
  workflow_dispatch:

permissions: {}

concurrency:
  group: mirror-subtree-${{ github.ref }}
  cancel-in-progress: false

jobs:
  mirror:
    runs-on: ${{ vars.CI_RUNNER || 'ubuntu-26.04' }}
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: aixelindonesia/mirror-subtree@bd0d9d54b128af4b0b553877d0a8321b68380989 # v2.0.0
        with:
          target-repo: git@github.com:OWNER/REPO.git
          prefix: apps/web
          sync-branches: main
          ssh-private-key: ${{ secrets.PERSONAL_REPO_SSH_KEY }}
```

The action checks out the full history itself, which `git subtree split` needs, so the caller has no checkout step.
The SSH secret name is the caller's: pass the secret the repository already has, such as `PERSONAL_REPO_SSH_KEY` or `PRIVATE_REPO_SSH_KEY`.
Take a later version by moving the pin to the commit of a newer `vX.Y.Z` tag; Renovate does this for a repository that extends the org preset.

### Inputs

| Input             | Required | Default              | Description                                                                 |
| ----------------- | -------- | -------------------- | --------------------------------------------------------------------------- |
| `target-repo`     | yes      | —                    | SSH URL of the mirror, `git@github.com:owner/repo.git`                       |
| `prefix`          | yes      | —                    | Subdirectory to mirror, relative to repo root (e.g. `apps/web`)             |
| `ssh-private-key` | yes      | —                    | Private key; pass the repo's existing SSH secret                            |
| `sync-branches`   | no       | `main`               | Space-separated source branches or `source:target` mappings, e.g. `"main staging"` or `"dev:main"` |
| `git-user-name`   | no       | — (skips commit)     | Committer name for the empty sync commit; needs `git-user-email` too        |
| `git-user-email`  | no       | — (skips commit)     | Committer email; needs `git-user-name` too                                  |

### Branch mapping

- `sync-branches: dev` mirrors source `dev` to mirror `dev`.
- `sync-branches: dev:main` mirrors source `dev` to mirror `main`.
- Multiple entries are supported, e.g. `sync-branches: "dev:main staging:preview"`.

### One-time setup per consuming repo

1. Generate a keypair (no passphrase):
   ```bash
   ssh-keygen -t ed25519 -C "<repo>-subtree" -f /tmp/<repo>-subtree -N ""
   ```
2. **Mirror repo** → Settings → Deploy keys → add the **public** key with **write** access.
3. **Source repo** → Settings → Secrets and variables → Actions → add the
   **private** key as a secret (any name), and reference that name in
   `ssh-private-key`.
4. Add the caller workflow above as `.github/workflows/mirror-subtree.yaml`.

### Notes

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

<!-- readme:changing -->
## Changing this repository

[`AGENTS.md`](AGENTS.md) holds the rules for a change; [Verify a change](docs/how-to/verify-change.md) says how to prove one.
Releases are SemVer `vX.Y.Z` tags with a moving major tag `v2`, by [changelog's versioning guideline](https://github.com/aixelindonesia/changelog/blob/main/guidelines/versioning.md).
Which repository owns each neighbouring subject is in [Where guidance lives](https://github.com/aixelindonesia/how-we-build/blob/main/guidelines/where-guidance-lives.md).
