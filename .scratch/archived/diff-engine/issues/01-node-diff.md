# Diff des nœuds

Status: resolved
Type: task
Blocked by: M01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : GraphDiff, nœuds)

## À faire

- `diff_graphs(base, head, files) -> GraphDiff` : nœuds `added`, `removed`, `modified { body }` par comparaison d'ids et de `content_hash`.
- Statut des conteneurs (fichier, module, système) : `added`/`removed` s'ils le sont eux-mêmes, sinon calculé à l'affichage depuis leurs descendants (pas stocké).
- Compte de lignes `+/-` par fichier depuis `FileChange` (git) ; par symbole, depuis le diff du texte de son `span` (fourni en paramètre par l'appelant).
- Types `GraphDiff`, `NodeChange` dans `relief-model` (serde + schemars).

## Critères d'acceptation

- [x] Tests `GraphBuilder` : un symbole ajouté, un supprimé, un dont seul le corps change, un inchangé dans un fichier modifié.
- [x] Un fichier ajouté avec ses symboles : le fichier et chacun de ses symboles sont `added`.

## Baseline

`just test-summary` sur `develop` (aa452c6) : cargo 205 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. `relief_diff::diff_graphs(base, head, files, …)` sur des snapshots `relief_model::testing::GraphBuilder` (sans git) : attrape `added`/`removed`/`modified { body }` par id et `content_hash`, l'absence d'entrée pour un symbole inchangé et pour un conteneur ni ajouté ni supprimé, le fichier ajouté avec tous ses symboles `added`, les `+/-` par fichier (depuis les `FileChange` passés) et par symbole (depuis le texte des `span` fourni par l'appelant). Rate la lecture réelle de git et les hashes réels de tree-sitter.
2. Types publics `relief_model::{GraphDiff, NodeChange, …}` : sérialisation serde (forme JSON, aller-retour) et `schemars::schema_for!` sans panique. Attrape un contrat JSON cassé ; rate le branchement CLI/API (M02, plus tard).

Validation : chaque comportement est atteint (1 couvre diff, conteneurs, comptes ; 2 couvre les types) ; interfaces publiques ; aucun mock ; 2 seams.

## Limites connues

- Le `content_hash` des symboles TS (T01) retire les guillemets des tokens : `f("x")` → `f(x)` donne le même hash, donc pas de `modified { body }` pour ce seul changement. Les tests d'E01 passent par `GraphBuilder` et fixent les hashes eux-mêmes : ils n'en dépendent pas. À corriger dans relief-lang-ts, hors de ce ticket.
- Les ids de module sont provisoires (`pkg:<repo>/<dir>`) ; le diff compare des ids opaques et n'en dépend pas.

## Red

- Fichiers de test : `crates/relief-diff/tests/node_diff.rs` (+ dev-deps `schemars`, `serde_json` et dépendance `relief-model` dans `crates/relief-diff/Cargo.toml`)
- Lancer : `cargo test -p relief-diff --test node_diff`
- Signature choisie : `relief_diff::diff_graphs(&GraphSnapshot, &GraphSnapshot, &[relief_model::FileChange], &relief_diff::SymbolTexts) -> relief_model::GraphDiff`. `relief_model::FileChange { path, lines_added, lines_removed }` (type modèle, car relief-diff ne dépend pas de relief-git ; l'appelant convertit depuis `relief_git::FileChange`). `SymbolTexts { base: HashMap<NodeId, String>, head: HashMap<NodeId, String> }` (pub, `Default`) : texte du span de chaque symbole. `GraphDiff { base, head, nodes: Vec<NodeChange>, files: Vec<FileChange> }` (serde camelCase, JsonSchema). `NodeChange { id, #[serde(flatten)] status: NodeStatus, lines_added, lines_removed }`. `NodeStatus` = `Added | Removed | Modified { body: bool }`, JSON `{"status":"added"}` / `{"status":"modified","body":true}` (tag `status`, snake_case). Lignes d'un symbole ajouté/supprimé = lignes de son texte ; modifié = diff de lignes base/head. `schemars` doit devenir dépendance de `relief-model`.
- En échec : 12 tests (le fichier ne compile pas : `diff_graphs`, `SymbolTexts`, `FileChange`, `GraphDiff`, `NodeChange`, `NodeStatus` n'existent pas), à savoir :
  - added_symbol_is_added, removed_symbol_is_removed, symbol_with_new_content_hash_is_modified_body — symboles/types manquants
  - unchanged_symbol_and_untouched_containers_have_no_entry, identical_snapshots_give_an_empty_diff — idem
  - added_file_and_all_its_symbols_are_added, added_package_is_added_with_its_content, removed_file_and_its_symbols_are_removed — idem
  - file_line_counts_come_from_the_given_file_changes, symbol_line_counts_come_from_the_span_texts — idem
  - node_change_json_shape, graph_diff_json_round_trips_and_has_a_schema — idem

## Green

- Fichiers : crates/relief-diff/src/lib.rs, crates/relief-model/src/diff.rs (nouveau), crates/relief-model/src/{lib.rs,id.rs}, crates/relief-model/Cargo.toml, Cargo.lock
- Changement : `diff_graphs` compare les ids (added/removed) et le `content_hash` des seuls symboles (modified { body }) ; les conteneurs n'ont d'entrée que s'ils sont ajoutés/supprimés. Lignes par symbole via un LCS de lignes sur `SymbolTexts` ; fichiers repris des `FileChange`. Types `GraphDiff`/`NodeChange`/`NodeStatus`/`FileChange` dans relief-model (serde + schemars, `JsonSchema` écrit à la main pour `NodeId` = string).
- Suite : cargo 217 passed, 0 failed (baseline 205/0) ; web 2 passed, 0 failed ; `just lint` propre ; aucun fichier de test modifié.
- Questions ouvertes : aucune

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `crates/relief-diff/src/lib.rs` — `Modified { body: true }` codé en dur, seul `content_hash` comparé : E02 (signatures) devra l'étendre ; aucun test ne fixe qu'un changement de `signature_hash` seul reste sans entrée.
  - `crates/relief-diff/src/lib.rs` — un même id dont le `kind` change entre base et head est ignoré (improbable avec les ids actuels).
  - `crates/relief-diff/src/lib.rs` — `line_diff` est un LCS O(n·m) ; prévoir un garde-fou ou Myers si de très gros symboles deviennent courants. `count` sature à `u32::MAX` sans commentaire.
  - `crates/relief-model/src/id.rs` — `JsonSchema` de `NodeId` écrit à la main (`type: string`) : vérifier qu'il est bien dans le schéma régénéré quand M02 branchera `just contract`.
  - `crates/relief-diff/tests/node_diff.rs` — pas de test d'un symbole modifié sans textes fournis (comptes à 0, silencieux).
- Vérifié par la review : couverture des critères, tests via `GraphBuilder` et API publique sans mock, `relief-diff` ne dépend que de `relief-model`, pas d'`unwrap()` hors tests, rien d'édité à la main dans le contrat.

## Documentation

Ticket interne (moteur de diff, aucune commande, option ni écran nouveau) : pas de changement de la doc utilisateur. Rien à documenter dans F05 au titre de ce ticket ; les statuts de nœud (`added`/`removed`/`modified`) le seront avec l'écran de relecture qui les affiche.

## Answer

- Construit : types `GraphDiff`, `NodeChange`, `NodeStatus` (`added | removed | modified { body }`), `FileChange` dans `relief-model` (`diff.rs`, serde camelCase + schemars) ; `relief_diff::diff_graphs(&base, &head, &[FileChange], &SymbolTexts) -> GraphDiff`.
- Décisions : `FileChange` vit dans `relief-model` (relief-diff ne dépend pas de relief-git) ; les conteneurs n'ont une entrée que s'ils sont eux-mêmes ajoutés ou supprimés, leur statut « modifié » se calcule à l'affichage ; seuls les symboles sont `modified`, par `content_hash` ; `+/-` par fichier repris des `FileChange`, par symbole par diff de lignes (LCS) des textes de span fournis par l'appelant (`SymbolTexts`, 0 si absents) ; `JsonSchema` de `NodeId` écrit à la main.
- Vérifié : `cargo test -p relief-diff --test node_diff` 12/12 ; `just test-summary` cargo 217 passed, 0 failed (baseline 205/0), web 2/0 ; `just lint` propre ; aucun fichier de test modifié par green ; review `ship`.
