# Benchmarks

Real repositories, release build, `just bench` (`relief-bench` binary of `tests/relief-bench`). Each clone gets its own `.relief/` folder, created by the `Session`. Clones live in `${RELIEF_BENCH_DIR:-$HOME/dev/relief-bench}`; the recipe clones only when the folder is missing (`git clone --depth 400 --single-branch`, then checkout of the SHA).

## Run of 2026-11-20

Machine: AMD Ryzen 7 7700X (8 cores, 16 threads), 30 GiB RAM, Linux 6.18. The indexing is single-threaded.

Measures (one run each, wall-clock, one process):

- `open_snapshot_cold`: `.relief/cache/` deleted, then `Session::open` + `snapshot(HEAD)`.
- `open_snapshot_warm`: the same with the cache filled (a new `Session`, so no memory hit).
- `analyse`: `Session::analyse` on the range below (base and head are two commits not yet in memory; their blobs come from the cache).
- `snapshot_budget`: `snapshot(HEAD)` capped at 2,000 nodes, the session being warm.

### excalidraw

SHA `2c3dcc06ec807e81ab9437eceb1a8f7a3c590743`, 702 `.ts`/`.tsx` files. Range: `8fd970320e1d754d1c76bc31abc440b9d88aafab..47cbb5b6fbeba23fbdfb72729159d723f1176746` (one squash-merged PR, 56 files changed, 50 of them `.ts`/`.tsx`; the history has no merge commit).

| Measure            | Time     | Nodes | Files |
| ------------------ | -------- | ----- | ----- |
| open_snapshot_cold | 2,743 ms | 6,064 | 1,051 |
| open_snapshot_warm | 1,612 ms | 6,064 | 1,051 |
| analyse            | 3,111 ms | 112   | 56    |
| snapshot_budget    | 16 ms    | 1,529 | 829   |

(`analyse` counts changed nodes and changed files; the other lines count the nodes and file nodes of the graph.)

### n8n

SHA `b12dbc37be53b1d0e151de30debc0a4281502a9c`, 25,662 `.ts`/`.tsx` files. Range: `ce38a064e6d26545108b14c3895d276118c8277e..fea1ec010611045cea92f0e7fecdf2f59e79618b` (one squash-merged PR, 54 files changed, 44 of them `.ts`/`.tsx`).

| Measure            | Time      | Nodes   | Files  |
| ------------------ | --------- | ------- | ------ |
| open_snapshot_cold | 54,108 ms | 157,034 | 35,693 |
| open_snapshot_warm | 30,043 ms | 157,034 | 35,693 |
| analyse            | 65,273 ms | 101     | 54     |
| snapshot_budget    | 356 ms    | 1,258   | 1,140  |

## Budgets

| Budget                           | Target                            | Measured       | Held |
| -------------------------------- | --------------------------------- | -------------- | ---- |
| Warm indexing, 5,000 files < 2 s | excalidraw: 0.28 s (702 ts files) | 1.61 s         | no   |
| Same, pro rata                   | n8n: 10.3 s (25,662 ts files)     | 30.0 s         | no   |
| Diff of a PR of 50 files < 1 s   | < 1 s                             | 3.1 s / 65.3 s | no   |
| Budgeted snapshot                | none                              | 16 ms / 356 ms | -    |

## Where the time goes

Fixed during this ticket (found with per-phase timers, cold/warm excalidraw before, same machine):

- `relief-lang-ts` compiled the tree-sitter symbol query for every file (`Query::new` in `index_file`): now compiled once per grammar. Warm 3,520 ms to 1,650 ms, cold 6,180 ms to 2,740 ms.
- `relief-index` looked a path up with a linear scan of the tree entries for every blob read: now a map (no gain on excalidraw, large on 40,000-entry trees such as n8n).
- `relief-lang-ts` parsed `tsconfig.json` / `package.json` again for every import: now once per linked file (no measurable gain alone).
- `relief-git` `repo_id` and the log walks failed on shallow clones (parent of the oldest commit missing): they now stop at the boundary.

Left, warm excalidraw (1.6 s): about 1.0 s parsing the files again in the link phase, 0.5 s resolving references, the rest listing and graph building. The disk cache keeps the extraction (symbols) but not the file index that `link` needs, so every snapshot, warm or not, parses each file once; `analyse` indexes both sides in full (two snapshots, so two parses of every file). Persisting the file index in the cache (or sharing one parse between `extract` and `link`) would remove most of the warm time and about half of `analyse`.

## Shallow clones

The clones are shallow (`--depth 400`). `repo_id` (the name of the data folder when it falls back to the user cache, and a cache key) is the SHA of the oldest stored commit, so it is not the same as in a full clone of the same repository, nor between clones of different depths. Churn and co-change ignore the commit at the shallow boundary (no parent to compare it with). The measures above (indexing, `analyse`, budgeted snapshot) do not depend on either, so they were not run again.
