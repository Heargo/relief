---
title: 'Workspace'
description: 'Read several repositories together: create a workspace, add repositories, label them, compare them, follow the arrows between repositories.'
---

A workspace groups several repositories (a front end, an API, a shared library) so you can review a change that crosses them on a single map. This page covers it from start to finish; the file format is detailed in [Get started](../getting-started/#workspace).

## Create a workspace from the welcome screen

1. Run `relief` with no argument: the welcome screen appears.
2. Click **Create a workspace from a repository…**.
3. Pick the starting repository (for example your front end), then the folder of the workspace. The folder must not be inside the repository.

relief writes `<repository-name>.relief.json` in that folder and opens the workspace, which holds only that repository for now. The workspace joins the recents of the welcome screen.

From a repository that is already open, **Workspace** > **Open this repository as a workspace** does the same for the repository shown. For an existing workspace, use **Open a workspace…** (welcome screen or menu).

## Add repositories

In a workspace, **Workspace** > **Add a repository to the workspace…** opens the folder picker; the chosen repository (for example the API) is added to the workspace file and the map reloads. A repository name is unique in the workspace; the entry is greyed out outside a workspace.

The member repositories stay untouched: relief writes nothing in them.

## Label

The header of the left panel lists each repository with its branch and labels. The **+** button of a repository offers `front`, `back`, `ops`, `tools` and your own labels; a click adds or removes one. The choice is written to the workspace file and shown on the box of the repository. **Filter by label** (section **Display**) hides the repositories that do not carry the chosen label. Details in [The map](../map/#labelling-the-repositories-of-a-workspace).

## Compare each repository

Each repository is compared on its own range: by default, its working tree against `main`, else `master`, else its current branch. The **Comparisons per repository** button (under the Review / Explore switch) lists one row per repository, where you change the source or the destination; **Set as default** writes it to the workspace file. Details in [Review a PR](../review/#compare-each-repository-of-a-workspace).

A change that touches the front end and the API thus shows on the same map: at the **Repos** level both boxes are marked; going down to the files, the modified files of each repository are marked too, with the reading order and the impact across the whole.

## Follow an arrow between repositories

Two kinds of link connect repositories:

- a **package import**: when a repository imports a package that another repository of the workspace publishes (the `name` of a `package.json` or `pyproject.toml`), the arrow goes to the entry point of the package, not to an external dependency;
- an **HTTP call**: a call like `fetch("/orders")` is linked to the `GET /orders` route declared in another repository, by the same rule as inside a repository.

At the **Repos** level these links are grouped into one arrow from a repository to the other; click it to list its links and their usages. In Review mode, unchanged arrows are hidden by default: turn on **Unchanged edges** to see those that did not move. The impact of a route change reaches the callers across repositories.

## Read code, search, browse the history

Everything you do on a node or an arrow works in a workspace, on the range of the repository it belongs to: the code of a file or a symbol (base or head side), its text diff, the usages of an arrow, including between two repositories. The search (`/`) covers every repository, and so does Explore mode (churn, owners, co-change); co-change only links files of the same repository.

There is no common order between the commits of different repositories. The log and the per-commit reading therefore list the commits of each repository one after the other, in the order of the workspace file, each preceded by the name of its repository (the requested `rev` is ignored: each repository is read from its source, and the limit applies to each repository). The same goes for Explore mode: metrics and co-change read each repository at its source.

## Limits

- Architecture rules (`relief.config.yaml`) are not evaluated in a workspace.
- The comparison is set repository by repository; there is no range shared by the whole workspace.
