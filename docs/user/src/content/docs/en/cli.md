---
title: 'CLI reference'
description: 'How to call relief.'
---

relief is a desktop app: you launch it on a repository and it opens its window.

## relief [path] [range]

`relief [PATH] [RANGE]` opens the map of the repository at `PATH` (the current folder by default). With no range, the map shows `HEAD` up to the working tree. A range is written `A...B` (against the merge base) or `A..B`.

## Options and environment

- `RELIEF_CACHE_DIR`: folder of relief's data, instead of `.relief/` at the root of the repository.
- `--version` prints the version.

## Exit code

If the repository cannot be opened (missing path, folder outside a git repository, invalid range), relief prints the error on standard error, opens no window and exits with code 2.
