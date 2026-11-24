---
title: 'CLI reference'
description: 'How to call relief.'
---

relief is a desktop app: you launch it on a repository and it opens its window.

## relief [path] [range]

`relief [PATH] [RANGE]` opens the map of the repository at `PATH` ; without `PATH`, `relief` opens the welcome screen (recent repositories, folder picker), not the current folder (`relief .`). With no range, the map shows the default comparison of the repository: the working tree against `main`, or the one saved with **Set as default**. A range is written `A...B` (against the merge base) or `A..B`.

## relief file.relief.json

`relief <name>.relief.json`, or `relief FOLDER` when the folder holds a `.relief.json` file, opens the multi-repository workspace (see [Get started](../getting-started/#workspace)). Its data is in the `.relief/` next to the file.

## Options and environment

- `RELIEF_CACHE_DIR`: folder of relief's data, instead of `.relief/` at the root of the repository.
- `--version` prints the version.

## Exit code

If the repository cannot be opened (missing path, folder outside a git repository, invalid range), relief prints the error on standard error, opens no window and exits with code 2.
