# AGENTS.md - mirror-subtree

This is a public composite GitHub Action that force-pushes one subdirectory to a mirror repository. The [README](README.md) says what is inside and how a caller uses it.

## Rules

1. Every `uses:` in `action.yaml` pins a full commit SHA with its version as a comment, at the newest release past the 7-day cooldown.
2. The README caller passes the fleet's workflow rules: a `.yaml` file name, top-level `permissions: {}` with job permissions, and a SHA-pinned `uses:`.
3. A change a caller sees adds a fragment in `.changes/` with its bump; a release runs `node packages/devkit/changelog/assemble-changelog.mjs`, tags `vX.Y.Z` annotated on the merge commit, and moves the lightweight `v2` tag to it.
4. A page an agent writes or rewrites gets `status: draft`; only a person raises it.

## Verification

[Verify a change](docs/how-to/verify-change.md) lists the checks a change passes before merge.
