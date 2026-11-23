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

## Map render (S05)

`just bench-ui` (harness `tests/e2e/wdio.bench.conf.ts` and `tests/e2e/bench/`, same driver and config as `just e2e` but never part of it): WebdriverIO on the release app, window 1600x900, one run on `dense` (10 packages x 150 files, 3 imports per file, 30 files modified in the working tree; opened without range) and on the excalidraw clone of S02 (range of the table above). The numbers are written to `target/bench-ui/<repo>.json`. It needs the clone of `just bench`.

Machine: the one above, under Xvfb with software rendering (no DRI3: `MESA-EGL: warning`), so the paint and the raster are slow and the absolute figures are pessimistic; the split between phases is what matters.

How it measures. Events are dispatched from the page, one per animation frame (120 pointer moves for the pan, 80 wheel events for the zoom, half in and half out; 8 to 12 clicks on nodes spread over the screen for the selection). After each event the script waits for a macrotask (the effects of Angular have run), then forces style and layout (`offsetHeight`). Per step:

- `work` = event, signals, effects, forced style and layout (ms; the paint and the raster come after and are not in it). It is the number the budget uses. As the steps are sequential, `frame` (distance between two animation frames) is almost the same number.
- `compute` = self time of the `computed` of `MapBusiness` (`visibleNodes`, `boxIds`, `allEdges`, `edgeLines`, `coChangeLines`); `dom` = self time of the `sync*` of `MapCanvasComponent`. Both come from `performance.measure('relief:<name>')` marks (`src/ui/src/app/core/helpers/perf.ts`), which do nothing unless `window.__reliefPerf` is true (the harness sets it): one property read per call.
- `layout` = the forced style and layout. The rest of `work` is "other": Angular change detection of the panels, the handlers.
- Long tasks: the Long Tasks API does not exist in this WebKitGTK (`PerformanceObserver.supportedEntryTypes` has no `longtask`), so the harness counts the steps whose `work` exceeds 50 ms (they are single tasks, since each step is one task chain).

Two states per repository: `fit` (the view the app opens on) and `zoomed` (wheel zoom at the centre until at least 400 nodes are in the DOM). During the zoom scenario the camera goes in and back out, so it crosses the levels around the state it started from. Medians (p50) do not add up exactly; "other" is `work` minus the three others at the p50.

### Results of 2026-11-20 (S05, before S06 to S09)

Times in ms, p50 / p95. DOM counts are the `map-node` and `map-edge` elements.

| Repo, state (nodes / edges in the DOM) | Scenario | work (frame) | compute | dom     | layout  | other | Long tasks (> 50 ms)      |
| -------------------------------------- | -------- | ------------ | ------- | ------- | ------- | ----- | ------------------------- |
| dense, fit (1,349 / 4,500)             | pan      | 231 / 248    | 31 / 35 | 85 / 91 | 79 / 84 | ~36   | 120 of 120 steps, max 449 |
| dense, fit                             | zoom     | 119 / 252    | 11 / 30 | 78 / 89 | 29 / 85 | ~1    | 77 of 80, max 376         |
| dense, fit                             | select   | 125 / 177    | 0 / 0   | 11 / 14 | 16 / 75 | ~98   | 8 of 8, max 177           |
| dense, zoomed (1,467 / 30)             | pan      | 31 / 34      | 1 / 2   | 9 / 12  | 14 / 16 | ~7    | 1 of 120, max 70          |
| dense, zoomed                          | zoom     | 123 / 267    | 11 / 33 | 79 / 92 | 30 / 87 | ~3    | 74 of 80, max 535         |
| dense, zoomed                          | select   | 122 / 143    | 0 / 0   | 10 / 12 | 15 / 57 | ~97   | 8 of 8, max 143           |
| excalidraw, fit (57 / 2,742)           | pan      | 80 / 88      | 12 / 16 | 39 / 43 | 26 / 27 | ~3    | 120 of 120, max 184       |
| excalidraw, fit                        | zoom     | 124 / 493    | 19 / 26 | 79 / 89 | 29 / 42 | ~0    | 77 of 80, max 1,031       |
| excalidraw, fit                        | select   | 148 / 242    | 0 / 0   | 24 / 30 | 23 / 95 | ~101  | 10 of 10, max 242         |
| excalidraw, zoomed (839 / 933)         | pan      | 62 / 67      | 7 / 9   | 24 / 28 | 22 / 24 | ~9    | 120 of 120, max 125       |
| excalidraw, zoomed                     | zoom     | 135 / 209    | 18 / 26 | 42 / 88 | 29 / 42 | ~46   | 74 of 80, max 629         |
| excalidraw, zoomed                     | select   | 147 / 212    | 0 / 0   | 23 / 26 | 22 / 93 | ~102  | 11 of 11, max 212         |

