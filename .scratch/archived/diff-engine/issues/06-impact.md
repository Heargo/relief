# Rayon d'impact et tracé de flux

Status: resolved
Type: task
Blocked by: E03
UI: non
Doc: user-docs `review` (impact)

Spec: `../spec.md` (Décisions : impact)

## À faire

- `impact(snapshot, seeds, direction: callers|dependencies, options { max_depth, follow_http }) -> Vec<Reached { node, depth, via, kind, tested }>`.
- `tested` : un symbole `subkind: test` (ou d'un fichier de test) a une arête directe vers le nœud.
- `out_of_diff(diff, reached)` : les nœuds atteints qui ne sont pas modifiés dans la plage.
- Fichiers de test exclus des nœuds atteints (ils servent seulement à `tested`).

## Critères d'acceptation

- [ ] Sur acme-shop (head), appelants de `SessionStore.refresh` : 10 avec HTTP, 6 sans (comme la maquette), profondeurs littérales dans le test.
- [ ] `requireAuth` et `renewSubscriptions` sont les appelants directs hors diff ; `renewSubscriptions` est `tested: false`.
- [ ] Un cycle d'appels ne fait pas boucler (test `GraphBuilder`).

## Baseline

`just test-summary` sur `develop` (6044816) : cargo: 341 passed, 0 failed ; web: 282 passed, 0 failed.

## Seams

1. **Fonctions publiques de `relief-diff`** (`impact`, `out_of_diff`) sur des snapshots `GraphBuilder` : attrape la fermeture transitive dans les deux directions, la profondeur et `via`, la borne `max_depth`, l'arrêt sur cycle, `tested`, l'exclusion des fichiers de test, `out_of_diff`. Rate : les vrais graphes produits par l'indexation.
2. **Fixture acme-shop** (`relief-fixtures`, plage `main...feat/promo-codes`, test d'intégration de `relief-diff` ou de `relief_server::analysis`) : attrape le cas réel, appelants de `SessionStore.refresh` sans HTTP (6, profondeurs littérales), `requireAuth` et `renewSubscriptions` appelants directs hors diff, `renewSubscriptions` `tested: false`. Rate : le chiffre « 10 avec HTTP », qui attend les arêtes HTTP de T04.

Hors périmètre : la route `GET /api/impact` (reste 501, livrée avec R04, qui consomme l'impact dans l'UI), les arêtes `http` (T04 : `follow_http` existe mais n'a encore rien à suivre).

## Contrat d'API supposé par les tests

- `impact(&GraphSnapshot, &[NodeId], Direction, &ImpactOptions) -> Vec<Reached>` ; `Direction::{Callers, Dependencies}` ; `ImpactOptions { max_depth: usize, follow_http: bool }` (défaut 8 / true).
- `Reached { node: NodeId, depth: usize, via: Vec<NodeId>, kind: EdgeKind, tested: bool }` (`Debug` requis). `via` = chemin le plus court depuis la graine jusqu'au voisin du nœud (graine incluse, nœud exclu) : `via.len() == depth`. `kind` = arête du dernier saut.
- `out_of_diff(&GraphDiff, &[Reached]) -> Vec<Reached>` : atteints sans `NodeChange` (added, modified et moved comptent comme « dans le diff »).
- Arêtes suivies : `calls | imports | renders | references | http` (`http` seulement si `follow_http`). `depends_on`, `extends`, `implements` ne sont pas suivies : le spec liste exactement cinq genres, et `depends_on` est une arête de packages (granularité module), pas un lien d'exécution.
- Seuls les nœuds `Symbol` sont rapportés : les fichiers (arêtes `imports` fichier → symbole) ne comptent pas ; c'est ce qui donne 6 sur acme-shop (3 à profondeur 1, 3 à profondeur 2), avec fichiers on en compterait 9. Les symboles `test` et ceux d'un fichier `*.spec.*` / `*.test.*` ne sont jamais rapportés, mais une arête directe d'eux (ou de leur fichier) vers le nœud le rend `tested`.
- Graine exclue du résultat ; plus court chemin gagne.

## Red

- Fichiers de test : `crates/relief-diff/tests/impact_graph.rs`, `crates/relief-diff/tests/impact_acme.rs`
- Lancer : `cargo test -p relief-diff --test impact_graph --test impact_acme 2>&1 | tail -30`
- En échec : 19 tests (15 dans impact_graph, 4 dans impact_acme), tous parce que `Direction`, `ImpactOptions`, `Reached`, `impact`, `out_of_diff` n'existent pas encore dans `relief_diff` (erreur de compilation E0432).
  - impact_graph : callers_are_the_transitive_reverse_closure_with_depth_and_via, dependencies_are_the_transitive_forward_closure_with_depth_and_via, the_seed_itself_is_not_reached, a_call_cycle_terminates_and_never_reports_the_seed, max_depth_bounds_the_closure, a_node_reachable_by_two_paths_keeps_its_shortest_depth, each_reached_node_carries_the_kind_of_its_last_edge, only_calls_imports_renders_references_and_http_are_followed, http_edges_are_followed_unless_follow_http_is_off, a_test_symbol_with_a_direct_edge_makes_the_node_tested, a_test_file_importing_the_node_makes_it_tested, test_files_and_test_symbols_are_never_reached, only_symbols_are_reported_not_the_files_that_import_them, out_of_diff_keeps_the_reached_nodes_the_range_did_not_touch, out_of_diff_treats_added_and_moved_nodes_as_in_the_diff
  - impact_acme : refresh_has_six_callers_without_http_at_literal_depths, spec_files_are_not_among_the_callers, require_auth_and_renew_subscriptions_are_the_direct_callers_out_of_diff, renew_subscriptions_is_untested_while_require_auth_is_tested

## Green

- Fichiers : `crates/relief-diff/src/lib.rs`
- Changement : `Direction`, `ImpactOptions`, `Reached`, `impact` (BFS, index d'adjacence construit une fois, visités, `max_depth`, genres suivis dans la constante `FOLLOWED` + `http` si `follow_http`) et `out_of_diff`. Seuls les symboles non test sont rapportés ; `tested` = une arête directe d'un symbole/fichier de test vers le nœud.
- Suite : 18/19 tests rouges passent (impact_acme 4/4, impact_graph 14/15) ; `just test-summary` et `just lint` non lancés (bloqué par le test ci-dessous).
- Questions ouvertes : `test_files_and_test_symbols_are_never_reached` (impact_graph.rs:297) exige `prod.tested == true` alors que `prod` n'a aucune arête depuis un test (seul `target` en a). C'est contradictoire avec `a_test_symbol_with_a_direct_edge_makes_the_node_tested` (l.251), où `caller` (même structure : appelant du nœud testé) doit être `tested == false`. Probablement une erreur du test : l'assertion devrait viser `target` (la graine, non rapportée) ou être `!tested`. Test non modifié.

## Review

- Verdict : ship
- Must fix : aucun.
- Consider :
  - `lib.rs` (BFS) : `via` est cloné pour chaque nœud atteint, O(N·profondeur) ; un `parent` par nœud visité suffirait. Borné par `max_depth`, sans urgence.
  - `std::collections::VecDeque` en chemin complet : à importer en tête avec `HashMap`/`HashSet`.
  - `tested` compte toutes les arêtes directes d'un test, y compris `extends` ou `depends_on` ; non fixé par un test.
  - Les nœuds fichier ne sont pas traversés : une chaîne symbole → fichier → symbole est coupée. Cohérent avec les 6 appelants, à dire dans le doc-comment.
  - La règle « seuls les symboles non test sont rapportés » est reportée dans `spec.md` (fait).
  - L'assertion corrigée l.297 (`prod` `!tested`) est juste et le test reste discriminant.
  - Le « 10 avec HTTP » reste à vérifier avec T04 (critère ajouté à `.scratch/lang-ts/issues/04-http-edges.md`) ; la route `/api/impact` et la doc `review` vont avec R04.

## Vérification navigateur

Sans objet : pas d'UI dans ce ticket (`UI: non`), aucune route exposée.

## Documentation

Pas de changement dans `user-docs/` : ni commande, ni option, ni écran ne change. La section impact de la page `review` arrive avec R04, qui rend l'impact visible.

## Answer

- Construit dans `relief-diff` : `Direction { Callers, Dependencies }`, `ImpactOptions { max_depth, follow_http }` (défaut 8 / vrai), `Reached { node, depth, via, kind, tested }`, `impact(&GraphSnapshot, &[NodeId], Direction, &ImpactOptions)` et `out_of_diff(&GraphDiff, &[Reached])`.
- Décisions : BFS sur un index d'adjacence construit une fois par appel, ensemble de visités (un cycle termine), plus courte profondeur gardée ; genres suivis `calls | imports | renders | references` et `http` si `follow_http` (point d'extension unique pour T04) ; `depends_on`, `extends`, `implements` non suivis ; seuls les symboles hors test sont rapportés ; `tested` = arête directe depuis un symbole `subkind: test` ou un fichier de test ; added, modified et moved comptent comme « dans le diff ».
- Acme-shop (head de `feat/promo-codes`) : appelants de `SessionStore.refresh` sans HTTP = 6 (profondeur 1 : `chargeCustomer`, `renewSubscriptions`, `requireAuth` ; profondeur 2 : `postCheckout`, `registerCheckoutRoutes`, `registerInvoiceRoutes`) ; hors diff à profondeur 1 : `requireAuth` et `renewSubscriptions` ; `renewSubscriptions` `tested: false`, `requireAuth` `tested: true`.
- Vérifié par `cargo test -p relief-diff --test impact_graph --test impact_acme` (19 tests), `just lint`, `just test-summary`, `just e2e-summary`. Non vérifié : le chiffre « 10 avec HTTP » (T04).
