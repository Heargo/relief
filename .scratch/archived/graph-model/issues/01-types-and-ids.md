# Types du graphe et ids stables

Status: resolved
Type: task
Blocked by: F01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions)

## À faire

- `relief-model` : `Node`, `Edge`, `NodeKind`, `EdgeKind`, `Precision`, `Visibility`, `Span`, `Metrics`, `GraphSnapshot`, avec serde (JSON en `camelCase`).
- `NodeId` : construction par segments typés (`NodeId::package("@acme/api").file("src/x.ts").symbol("A.b")`), affichage et parsing aller-retour, échappement des `::` dans un nom.
- `GraphSnapshot` : index par id, enfants d'un nœud, ancêtres, feuilles ; erreur si un `parent` ou une extrémité d'arête n'existe pas (`validate()`).
- `relief_model::testing::GraphBuilder` (feature `testing`) : construire un snapshot en quelques lignes dans les tests des crates de requêtes.

## Critères d'acceptation

- [x] `NodeId` : aller-retour texte → id → texte identique, y compris avec `::` et espaces dans un nom (tests).
- [x] Un snapshot avec une arête vers un id inconnu est rejeté par `validate()` avec l'id fautif dans le message.
- [x] Snapshot `insta` du JSON d'un petit graphe construit avec `GraphBuilder`.

## Baseline

`just test-summary` (develop, 88c317a) : cargo: 10 passed, 0 failed ; web: 2 passed, 0 failed.

## Seams

- `relief_model::NodeId` (type public : constructeurs par segments, `Display`, `FromStr`) testé en unitaire/intégration dans `relief-model` : attrape l'aller-retour texte ↔ id, l'échappement des `::` et des espaces ; rate l'usage réel des ids par l'index (tickets suivants).
- `relief_model::GraphSnapshot` (`validate()`, index par id, enfants, ancêtres, feuilles) sur des snapshots construits en mémoire : attrape les parents/extrémités d'arête inconnus avec l'id dans le message et les requêtes de hiérarchie ; rate les graphes réels produits par l'index.
- `relief_model::testing::GraphBuilder` (feature `testing`) + snapshot `insta` du JSON sérialisé : attrape la forme du JSON (`camelCase`, enums, champs optionnels) et l'ergonomie du builder ; rate la conformité au JSON Schema/contrat TS (ticket du contrat).

## Red

