# Expected outcomes

## Success criteria

- A caller copied from the README passes repo-rules' workflow rules: `gha-pin-actions-to-sha`, `yaml-extension`, and `workflow-basics/permissions`.
- Every `uses:` in `action.yaml` is pinned by SHA with a version comment that `pinact run --check --verify-comment` accepts.
- An existing caller of `@v2` keeps working after each release, because `v2` moves to the newest `v2.x.y`.

## Non-goals

- Mirroring a whole repository, or syncing in both directions.
