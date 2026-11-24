# K12 Appels HTTP entre dépôts

Status: resolved
Type: task
Blocked by: K08
UI: non
Doc: docs/user `map`

Spec: `../spec.md` (Arêtes entre dépôts)

## Comportement

- Les routes déclarées dans un dépôt et les appels HTTP d'un autre dépôt (T04) sont reliés en arêtes `http` entre dépôts, avec la même règle de correspondance qu'à l'intérieur d'un dépôt.

## Critères d'acceptation

- [x] Fixture à deux dépôts (front qui appelle `/api/promo`, API qui la déclare) : arête `http` entre dépôts ; impact qui traverse les dépôts.

## Baseline

Après K11 (`ed6e800`) : cargo 801/0 ; web 1140/0 ; e2e 194 passés, 1 ignoré.

## Seams

- **Cas d'usage `relief-app` sur l'espace `shop-space`** (`shop-web` appelle `fetch("/orders")`, `shop-api` déclare `GET /orders`) : une arête `http` de `repo:web/…` vers le handler de `repo:api/…`, avec la même règle de correspondance qu'à l'intérieur d'un dépôt (T04) ; l'appel n'est plus « sans route » ; l'impact d'un changement du handler remonte jusqu'à l'appelant de l'autre dépôt ; le diff porte l'arête quand l'appel ou la route change ; monodépôt inchangé. Rate l'UI.
- **Fonction de correspondance existante de T04** (si elle est publique dans sa crate) : testée sur des routes et appels venant de deux dépôts, pour fixer qu'aucune règle propre au multidépôt n'est introduite. Rate l'union.

## Red

- Fichiers de test : `src/app/relief-app/tests/cross_repo_http.rs` (nouveau), `src/analysis/lang/relief-lang-ts/tests/path_matching.rs` (nouveau) ; fixture `tests/fixtures/shop-api/base/src/server.ts` modifiée (le handler de `GET /orders` devient un symbole local `ordersHandler` : T04 ne marque une route que si le handler est un symbole du même fichier ; l'ancien handler importé n'était donc pas une route).
- Lancer : `cargo test -p relief-app --test cross_repo_http` ; `cargo test -p relief-lang-ts --test path_matching`
- À savoir pour green : `path_matches` (T04, `relief-lang-ts/src/http.rs`) est `pub` mais dans un module privé, non exporté ; le test l'importe comme `relief_lang_ts::path_matches` (à ré-exporter). Le verbe est testé dans `link_http`, pas dans `path_matches`.
- En échec : 11 tests (6 + 5)
  - `a_call_of_one_repository_reaches_the_route_of_another` — aucune arête `http` entre `repo:web/…loadOrders` et `repo:api/…ordersHandler`.
  - `a_call_with_another_verb_does_not_reach_the_route` — l'arête GET attendue manque (un appel POST ajouté ne doit pas en créer d'autre).
  - `the_impact_of_the_handler_reaches_the_caller_in_the_other_repository` — impact des appelants de `ordersHandler` avec `follow_http` : vide, au lieu de `loadOrders` (1) et `main` (2).
  - `a_call_that_stops_matching_is_a_removed_edge` — le diff ne porte aucune arête `http` retirée.
  - `a_route_that_moves_is_a_removed_edge` — idem quand la route change.
  - `a_new_call_of_the_route_is_an_added_edge` — pas d'arête `http` ajoutée pour un nouvel appel.
  - `path_matching` (5 tests) — ne compile pas : `relief_lang_ts::path_matches` n'est pas exporté.

## Red

- `src/app/relief-app/tests/cross_repo_http.rs` (6 tests : arête `http` entre dépôts, verbe respecté, impact à travers les dépôts avec `follow_http`, arêtes retirées quand l'appel ou la route change, arête ajoutée pour un nouvel appel) ; `src/analysis/lang/relief-lang-ts/tests/path_matching.rs` (5 tests de `path_matches`, à ré-exporter depuis `relief_lang_ts`).
- Fixture `shop-api/base/src/server.ts` : le handler de `GET /orders` devient le symbole local `ordersHandler` (T04 ne marque une route que si le handler est du même fichier).
- Lancer : `cargo test -p relief-app --test cross_repo_http` ; `cargo test -p relief-lang-ts --test path_matching`.

## Green

- Fichiers : `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/lang/relief-lang-ts/src/{lib,http}.rs`, `src/analysis/relief-index/src/lib.rs`, `src/app/relief-app/src/{lib,union}.rs`, `docs/user/src/content/docs/{map,en/map}.md`
- Changement : `path_matches` (et le joker `PATH_WILDCARD`) passe dans `relief-adapter-api`, ré-exporté par `relief_lang_ts` ; nouveau contrat d'adapter `http_calls(file, index) -> Vec<HttpCallSite>` (implémenté par TS depuis l'index par fichier en cache), exposé par `Indexer::http_calls`. L'union (`cross_http` dans `union.rs`) relie les appels aux nœuds `route` d'un autre dépôt (verbe + `path_matches`), sans cas par langage ; les arêtes ajoutées/retirées entre dépôts s'ajoutent au diff (comparaison base/head). Doc `map` FR/EN : une phrase.
- Suite : cargo 814/0 (baseline 801/0), web 1140/0 ; e2e `workspace-map` seul : 4 passés ; `just lint` propre ; aucun fichier de test modifié (nouveau : `relief-adapter-api/tests/http_match.rs`). Review : `verb_matches` et `http_edge` dans `relief-adapter-api`, utilisés par `link_http` et `cross_http` ; appels HTTP des diffs calculés seulement en espace.
- Questions ouvertes : les arêtes HTTP entre dépôts du diff n'ont pas de `commit` (pas d'attribution par commit, `attribute_edge_commits` ne les voit pas).

## Review

Verdict : ship. Considers appliqués : `verb_matches` et `http_edge` rejoignent `path_matches` dans `relief-adapter-api`, partagés par `link_http` (TS) et l'union (test `http_match.rs`) ; les appels HTTP ne sont calculés pour le diff qu'en espace. Limite consignée : les arêtes HTTP entre dépôts du diff n'ont pas de commit (ticket K15).

## Answer

- Contrat d'adapter : `http_calls(file, index)` ; `path_matches`, `verb_matches`, `http_edge` partagés dans `relief-adapter-api` (ré-export `relief_lang_ts::path_matches`).
- L'union relie les appels d'un dépôt aux routes d'un autre (`cross_http`), même règle qu'à l'intérieur d'un dépôt, sans cas par langage ; le diff porte les arêtes `http` entre dépôts ajoutées/retirées ; l'impact traverse les dépôts avec `follow_http`.
- Fixture `shop-api` : handler local `ordersHandler` pour que la route soit déclarée.
- Vérifié : cargo 814/0, web 1140/0, lint propre ; e2e : 193 passés / 1 échec intermittent au premier run, puis 61/61 specs vertes au second.
- Doc : `map` FR/EN.