(`dense` at the start shows files at once: the fit already holds 1,349 nodes and 4,500 aggregated edges. In the `zoomed` state only 30 edges are drawn, but the zoom scenario goes back through the dense view, hence its figures.)

### Where the time goes

Mean self time per step, from the `relief:*` marks (ms):

| Mark                                                  | dense fit pan                                    | dense fit zoom | excalidraw fit pan | excalidraw zoomed pan |
| ----------------------------------------------------- | ------------------------------------------------ | -------------- | ------------------ | --------------------- |
| `edgeLines` (computed)                                | 30.1                                             | 12.8           | 11.1               | 6.6                   |
| `syncEdges` (DOM)                                     | 73.2                                             | 69.5           | 36.8               | 15.5                  |
| `syncEdgeEmphasis` (DOM)                              | 4.2                                              | 4.6            | 2.2                | 2.0                   |
| `syncNodes` (DOM)                                     | 7.1                                              | 2.1            | 0.5                | 5.6                   |
| `syncNodeEmphasis` (DOM)                              | 0.6                                              | 0.2            | 0.2                | 0.9                   |
| `visibleNodes`, `boxIds`, `allEdges`, `coChangeLines` | < 1 each (`allEdges`: 2 to 3 on excalidraw zoom) |                |                    |                       |

- Pan and zoom with many edges on screen: the DOM writing of the edges (`syncEdges`, 4 to 5 attributes and a tooltip per edge, every frame) is the first cost (about 35 to 40 % of a frame on dense), then the browser's style and layout of the 4,500 paths (about 30 %), then `edgeLines` (shape, status, violations and counts of every edge, 10 to 13 %). The computations that the ticket suspected in the node path (`computeModes`, `visibleNodes`, `boxIds`) are under 1 ms each at this size: they are not where the time is.
- With few edges (dense zoomed, 30 edges) a pan frame costs 31 ms, of which `syncNodes` (style of every node, 1,467) and style/layout split most; this is still twice the budget.
- Zoom is worse than pan because the scale changes: every node and edge changes its geometry and the aggregation (`allEdges`) is invalidated when a level changes.
- Selecting a node costs 120 to 150 ms, of which only 25 to 50 ms are the map's own writes (`syncNodes`, `syncEdges`, emphasis): the other ~100 ms are outside the marks (Angular change detection of the side panel and the node edges, `selectedNodeEdges`, `selectedEdge`, which are not marked), to be broken down by S07.

### Budget for S06 to S09

On the same harness (1600x900, `work` p95, same machine and Xvfb), each S06 to S09 ticket must bring its scenario under the line and not worsen the others:

| Scenario                   | Budget (p95 of `work`)   | Now, dense   | Now, excalidraw | Held |
| -------------------------- | ------------------------ | ------------ | --------------- | ---- |
| Pan, fit and zoomed        | < 16 ms                  | 248 / 34 ms  | 88 / 67 ms      | no   |
| Wheel zoom, fit and zoomed | < 33 ms                  | 252 / 267 ms | 493 / 209 ms    | no   |
| Selection of a node        | < 100 ms                 | 177 / 143 ms | 242 / 212 ms    | no   |
| Long tasks (> 50 ms)       | none during pan and zoom | 120 of 120   | 120 of 120      | no   |

The p95 budgets apply to both repositories (the figures in the table are fit / zoomed). On a machine with a GPU the paint costs less; since `work` leaves the paint out, the budget stays comparable. The harness writes the same JSON after each ticket: S06 to S09 append their column to this table.

