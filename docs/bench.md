# Benchmarks

Real repositories, release build, `just bench` (`relief-bench` binary of `tests/relief-bench`). Each clone gets its own `.relief/` folder, created by the `Session`. Clones live in `${RELIEF_BENCH_DIR:-$HOME/dev/relief-bench}`; the recipe clones only when the folder is missing (`git clone --depth 400 --single-branch`, then checkout of the SHA).

## Run of 2026-11-20, after S04 (file index in the cache)

Machine: AMD Ryzen 7 7700X (8 cores, 16 threads), 30 GiB RAM, Linux 6.18. The indexing is single-threaded.

Measures (one run each, wall-clock, one process):

- `open_snapshot_cold`: `.relief/cache/` deleted, then `Session::open` + `snapshot(HEAD)`.
- `open_snapshot_warm`: the same with the cache filled (a new `Session`, so no memory hit).
- `analyse`: `Session::analyse` on the range below (base and head are two commits not yet in memory; their blobs come from the cache).
- `snapshot_budget`: `snapshot(HEAD)` capped at 2,000 nodes, the session being warm.

Before / after S04 on the same code base (HEAD of S03, release build, same machine). The node counts of the first S02 run were a little different (6,064 and 1,529 on excalidraw) because S03 changed the budgeted reading; S04 changes no result.

### excalidraw

SHA `2c3dcc06ec807e81ab9437eceb1a8f7a3c590743`, 702 `.ts`/`.tsx` files. Range: `8fd970320e1d754d1c76bc31abc440b9d88aafab..47cbb5b6fbeba23fbdfb72729159d723f1176746` (one squash-merged PR, 56 files changed, 50 of them `.ts`/`.tsx`; the history has no merge commit).

| Measure            | Before   | After    | Nodes | Files |
| ------------------ | -------- | -------- | ----- | ----- |
| open_snapshot_cold | 2,720 ms | 1,266 ms | 6,097 | 1,051 |
| open_snapshot_warm | 1,617 ms | 134 ms   | 6,097 | 1,051 |
| analyse            | 3,195 ms | 1,021 ms | 112   | 56    |
| snapshot_budget    | 16 ms    | 16 ms    | 1,483 | 781   |

(`analyse` counts changed nodes and changed files; the other lines count the nodes and file nodes of the graph.)

### n8n

SHA `b12dbc37be53b1d0e151de30debc0a4281502a9c`, 25,662 `.ts`/`.tsx` files. Range: `ce38a064e6d26545108b14c3895d276118c8277e..fea1ec010611045cea92f0e7fecdf2f59e79618b` (one squash-merged PR, 54 files changed, 44 of them `.ts`/`.tsx`).

| Measure            | Before (S02) | After     | Nodes   | Files  |
| ------------------ | ------------ | --------- | ------- | ------ |
| open_snapshot_cold | 54,108 ms    | 29,589 ms | 157,166 | 35,693 |
| open_snapshot_warm | 30,043 ms    | 4,991 ms  | 157,166 | 35,693 |
| analyse            | 65,273 ms    | 13,352 ms | 101     | 54     |
| snapshot_budget    | 356 ms       | 377 ms    | 186     | 57     |

(The n8n "before" column is the S02 run, not re-measured on the S03 code.)

## Budgets

| Budget                           | Target                            | Measured        | Held |
| -------------------------------- | --------------------------------- | --------------- | ---- |
| Warm indexing, 5,000 files < 2 s | excalidraw: 0.28 s (702 ts files) | 0.13 s          | yes  |
| Same, pro rata                   | n8n: 10.3 s (25,662 ts files)     | 5.0 s           | yes  |
| Diff of a PR of 50 files < 1 s   | < 1 s                             | 1.02 s / 13.4 s | no   |
| Budgeted snapshot                | none                              | 16 ms / 377 ms  | -    |

## Where the time goes

Fixed in S02 (found with per-phase timers):

- `relief-lang-ts` compiled the tree-sitter symbol query for every file: now once per grammar.
- `relief-index` looked a path up with a linear scan of the tree entries for every blob read: now a map.
- `relief-lang-ts` parsed `tsconfig.json` / `package.json` again for every import: now once per linked file.
- `relief-git` `repo_id` and the log walks failed on shallow clones: they now stop at the boundary.

Fixed in S04:

- The cache (format version 5) keeps, next to the extraction of a blob, the serialised file index that `link` needs; `link` no longer parses any file on a warm snapshot (zero parses, checked by `TsAdapter::parses()`). On a cold run `extract` and `link` share one parse.
- The `Indexer` remembers the blobs it extracted, so `analyse` (and any snapshot of a nearby commit in the same session) parses only the blobs it has not seen: the base side costs the changed blobs, not the whole tree. The signature texts of changed files are taken from the same parse.

Left:

- `analyse` on excalidraw is 1.02 s, just over the 1 s budget, and 13.4 s on n8n. Both sides are still listed, read and linked in full: link resolves every import and reference of every file (about 0.5 s on excalidraw, most of the 1.0 s), and it runs twice, once per side. The parse is gone; the resolution and the graph building are not incremental. Linking only the files whose blob or whose imports changed would be the next step.
- The warm n8n snapshot (5.0 s) is the sum of reading the 25,000 blobs, deserialising their indexes and the link resolution; it is under the pro rata budget (10.3 s).
- The cold run is still the cost of one tree-sitter parse per file (about 1.2 ms), now paid once instead of twice.

## Shallow clones

The clones are shallow (`--depth 400`). `repo_id` (the name of the data folder when it falls back to the user cache, and a cache key) is the SHA of the oldest stored commit, so it is not the same as in a full clone of the same repository, nor between clones of different depths. Churn and co-change ignore the commit at the shallow boundary (no parent to compare it with). The measures above (indexing, `analyse`, budgeted snapshot) do not depend on either, so they were not run again.
