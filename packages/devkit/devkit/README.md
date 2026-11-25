# @aixel-id/devkit

The copier: `add <tool>... [--from <checkout|git url>] [--ref <tag|commit>]` copies a tool into `packages/<owner>/<tool>/` and records each file's hash in `devkit.lock.json`; `check` fails a changed, missing, or extra file. `--dir <project>` targets a project inside the checkout. [Taking a tool](https://github.com/aixelindonesia/devkit/blob/main/guidelines/taking-a-tool.md) holds the rules and the steps.