### After S06 (camera in one transform)

Nodes and edges are in world units in two layers that carry the same `translate(tx, ty) scale(s)`; a pan writes that transform only. Modes, headers, edge shapes and culling are computed again at rest (120 ms), when a container crosses its opening threshold, or when the pan leaves the render margin. `work` p95 in ms, same harness, fit / zoomed (excalidraw: fit / zoomed):

| Scenario   | dense before | dense after | excalidraw before | excalidraw after |
| ---------- | ------------ | ----------- | ----------------- | ---------------- |
| Pan        | 248 / 34     | 127 / 12    | 88 / 67           | 53 / 32          |
| Wheel zoom | 252 / 267    | 227 / 371   | 493 / 209         | 625 / 296        |
| Selection  | 177 / 143    | 160 / 142   | 242 / 212         | 253 / 248        |

- Pan: the browser's style and layout of the 4,500 edge paths and 1,349 nodes is what is left on `dense` fit (`compute` and `dom` are 0 ms: no computed and no DOM write run during a pan). The budget (p95 < 16 ms) holds on `dense` zoomed (12 ms), not on `dense` fit (127 ms) nor on excalidraw (53 / 32 ms). Promoting the layers (`will-change: transform`) brings `dense` fit to 71 ms but blurs the text at rest (rasterised at another scale), so it was not kept.
- Zoom: no better, and worse where many edges are on screen: each rest or threshold crossing rewrites all the edges (`syncEdges`, 70 to 75 ms p95) and the browser lays out the layer again. S07 (edge drawing) and S08 have to take that: draw fewer edges, do not rewrite unchanged ones.
- Selection is not in the scope of S06.

### After S07 (only what follows the camera is recomputed)

`computeModes` and the visible boxes are one `computed` each, off the camera; the state of each edge (diff status, violations, counts, label, class, tooltip) is computed once per `edges`, `diff`, `violations` and language (`edgeStates`); the shapes are apart (`edgeShapes`) and the label placement uses a grid of the boxes; the emphasis of the selection (`emphasis`) follows the selection, not the camera; `syncEdges` writes an edge only when its key (shape, state, selection, scale, impact path) changed, and its `<title>` is made on the first hover. `work` p95 in ms, same harness, `dense` fit / zoomed:

| Scenario   | dense before (S06) | dense after (S07) |
| ---------- | ------------------ | ----------------- |
| Pan        | 127 / 12           | 126 / 12          |
| Wheel zoom | 227 / 371          | 174 / 341         |
| Selection  | 160 / 142          | 166 / 140         |

- Pan: no change, as expected (nothing is computed nor written during a pan; style and layout of the 4,500 paths are what is left).
- Zoom: the marked computations are now under 3 ms p95 (`edgeLines` 2, `edgeStates` 0 to 1, `emphasis` 1), but a scale threshold crossing still changes the shape of every edge (bend, arrow head and label room are in screen pixels), so every edge is rewritten: `edgeWrite` 56 ms p95 per frame with a write, `syncEdges` 24 ms p95. The p95 < 33 ms budget is not held: drawing fewer edges and a level of detail are S08.
- Selection: the marked work is about 11 ms (`syncNodes` 6, `selectedNodeEdges` 3, emphasis 1, `syncNodeEmphasis` 1; `selectedEdge` is not run). The other ~100 ms (estimated by subtraction, not measured) are outside the marks: Angular change detection of the side panel and the node edges, then the browser's style recalculation of the `data-emph` and class changes on 1,349 nodes and 4,500 edges. The p95 < 100 ms budget is not held and this part is taken by S13 (selection under the budget).

### After S08 (edges out of the view and level of detail)

Edges whose box (the two boxes they join, `edgeBounds`) does not meet the view plus the 120 px render margin are not created. Beyond 500 edges on screen (`EDGE_MERGE_THRESHOLD`), the unchanged edges are one `path` (`map-edges-merged`, no arrow, label or hit zone); changed, violating, selected and impact-path edges keep the full rendering. A click is matched to a merged edge by `nearestEdge` (6 px, pure function). `work` p95 in ms, same harness, fit / zoomed (excalidraw: fit / zoomed). Two runs differ a lot on the zoom lines (the zoom p95 rests on a few frames above 100 ms), both are given:

