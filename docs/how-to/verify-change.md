# Verify a change

The repository has no package and no Taskfile; a change passes these checks before merge.

1. From a [`repo-rules`](https://github.com/aixelindonesia/repo-rules) checkout, run `mise exec -- pnpm -s fleet --worktree <path to this checkout>`. It prints one row whose `errors` column is `0`, or names each failing rule.
2. From the same checkout, run `mise exec -- pinact run --check --verify-comment <path>/action.yaml` and `mise exec -- zizmor --offline <path>/action.yaml`. Both print no finding.
3. Run `node packages/devkit/devkit/devkit.mjs check`. It prints `devkit: 2 copies match devkit.lock.json`.
4. Copy the README caller into a scratch repository as `.github/workflows/mirror-subtree.yaml` and run the fleet on it; the workflow rules pass.
