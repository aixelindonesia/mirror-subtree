---
bump: patch
---
### Changed

- The action file is `action.yaml`; callers of `aixelindonesia/mirror-subtree@v2` need no change.
- `actions/checkout` moves to v7.0.1 and `webfactory/ssh-agent` stays at v0.10.0, both pinned by commit SHA.
- The README caller is `.github/workflows/mirror-subtree.yaml` with top-level `permissions: {}`, job permissions, and a SHA-pinned `uses:`.
