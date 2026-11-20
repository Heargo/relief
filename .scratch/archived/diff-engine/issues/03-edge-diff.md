# Diff des arêtes et nouveaux couplages

Status: resolved
Type: task
Blocked by: E01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : EdgeChange)

## À faire

- Arêtes `added`/`removed` entre base et head (clé : from, to, kind) ; une arête dont une extrémité a été déplacée (E04) est comparée avec l'id d'arrivée, pour ne pas compter un déplacement comme un nouveau couplage. **Reporté à E04** : `NodeStatus` n'a pas encore de `Moved`.
- `coupling_changes(base, head, diff, level)` (les snapshots sont nécessaires : `diff.edges` n'a pas les arêtes inchangées) : agrège les arêtes au niveau demandé (système, module, fichier) et renvoie les paires **nouvelles** (aucune arête fine avant) et **disparues** (plus aucune après).
- Si la plage a des commits, `EdgeChange.commit` = le premier commit de la plage où l'arête apparaît (snapshots par commit fournis par l'appelant).

## Critères d'acceptation

- [ ] Tests `GraphBuilder` : arête ajoutée, supprimée, inchangée ; agrégation au niveau module avec une paire nouvelle et une paire qui existait déjà.
- [ ] Sur acme-shop : le couplage `apps/web/components → packages/db/repos` est nouveau ; `apps/api/routes → packages/db/repos` ne l'est pas.

## Baseline

`just test-summary` sur `develop` (56be33b) : cargo: 217 passed, 0 failed ; web: 2 passed, 0 failed.

## Seams

1. **API publique de `relief-diff` sur des snapshots `GraphBuilder`** (`diff_graphs` → `GraphDiff.edges`, `coupling_changes(diff, level)`, et l'attribution de `EdgeChange.commit` à partir de snapshots par commit fournis par l'appelant) : attrape arête ajoutée/supprimée/inchangée, clé (from, to, kind), comparaison avec l'id d'arrivée quand un nœud du diff est `moved`, agrégation système/module/fichier avec paires nouvelles et disparues, premier commit d'apparition. Rate l'extraction réelle des arêtes par l'indexeur.
2. **Dépôt de fixture acme-shop (`relief-fixtures`), test d'intégration de `relief-diff`** : indexe base et head comme le fait le test d'intégration d'E01, puis `coupling_changes` au niveau module. Attrape `apps/web/components → packages/db/repos` nouveau et `apps/api/routes → packages/db/repos` déjà existant, avec les vraies arêtes. Rate les cas limites (déplacements, commits), couverts par le seam 1.

## Red

- Fichiers de test : `crates/relief-diff/tests/edge_diff.rs` (seam 1), `crates/relief-diff/tests/acme_coupling.rs` (seam 2) ; dev-deps ajoutées à `crates/relief-diff/Cargo.toml` : `relief-fixtures`, `relief-git`, `relief-index`, `relief-lang-ts`, `tempfile`.
- Lancer : `cargo test -p relief-diff --test edge_diff` et `cargo test -p relief-diff --test acme_coupling`
- API choisie pour green :
  - `relief_model::{EdgeChange, EdgeStatus}` : `EdgeChange { from: NodeId, to: NodeId, kind: EdgeKind, #[serde(flatten)] status: EdgeStatus, commit: Option<String> }` (serde camelCase, JsonSchema) ; `EdgeStatus = Added | Removed` (tag `status`, snake_case) ; JSON `{from, to, kind, status, commit}`. `GraphDiff` gagne `edges: Vec<EdgeChange>` (`diff_graphs` garde sa signature). Clé d'arête = (from, to, kind). `EdgeKind` doit être `PartialEq` (déjà) et exporté.
  - `relief_diff::Level { System, Module, File }`, `CouplingStatus { New, Gone }`, `CouplingChange { from: String, to: String, status: CouplingStatus }` (PartialEq, Debug, Clone).
  - `coupling_changes(base: &GraphSnapshot, head: &GraphSnapshot, diff: &GraphDiff, level: Level) -> Vec<CouplingChange>` : snapshots nécessaires car `diff.edges` ne contient pas les arêtes inchangées. Une paire est `New` si une arête ajoutée la porte et qu'aucune arête de base ne la portait ; `Gone` si une arête supprimée la portait et qu'aucune arête de head ne la porte. Paires sans doublon ; les arêtes internes à une paire (même libellé des deux côtés) sont ignorées. Ordre attendu : `New` d'abord puis `Gone`, chacun dans l'ordre d'apparition des arêtes du diff (les tests l'exigent).
  - Libellés : `File` = chemin du fichier de l'extrémité (`apps/api/routes/checkout.ts`) ; `Module` = dossier de ce fichier (`apps/web/components`) ; `System` = id (chaîne) du plus proche ancêtre-ou-soi de kind `Service`/`Package`, sinon du nœud de tête (`pkg:@acme/web`). Raison : les ids de module réels sont provisoires et le détecteur workspaces ne crée aucun nœud `Module` pour acme-shop (fichiers rattachés directement aux packages), donc `Module` se dérive du chemin du fichier. Extrémités sans fichier (externes) : au choix de green, non testé.
  - `attribute_edge_commits(diff: &mut GraphDiff, commits: &[GraphSnapshot])` : `commits` = snapshots de la plage, du plus ancien au plus récent, fournis par l'appelant ; chaque `EdgeChange` `Added` reçoit `commit = Some(snapshot.commit())` du premier snapshot qui contient l'arête (clé from, to, kind). Liste vide : `commit` reste `None`.
