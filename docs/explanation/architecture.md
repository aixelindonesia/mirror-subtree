# Architecture

The action is one composite [`action.yaml`](../../action.yaml) whose steps run in the caller's job.

```mermaid
flowchart LR
  C[actions/checkout, full history] --> K[webfactory/ssh-agent loads the key]
  K --> H[ssh-keyscan github.com]
  H --> S[check git-subtree is installed]
  S --> F[git fsck]
  F --> I[git identity, when both inputs are set]
  I --> R[add the mirror remote]
  R --> V[validate the prefix and each branch mapping]
  V --> P[per mapping: subtree split, optional sync commit, force push]
```

Inputs reach shell steps through `env`, never through `${{ }}` inside `run`, so an input cannot inject shell code.
`git subtree split` walks the whole history on each run, so its time grows with the repository.