| Scenario   | dense before (S07) | dense after (run 1 / run 2) | excalidraw before (S06) | excalidraw after (run 1 / run 2) |
| ---------- | ------------------ | --------------------------- | ----------------------- | -------------------------------- |
| Pan        | 126 / 12           | 11 / 11 and 10 / 11         | 53 / 32                 | 11 / 7 and 3 / 7                 |
| Wheel zoom | 174 / 341          | 40 / 62 and 38 / 220        | 625 / 296               | 401 / 110 and 120 / 114          |
| Selection  | 166 / 140          | 171 / 144 and 163 / 136     | 253 / 248               | 106 / 104 and 151 / 135          |

- Pan: the budget (p95 < 16 ms) is held on both repositories, fit and zoomed.
- Zoom: the budget (p95 < 33 ms) is not held. What is left: `allEdges` (7 to 10 ms) and `edgeStates` (15 to 19 ms on excalidraw) are recomputed for every edge at each threshold crossing, whatever the view; `syncNodes` 9 to 12 ms; the rest is style and layout of the browser. Computing the states and the shapes of the edges in view only is the next step.
- Selection: not in the scope of S08 (S13).

#### S08, second step (states and shapes of the edges in view only)

The state and the shape of an edge are made on demand, for the edges that meet the view plus the render margin, and kept per edge until `edges`, `diff`, `violations`, the language, the layout or the scale change. The edges a selection singles out (linked, picked, folded) keep their full rendering, so the common path only holds edges the selection dims; it is dimmed (`dim`) while something is selected. `work` p95 in ms, two passes (run A / run B), fit / zoomed:

| Scenario   | dense                   | excalidraw              |
| ---------- | ----------------------- | ----------------------- |
| Pan        | 14 / 12 and 11 / 11     | 3 / 9 and 3 / 7         |
| Wheel zoom | 49 / 204 and 41 / 202   | 116 / 106 and 111 / 100 |
| Selection  | 160 / 148 and 163 / 136 | 170 / 142 and 157 / 146 |

- Pan: budget held on both, except dense fit at 14 ms in run A (12 ms zoomed), still under 16.
- Zoom: the budget (p95 < 33 ms) is still not held. The marked work is now small (`edgeStates` 2 to 8 ms, `edgeLines` 4 to 18, `syncNodes` 4 to 9, `allEdges` 4 to 10; `compute` 19 to 23 ms in total, `dom` 5 to 12, `layout` 11 to 15). What is left, 40 to 200 ms, is outside the marks: the browser's style recalculation and paint-side work on the 1,300 to 1,500 nodes (dense zoomed: 1,379 nodes, 30 edges) at each threshold crossing, which changes the content of every open box. Taking it needs fewer node rewrites per crossing (nodes, not edges), which is not in S08.

### S14 spike (renderer: DOM + SVG against Canvas 2D)

During the spike, `just bench-ui` took `RELIEF_RENDERER=dom|canvas` (prototype painter behind `?renderer=canvas`; both removed in S20) and wrote `target/bench-ui/<repo>-<renderer>.json`, with the three worst steps of each scenario and their marks (`worst`). Same harness otherwise, Xvfb. `work` p50 / p95 in ms, fit / zoomed:

| Scenario   | dense DOM       | dense Canvas | excalidraw DOM  | excalidraw Canvas |
| ---------- | --------------- | ------------ | --------------- | ----------------- |
| Pan        | 8/10, 10/13     | 4/5, 3/3     | 2/3, 6/7        | 2/2, 3/3          |
| Wheel zoom | 3/44, 3/202     | 4/18, 3/196  | 3/108, 8/104    | 2/92, 3/82        |
| Selection  | 97/156, 104/134 | 30/35, 25/51 | 111/155, 87/143 | 18/51, 18/41      |