- Fichiers de test : `crates/relief-model/tests/node_id.rs`, `crates/relief-model/tests/graph_snapshot.rs`, `crates/relief-model/tests/json_shape.rs`. `crates/relief-model/Cargo.toml` : ajout de `[features] testing = []` et de `[dev-dependencies]` (auto-dépendance avec `features = ["testing"]`, `insta` avec `json`, `serde_json`). Le snapshot `insta` n'existe pas encore : le green le génère (`cargo insta review`) et la review le relit.
- API supposée par les tests : `NodeId::package/file/symbol` (chaînables, `Display`, `FromStr`, `Eq`) ; `GraphBuilder::new(commit)`, `.package(name) -> NodeId`, `.file(&parent, path) -> NodeId`, `.symbol(&parent, name) -> NodeId`, `.edge(&from, &to, EdgeKind)`, `.build() -> GraphSnapshot` (sans validation) ; `GraphSnapshot::{validate() -> Result<(), E: Display>, node(&id) -> Option<&Node>, children(&id), ancestors(&id) (parent d'abord), leaves()}` (itérables de `&Node`, ordre d'insertion) ; `Node { id, kind, .. }` ; JSON : `commit`, `nodes[].contentHash`, `kind` en minuscules (`package`, `imports`, `calls`).
- Lancer : `cargo test -p relief-model --test node_id`, `--test graph_snapshot`, `--test json_shape`
- En échec : 3 fichiers (tous les tests qu'ils contiennent), erreur de compilation
  - node_id.rs (7 tests) — `relief_model::NodeId` n'existe pas
  - graph_snapshot.rs (8 tests) — `relief_model::testing`, `NodeId`, `EdgeKind`, `Node` n'existent pas
  - json_shape.rs (3 tests) — `relief_model::testing`, `EdgeKind`, `GraphSnapshot` n'existent pas

## Green

- Fichiers : `crates/relief-model/Cargo.toml` (serde, thiserror), `crates/relief-model/src/{lib,types,id,graph,testing}.rs`, `crates/relief-model/tests/snapshots/json_shape__json_snapshot_of_a_small_graph.snap`
- Changement : types du graphe en serde camelCase ; `NodeId` par segments typés (pkg/file/sym), échappement `\` de `\` et `:`, `Display`/`FromStr`/serde en chaîne ; `GraphSnapshot` (index par id reconstruit à la désérialisation, `children`/`ancestors`/`leaves` en ordre d'insertion, feuilles en profondeur d'abord, `validate()` avec l'id fautif) ; `testing::GraphBuilder`. Snapshot insta généré.
- Suite : cargo 28 réussis / 0 échoué (baseline 10) ; web 2 / 0 (baseline 2)
- Questions ouvertes : `just lint` échoue sur `cargo fmt --check` uniquement à cause du formatage des fichiers de test rouges (`tests/graph_snapshot.rs`, `tests/node_id.rs`), que je n'ai pas le droit de modifier ; la review doit les reformater. `leaves()` suit l'ordre profondeur d'abord (imposé par le test), pas l'ordre d'insertion brut. Pas de champ `meta` dans `GraphSnapshot` (non requis par les tests).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - crates/relief-model/tests/graph_snapshot.rs:76,101 — `.into_iter()` sur un itérateur : `cargo clippy --all-targets` échoue (useless_conversion) ; `just lint` passe car sans `--all-targets` — retirer les `.into_iter()`.
  - crates/relief-model/tests/node_id.rs — l'échappement de `\` n'est pas testé (`symbol("a\\b")`, nom finissant par `\` ou `:`) — ajouter un aller-retour.
  - crates/relief-model/src/graph.rs:96 — `ancestors()` boucle à l'infini sur un cycle de `parent` (snapshot non validé) ; `validate()` ne détecte pas les cycles — garde ou erreur dédiée.
  - crates/relief-model/src/graph.rs:90 — `children()` est O(n) par appel ; index parent→enfants à prévoir quand l'index réel arrivera.
  - crates/relief-model/src/types.rs — `Visibility`, `Metrics`, `Node`, `Edge` sans doc ; `Node::subkind` en `String` (obsession des primitives, acceptable ici).

## Documentation

Ticket purement interne (types d'une crate de bibliothèque) : aucune page de `user-docs/` ne change.

## Answer

- Construit dans `relief-model` : `types.rs` (`Node`, `Edge`, `NodeKind`, `EdgeKind`, `Precision`, `Visibility`, `Span`, `Metrics`, serde `camelCase`, enums en minuscules), `id.rs` (`NodeId` par segments `pkg`/`file`/`sym`, `Display`/`FromStr`/serde en chaîne, échappement par `\` de `\` et `:`), `graph.rs` (`GraphSnapshot` : index par id reconstruit à la désérialisation, `node`, `children`, `ancestors`, `leaves`, `validate()` avec l'id fautif dans le message, erreurs `thiserror`), `testing.rs` (`GraphBuilder`, feature `testing`).
- Décisions : `leaves()` en profondeur d'abord, enfants dans l'ordre d'insertion ; pas encore de champ `meta` dans `GraphSnapshot` (aucun test ne le demande ; à ajouter avec le contrat M02) ; tests rouges reformatés par `cargo fmt` uniquement.
- Vérifié : 3 fichiers de test (`node_id` 7, `graph_snapshot` 8, `json_shape` 3) verts, snapshot insta relu par la review ; `just test-summary` cargo 28/0 (baseline 10/0), web 2/0 ; `just lint` OK. Review : ship, Consider non appliqués (voir `## Review`).