- Non testé : arête dont une extrémité est `moved` (E04). `NodeStatus` n'a pas de variante `Moved` et `GraphDiff` n'a pas de `commits`, donc le cas ne s'exprime pas ; à couvrir dans E04.
- En échec : 13 tests, tous faute de compilation sur symboles manquants (`relief_model::{EdgeChange, EdgeStatus}`, champ `GraphDiff.edges`, `relief_diff::{Level, CouplingStatus, CouplingChange, coupling_changes, attribute_edge_commits}`) :
  - edge_diff.rs : an_added_edge_is_added, a_removed_edge_is_removed, an_unchanged_edge_has_no_entry, identical_snapshots_give_no_edge_changes, the_edge_key_includes_the_kind, module_level_lists_new_and_gone_pairs_only, file_level_pairs_are_files, system_level_pairs_are_packages, a_pair_that_still_has_a_fine_edge_is_not_gone, an_edge_appears_in_the_first_commit_of_the_range_that_has_it, without_commit_snapshots_the_commit_stays_empty, edge_change_json_shape — symboles manquants
  - acme_coupling.rs : promo_codes_adds_the_web_to_repos_coupling_but_not_the_api_one — symboles manquants (`Level`, `CouplingStatus`, `coupling_changes`)

## Green

- Fichiers : `crates/relief-model/src/{diff,id,lib,types}.rs`, `crates/relief-diff/src/lib.rs`
- Changement : `EdgeChange`/`EdgeStatus` et `GraphDiff.edges` dans le modèle (`EdgeKind` gagne `JsonSchema`, `NodeId::file_path()`) ; `diff_graphs` calcule les arêtes ajoutées/supprimées (clé from, to, kind), triées par position des extrémités dans le snapshot ; `coupling_changes`, `attribute_edge_commits`, `Level`, `CouplingStatus`, `CouplingChange` dans `relief-diff`. Extrémités sans fichier ignorées aux niveaux module/fichier.
- Suite : edge_diff 11/12, acme_coupling 1/1 ; `just lint` propre ; `just test-summary` s'arrête à l'échec du test rouge (cargo 44 passed, 1 failed ; web 2/0). `just contract` répond « not available yet (M02) », rien à régénérer.
- Questions ouvertes : le test `an_edge_appears_in_the_first_commit_of_the_range_that_has_it` est faux : `c3 = head()` a pour commit `"head"` (via `graph("head", ..)`) alors que le test attend `Some("c3")` ; le spec dit `commit = snapshot.commit()`. Correction suggérée côté red : attendre `"head"`, ou construire `c3` avec `graph("c3", ..)`. Fichier de test non modifié.

### Correction de test (orchestrateur)

`an_edge_appears_in_the_first_commit_of_the_range_that_has_it` : `c3` était `head()`, dont le commit est `"head"`, alors que le test attend `Some("c3")`. Le test était faux (signalé par green) ; `c3` est maintenant construit par `graph("c3", …)` avec les arêtes de head. L'intention du test ne change pas.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - Extrémité `moved` non implémentée ni testée (pas de `Moved` avant E04) : critère reporté dans `04-moves-and-renames.md` ; « À faire » mis à jour, ainsi que la signature `coupling_changes(base, head, diff, level)`.
  - `diff_edges` : le tri appelle `position(..)` deux fois par comparaison (quadratique) ; construire une `HashMap<&NodeId, usize>` par snapshot.
  - `diff_edges`/`coupling_changes` : le `seen` indexé par `(clé, bool)` est obscur ; deux `HashSet` ou des types nommés pour les paires et `EdgeKey`.
  - `attribute_edge_commits` : `position(..).and_then(..)` détourné ; un `zip(..).find(..)` est plus direct.
  - `relief-diff/Cargo.toml` : `relief-git` en dev-dependency (test acme seulement, pas le code de production) ; à confirmer vis-à-vis de la règle des crates de requêtes, ou déplacer le test dans `relief-index`. Dev-deps hors ordre alphabétique.
  - `label` (System) : `top` reconstruit à chaque itération ; le dernier ancêtre suffit.

## Documentation

Ticket interne (API Rust de `relief-diff`) : rien à documenter pour l'utilisateur. La sortie visible (nouveaux couplages) sera documentée avec `relief diff` (C02) et le calque de diff (R01).

## Answer

- Construit : `EdgeChange { from, to, kind, status, commit }` et `EdgeStatus` dans relief-model, `GraphDiff.edges` rempli par `diff_graphs` (clé from, to, kind) ; dans relief-diff, `coupling_changes(base, head, diff, Level::{System, Module, File})` qui renvoie les paires `New`/`Gone`, et `attribute_edge_commits(&mut diff, &[snapshots par commit])` (premier commit d'apparition).
- Décisions : module dérivé du dossier du fichier (aucun nœud `Module` pour acme-shop) ; système = Service/Package ; extrémités sans fichier ignorées aux niveaux module/fichier ; extrémité `moved` reportée à E04.
- Vérifié : 12 tests `GraphBuilder` (`edge_diff.rs`) et le test acme-shop (`acme_coupling.rs` : `apps/web/components → packages/db/repos` nouveau, `apps/api/routes → packages/db/repos` non) ; `just lint` propre ; `just test-summary` : cargo 230 passed (baseline 217), web 2 passed.
