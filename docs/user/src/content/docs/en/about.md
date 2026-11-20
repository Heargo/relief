---
title: 'About'
description: 'What relief is and is not.'
---

What relief is and is not.

## Principles

relief is a local client: no remote server, no account, no AI. Everything shown is computed deterministically from git.

## Supported languages

relief works on **any git repository**: without an adapter, the map shows the folders and files, and the [logical coupling](../explore/#logical-coupling) links the files that change together. A language adapter adds the symbols (functions, classes, methods) and the fine links between them (imports, calls, references):

| Language               | Files                                        | Packages                                          | What is read                                                                                                                    |
| ---------------------- | -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, JavaScript | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx` | `package.json` (npm, pnpm, yarn workspaces)       | symbols, imports, calls, JSX renders, type references, HTTP calls, routes, pages, jobs                                          |
| Python                 | `.py`                                        | `pyproject.toml` (PEP 621, Poetry, uv workspaces) | functions, classes, methods (a name starting with `_` is internal), relative and absolute imports, calls, annotation references |

Each `package.json` with workspaces and each `pyproject.toml` becomes a system. The ones under a test fixtures folder (`fixtures`, `__fixtures__`, `testdata`, `test-fixtures`) are ignored for this: their files stay on the map, like any other folder. Files outside every system are grouped by folder.

For both languages, relief compares signatures: an added or removed required parameter is **breaking**, a parameter with a default value is **compatible**.

Known limits in Python: the standard library (`os`, `dataclasses`…) shows as an external dependency; a parameter that becomes keyword-only (`*`) or positional-only (`/`) is not yet seen as breaking; Flask and FastAPI routes are not entry points yet.

## License

See the project repository.
