# Ordre de lecture : par fichier, par symbole, par commit

Status: resolved
Type: task
Blocked by: E03, E04, G02
UI: non
Doc: docs/user `review` (ordre de lecture)

Spec: `../spec.md` (Décisions : ordre de lecture)

## À faire

- `reading_order(diff, head, granularity: file|symbol) -> Vec<ReadingItem { id, reasons }>` : tri topologique des fichiers (ou symboles) changés, dépendances d'abord, départage stable par chemin ; cycles cassés de façon déterministe.
- `reasons` : faits pour la ligne de la liste (« signature cassante », « violation », « nouveau », « déplacé, identique », « +3 −2 »).
- Par commit : les commits de la plage dans l'ordre, chacun avec ses fichiers changés (ceux qui ont un changement structurel ; les autres comptés à part).
- Exclus : fichiers `format_only` et anciens emplacements de fichiers déplacés.

## Critères d'acceptation

- [x] Sur acme-shop : 14 fichiers par fichier, 22 symboles par symbole (19 dans la maquette, voir « Correction du critère »), 5 commits (ordre littéral dans le test, comme la maquette).
- [x] Pas de fichier lu avant un fichier dont il dépend, sauf cycle (test `GraphBuilder` avec un cycle).

## Baseline

`just test-summary` (develop, 7eff0e3) : cargo 395 passed, 0 failed ; web 348 passed, 0 failed.

## Seams

