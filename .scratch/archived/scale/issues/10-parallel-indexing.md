# S10 Indexation parallèle

Status: resolved
Type: task
Blocked by: S04
UI: non
Doc: aucune (`docs/bench.md` remis à jour)

Spec: `../spec.md` (Décisions : budgets)

## Constat

S02 : l'indexation est mono-thread (Ryzen 7700X, 16 threads) ; n8n met 54 s à froid et 30 s à chaud. Le parse et l'extraction d'un fichier ne dépendent d'aucun autre fichier.

## À faire

- Parser et extraire les fichiers en parallèle (`rayon`), lecture des blobs comprise ; résolution des liens en parallèle par fichier, l'assemblage du graphe restant séquentiel et déterministe (ordre des nœuds et des arêtes inchangé).
- Le cache par blob accepte les écritures concurrentes (ou un seul écrivain qui reçoit les résultats).
- Relancer `just bench` et mettre `docs/bench.md` à jour.

## Critères d'acceptation

- [x] `just bench` : ouverture à froid de n8n au moins 3 fois plus rapide que la mesure de S02.
- [x] Deux indexations du même commit produisent le même graphe, octet pour octet (test sur acme-shop et `wide`).
- [x] Tous les tests existants passent sans changement de résultat.

## Triage

Toujours justifié après S04 (`docs/bench.md`) : n8n à froid 29,6 s (S02 : 54,1 s) ; le critère « 3 fois plus rapide que S02 » vise donc < 18 s. Le reste à froid est un parse tree-sitter par fichier (~1,2 ms), indépendant des autres fichiers.

## Baseline

`646ef10` : cargo 630 ; web 853 ; e2e 154 passés / 1 ignoré.

## Seams

- **Indexation sur fixture (`relief-index` / `relief-app`, dépôt de fixture `relief-fixtures`)** : deux indexations à froid du même commit (cache vide, puis un nouveau cache) donnent le même graphe sérialisé octet pour octet, sur acme-shop et `wide` ; et le graphe d'une indexation parallèle est égal à celui d'une indexation à un seul thread (pool `rayon` d'un thread). Attrape le non-déterminisme et les courses sur le cache ; rate le temps.
- **Suite existante inchangée (cargo, Vitest, e2e)** : aucun résultat ne change. Attrape les régressions ; rate le temps.
- **Banc (`just bench`, orchestrateur)** : n8n à froid < 18 s, sans régression à chaud ni sur `analyse`. Attrape le temps ; rate la justesse.

## Red

- Fichiers de test : `src/app/relief-app/tests/parallel_indexing.rs`
- Lancer : `cargo test -p relief-app --test parallel_indexing 2>&1 | tail -30`
- API à créer pour green : `Indexer::with_threads(self, n: usize) -> Self` (pool `rayon` de `n` threads pour le parse/extraction/résolution par fichier ; sans appel, pool par défaut).
- En échec : 5 tests (le fichier ne compile pas : `no method named with_threads found for struct Indexer`)
  - `acme_shop_graph_is_the_same_on_one_thread_and_eight` — `with_threads` manquant
  - `wide_graph_is_the_same_on_one_thread_and_eight` — `with_threads` manquant
  - `wide_graph_with_a_shared_cache_is_the_same_on_eight_threads` — `with_threads` manquant
  - `two_cold_indexings_of_acme_shop_are_byte_identical` — rouge seulement par la compilation ; verrouille le comportement, passera dès que `with_threads` existe (passe sans doute déjà à l'indexation mono-thread actuelle)
  - `two_cold_indexings_of_wide_are_byte_identical` — idem

## Green

- Fichiers : `src/analysis/relief-index/src/lib.rs`, `src/analysis/relief-index/src/cache.rs`, `src/analysis/relief-index/Cargo.toml`, `src/analysis/relief-git/src/lib.rs`, `Cargo.lock`, `docs/bench.md`
- Changement : `Indexer::with_threads` (pool `rayon`, défaut sinon). Lecture des blobs, extraction et `link` par fichier en parallèle (`map_init` avec un `LocalBlobReader` par thread, nouveau `GitSource::blob_reader`) ; assemblage séquentiel dans l'ordre d'origine ; le cache SQLite est lu sous `Mutex` et écrit uniquement par le fil principal. `link` voit désormais les nœuds extraits (plus ceux créés par les liens précédents).
- Suite : cargo 635 réussis / 0 échoué (baseline 630 + 5 nouveaux) ; web 853 / 0 ; e2e non relancés. Bench : n8n à froid 29,6 s -> 5,6 s, à chaud 5,0 -> 2,1 s, analyse 13,4 -> 6,2 s ; excalidraw à froid 1,27 s -> 0,30 s, analyse 1,02 -> 0,37 s.
- Questions ouvertes : `parsed_files`/`cached_files` : un blob en double dans un même run compte comme « cached » comme avant (dédoublonné à l'assemblage).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `src/analysis/relief-index/src/lib.rs` (`Extracted`) : `fresh` et `hit` s'excluent ; un enum (`Hit(Payload)` / `Parsed(Option<Payload>)`) dirait l'invariant.
  - `lib.rs` (`with_threads`) : `.build().ok()` retombe en silence sur le pool par défaut ; les tests 1 vs 8 passeraient même si le pool n'était pas construit.
  - `relief-git/src/lib.rs` (`LocalBlobReader::read_blob`) : copie de `GitSource::read_blob` ; factoriser sur une fonction libre.
  - `lib.rs` (lecture du cache) : un seul `Mutex<Cache>` sérialise les lectures SQLite (le JSON est parsé hors verrou) ; sans deadlock, mais c'est le goulot du « à chaud » (2,1 s).
  - Deux fichiers de même blob dans un run sont maintenant extraits deux fois (en parallèle) puis dédoublonnés ; résultat identique, travail en double.

## Answer

- `Indexer` parallélise avec `rayon` la lecture des blobs, l'extraction et le `link` par fichier (un `LocalBlobReader` par thread) ; l'assemblage du graphe reste séquentiel, dans l'ordre d'origine. Le cache SQLite est lu sous `Mutex` et écrit par le seul fil principal. `Indexer::with_threads(n)` fixe la taille du pool (échoue franchement si le pool ne se construit pas).
- `link` ne voit plus les nœuds externes créés par le `link` des fichiers précédents : sans effet, aucun `contains` ne les consulte (review), les snapshots existants sont inchangés.
- Vérifié : 5 tests de déterminisme (1 vs 8 threads, cache partagé, deux indexations à froid octet pour octet, acme-shop et `wide`) ; cargo 635, web 853 ; e2e 154 passés / 1 ignoré ; `just lint` propre. `just bench` : n8n à froid 29,6 → 5,6 s (S02 : 54,1 s, ×9,6), à chaud 5,0 → 2,1 s, `analyse` 13,4 → 6,2 s ; excalidraw à froid 1,27 → 0,30 s, `analyse` 1,02 → 0,37 s.
- Consider laissés : un seul `Mutex` sur le cache (goulot possible à chaud) ; un blob présent deux fois dans un run est extrait deux fois (résultat identique) ; enum à la place de `fresh` / `hit`.
