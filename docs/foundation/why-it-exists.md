# Why mirror-subtree exists

Each entry says what goes wrong, who pays for it, how it is recognised, and the page that answers it.

## A part of a monorepo has to live in its own repository

- Costs: copying the folder by hand loses its history and drifts from the source, and a hand-written split workflow is copied between repositories with its fixes.
- Recognised by: a mirror repository whose history starts at one "import" commit, or two repositories with different copies of a subtree-split workflow.
- Answered by: [the README's Use it section](../../README.md#use-it), one caller of one action.