- **Fonction publique `relief_diff::reading_order` sur un graphe construit par `GraphBuilder`** (sans git) : attrape le tri topologique dépendances d'abord, le départage par chemin, la cassure déterministe des cycles, l'exclusion `format_only` et des anciens emplacements, les `reasons` ; rate les vraies données d'un dépôt.
- **Fixture acme-shop (`relief-fixtures`), diff `main...feat/promo-codes`** : attrape les comptes et l'ordre littéral (14 fichiers, 19 symboles) ; rate les cas limites de cycle.
- **Regroupement par commit, fonction publique (de `relief-diff` sur les diffs par commit, ou cas d'usage de `relief-app`) sur la fixture acme-shop** : attrape les 5 commits dans l'ordre avec leurs fichiers structurels et le compte des autres ; rate le rendu UI (R05/R06).

Doc utilisateur : pas de changement visible dans ce ticket (pas d'UI) ; la section « Ordre de lecture » de `review` sera écrite par R05.

## Red

- Fichiers de test : `src/domain/relief-diff/tests/reading_order.rs`, `src/domain/relief-diff/tests/acme_reading_order.rs`
- Lancer : `cargo test -p relief-diff --test reading_order` et `cargo test -p relief-diff --test acme_reading_order`
- En échec : 15 tests (aucun ne compile : `relief_diff::{reading_order, reading_by_commit, Granularity, ReadingReason, ReadingItem}` n'existent pas)
  - reading_order.rs (10) : dependencies_are_read_before_their_dependents, independent_files_are_ordered_by_path, ties_among_ready_files_go_to_the_smallest_path_after_each_dependency, a_cycle_is_broken_deterministically_at_the_smallest_path, only_the_changed_files_are_listed_once_each, format_only_files_are_left_out, the_old_location_of_a_moved_file_is_left_out, file_reasons_say_what_happened_to_each_file, symbols_are_read_dependencies_first_with_ties_by_file_path_then_name, a_symbol_cycle_does_not_loop_and_lists_every_symbol_once : symboles manquants
  - acme_reading_order.rs (5) : the_14_changed_files_are_read_dependencies_first, the_file_reasons_of_acme_shop, the_symbols_are_read_dependencies_first, the_symbol_reasons_of_acme_shop, the_five_commits_come_in_order_with_their_structural_files : symboles manquants
- API supposée (à créer dans `relief_diff`) : `reading_order(&GraphDiff, &GraphSnapshot, Granularity) -> Vec<ReadingItem>` ; `Granularity::{File, Symbol}` ; `ReadingItem { id: NodeId, reasons: Vec<ReadingReason> }` ; `ReadingReason::{BreakingSignature, ModifiedSignature, Violation, New, Removed, MovedIdentical, Lines { added: u32, removed: u32 }}` (ordre : signature, violation, puis statut) ; `reading_by_commit(&[(GraphDiff, GraphSnapshot)]) -> Vec<CommitReading { commit: String, files: Vec<ReadingItem>, other_files: usize }>`.
- Règles figées : fichiers changés = `diff.files` moins format_only moins anciens emplacements de déplacés ; dépendances = arêtes du head entre fichiers (ou symboles) changés ; départage et cycle : plus petit chemin (symboles : chemin du fichier, puis nom) ; symboles = tous les symboles du diff (supprimés inclus, anciens emplacements de déplacés exclus).
- Écart avec la maquette / le ticket : 19 symboles dans la maquette, 22 sur les vraies données (SessionStore, 2 `Props` et registerCheckoutRoutes absents de la maquette ; InvoicesPage présent dans la maquette mais pas modifié dans la fixture réelle). Les tests figent 22. Les 14 fichiers et les 5 commits concordent avec la maquette (hors ordre interne, calculé sur les arêtes réelles ; la maquette liste les fichiers de commit dans un ordre libre).

## Correction du critère

La maquette compte 19 symboles ; le diff réel d'acme-shop en a 22 (`SessionStore`, deux `Props`, `registerCheckoutRoutes` en plus, `InvoicesPage` en moins car seul son import change). Comme pour T04 et R04, le critère suit la valeur réelle de la fixture, sans règle d'exclusion ad hoc. Décision de l'orchestrateur.

## Green

- Fichiers : `src/domain/relief-diff/src/lib.rs`
- Changement : ajout de `Granularity`, `ReadingReason`, `ReadingItem`, `CommitReading`, `reading_order` et `reading_by_commit`. Tri topologique glouton (plus petit chemin prêt, ou plus petit restant en cas de cycle) sur les arêtes du head entre éléments changés ; exclusion des fichiers `format_only` et des anciens emplacements de déplacés ; `reading_by_commit` = `reading_order` par fichier par commit + nombre de fichiers `format_only`.
- Suite : cargo 410 passed, 0 failed (baseline 395, +15) ; web 348 passed, 0 failed (inchangé) ; lint propre.
- Questions ouvertes : `ReadingReason::Violation` existe mais n'est jamais produit (aucune donnée de violation dans `GraphDiff` ni dans les paramètres de `reading_order`) ; à brancher quand les règles seront disponibles.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - src/domain/relief-diff/src/lib.rs (`Granularity::Symbol`) — `paths.contains(&path)` est linéaire dans une boucle sur tous les nœuds ; pareil pour `diff.files.iter().find` et le filtre `diff.nodes` par fichier en mode `File` (quadratique) — indexer par chemin dans un `HashSet`/`HashMap`.
  - src/domain/relief-diff/src/lib.rs (`reading_order`) — fonction longue qui mélange collecte (fichier/symbole), raisons et tri topologique — extraire `file_entries`, `symbol_entries` et `topo_order`.
  - src/domain/relief-diff/src/lib.rs (`ReadingReason::Violation`) — jamais produite (connu, dépend de A02) ; variante spéculative en attendant, à brancher dans A02.
  - src/domain/relief-diff/src/lib.rs (`reading_by_commit`) — `commit: String` et `other_files` = nombre de fichiers `format_only` ; le ticket dit « les autres comptés à part », ce qui coïncide tant que tout fichier non `format_only` est listé. À revérifier si la notion de « structurel » évolue.

## Answer

- Construit dans `relief-diff` : `Granularity`, `ReadingReason`, `ReadingItem`, `CommitReading`, `reading_order(diff, head, granularity)` (tri topologique des fichiers ou symboles changés sur les arêtes du head, dépendances d'abord, départage par chemin puis nom, cycle cassé au plus petit chemin restant ; exclusion des `format_only` et des anciens emplacements) et `reading_by_commit` (un `reading_order` par fichier pour chaque commit, `other_files` = fichiers `format_only`).
- Décisions : 22 symboles sur acme-shop au lieu des 19 de la maquette (valeur réelle de la fixture). `ReadingReason::Violation` existe mais n'est produite qu'avec A02.
- Vérifié : `just test-summary` cargo 410/0 (baseline 395), web 348/0 ; `just lint` ; review « ship ». Pas d'UI, donc ni e2e ni doc utilisateur : la section « Ordre de lecture » de `review` sera écrite par R05.
- Suivis (Consider) : indexer par chemin dans `reading_order` (boucles quadratiques, à mesurer avec S02) ; découper `reading_order` ; brancher `Violation` dans A02.