- Drawing a Canvas frame (`syncCanvas`) costs 2 to 7 ms p95 in every case.
- Selection: the renderer was the cost (style recalculation of ~1,300 elements on each emphasis change). Canvas holds the 100 ms budget everywhere.
- Wheel zoom: the heavy frames were computation, the same with both renderers. The on-screen crossings counter (`visibleCrossings`, O(n²) over the aggregated edges) cost 160 to 194 ms on `dense` and ~62 ms on excalidraw at each threshold crossing; the "After S08" reading (browser style and layout) was wrong. A subgraph loaded during the zoom adds one frame of ~1.3 s (`buildLayouts` ~710 ms, `layoutCrossings` ~350 ms for the two layout totals).

After removing the crossings counter and the layout totals (Canvas, fit / zoomed):

| Scenario   | dense        | excalidraw   |
| ---------- | ------------ | ------------ |
| Pan        | 5/5, 3/3     | 2/2, 3/4     |
| Wheel zoom | 4/18, 3/27   | 2/28, 3/27   |
| Selection  | 31/35, 23/47 | 18/53, 18/40 |

- Selection < 100 ms and zoom < 33 ms p95 on both. Not yet 60 fps at zoom: a threshold frame still spends 25 to 35 ms on `allEdges`, `edgeStates` and `edgeLines`; a subgraph loaded during the zoom keeps one frame of ~760 ms (`buildLayouts`, S09).
- Decision: the map moves to Canvas 2D (ADR 0009).

### After S20 (Canvas 2D is the only renderer)

The DOM + SVG rendering of the map is gone (ADR 0009): the sections above that measure it are history. `just bench-ui` reads the scene (`window.__reliefScene()`) and writes `target/bench-ui/<repo>.json`; the draw of a frame is `relief:syncCanvas`. `work` p50 / p95 in ms, fit / zoomed, Xvfb:

| Scenario   | dense        | excalidraw   | Budget (p95) |
| ---------- | ------------ | ------------ | ------------ |
| Pan        | 3/4, 2/2     | 1/2, 1/2     | 16           |
| Wheel zoom | 2/32, 1/29   | 2/26, 3/25   | 33           |
| Selection  | 28/32, 19/34 | 16/50, 17/35 | 100          |

- All three budgets are held on both repositories, fit and zoomed. A Canvas frame costs 1 to 10 ms p95 (`syncCanvas`).
- Wheel zoom: the threshold frames are edge computation (`allEdges`, `edgeStates`, `edgeLines`: 25 to 35 ms in the worst frames), not drawing; 60 fps at zoom is S21. On `dense`, a subgraph loaded during the zoom still makes one frame of ~730 ms (`buildLayouts` ~675 ms): S09.

### After S09 (layout in a Web Worker)

`computeLayouts` (both layouts, optimised and raw) runs in a Web Worker; the map keeps the old layout until the new one arrives, and actions made during the first layout are replayed when it lands. `work` p50 / p95 (max) in ms, fit / zoomed, Xvfb:

| Scenario   | dense                  | excalidraw             | Budget (p95) |
| ---------- | ---------------------- | ---------------------- | ------------ |
| Pan        | 3/3 (5), 2/2 (11)      | 2/2 (9), 1/2 (6)       | 16           |
| Wheel zoom | 2/19 (36), 2/29 (54)   | 2/22 (50), 3/23 (26)   | 33           |
| Selection  | 29/33 (33), 22/33 (33) | 17/56 (56), 16/39 (39) | 100          |

- The ~730 ms frame of a subgraph loaded during the zoom of `dense` is gone: no step does layout work on the main thread any more. The worst zoom frames (36 to 54 ms) are edge computation (`allEdges`, `edgeStates`, `edgeLines`): S21.

## Shallow clones

The clones are shallow (`--depth 400`). `repo_id` (the name of the data folder when it falls back to the user cache, and a cache key) is the SHA of the oldest stored commit, so it is not the same as in a full clone of the same repository, nor between clones of different depths. Churn and co-change ignore the commit at the shallow boundary (no parent to compare it with). The measures above (indexing, `analyse`, budgeted snapshot) do not depend on either, so they were not run again.
