# Contrat JSON et types TypeScript générés

Status: resolved
Type: task
Blocked by: M01, E01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : contrat)

## À faire

- `schemars` sur `GraphSnapshot`, `GraphDiff` et les réponses de l'API qui existent à ce moment ; binaire ou test qui écrit `docs/contract/snapshot.schema.json` et `diff.schema.json`.
- Génération de `web/src/app/core/models/contract.ts` depuis les schémas (`json-schema-to-typescript`, version épinglée) ; recette `just contract`.
- Test Rust qui échoue si les schémas commités diffèrent de ceux générés (message : « run `just contract` »).
- `docs/contract/README.md` : à quoi sert le contrat, comment le régénérer.

## Critères d'acceptation

- [x] Modifier un champ d'un type Rust sans lancer `just contract` fait échouer `just test` (test vérifié une fois à la main, puis annulé).
- [x] `web/` compile contre `contract.ts` (un spec importe `GraphSnapshot`).

## Baseline

`just test-summary` sur `develop` (e38236e) : cargo 277 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. **Test d'intégration Rust du contrat** (fonction publique qui produit les schémas de `GraphSnapshot` et `GraphDiff` via `schemars`, comparée aux fichiers commités `docs/contract/snapshot.schema.json` et `diff.schema.json`, échec avec « run `just contract` ») : attrape un schéma périmé ou absent, et vérifie que les types ajoutés par E01–C02 y figurent (`meta`, schéma écrit à la main de `NodeId`, `Moved`, `SignatureChange`, `FileRename`, `FormatOnlySummary`…). Rate la génération TS.
2. **Spec Vitest qui importe `GraphSnapshot` (et `GraphDiff`) depuis `web/src/app/core/models/contract.ts`** : attrape un `contract.ts` absent ou incompatible avec le schéma (via `ng test`/`ng build`). Rate la fraîcheur de `contract.ts` vis-à-vis des schémas (assurée par `just contract`, qui régénère les deux d'un coup).
3. **Recette `just contract`** (commande tapée par le développeur) : écrit les deux schémas puis `contract.ts` avec `json-schema-to-typescript` épinglé ; vérifiée par le critère manuel (modifier un champ fait échouer `just test`, puis annuler). Rate : rien d'automatique au-delà du seam 1.

Validation : chaque comportement (schémas, génération TS, test de fraîcheur, compilation web) est atteint ; seams publics (fonction/test de crate, spec Vitest, recette just) ; rien n'est mocké ; 3 seams. Le README est de la doc, relu en review.

## Red

- Fichiers de test : `crates/relief-model/tests/contract.rs`, `web/src/app/core/models/contract.spec.ts`
- Lancer : `cargo test -p relief-model --test contract` ; `cd web && npx ng test --watch=false --include src/app/core/models/contract.spec.ts`
- Pour green : module public `relief_model::contract` avec `snapshot_schema() -> String` et `diff_schema() -> String` (JSON pretty, terminé par `\n`), `JsonSchema` sur `GraphSnapshot` (schéma de la forme sérialisée `{commit, nodes, edges}`, `$defs` de `Node`, `Edge`, `NodeId`) ; fichiers commités `docs/contract/snapshot.schema.json` et `diff.schema.json` ; `contract.ts` exportant `GraphSnapshot` et `GraphDiff`.
- En échec : 2 fichiers (6 tests Rust, 1 test web), tous en erreur de compilation
  - contract.rs (6 tests) — `relief_model::contract` n'existe pas (E0432)
  - contract.spec.ts (1 test) — `./contract` introuvable (TS2307)
- Non couvert faute de types existants : `meta`, `FileRename`, `FormatOnlySummary` (à ajouter aux assertions quand M02/diff les introduit).

### Décision de périmètre (orchestrateur)

Le contrat couvre les types sérialisés qui existent : `GraphSnapshot` (`relief-model`, `{commit, nodes, edges}`) et `GraphDiff`. `meta` vit dans `relief_index::SnapshotMeta`, porté par `IndexedSnapshot { graph, meta }`, qui n'est pas sérialisé ; `FileRename` et `FormatOnlySummary` (`relief-diff`) ne le sont pas non plus (résumé CLI). Ils entreront au contrat avec la réponse HTTP qui les expose (C03, « réponses de l'API ») : C03 devra ajouter leur schéma à `just contract` et au test de fraîcheur.

## Green

- Fichiers : `crates/relief-model/src/{contract.rs,bin/write-contract.rs,diff.rs,graph.rs,types.rs,lib.rs}`, `crates/relief-model/Cargo.toml`, `docs/contract/{snapshot.schema.json,diff.schema.json,README.md}`, `web/scripts/generate-contract.mjs`, `web/src/app/core/models/contract.ts`, `web/package.json`, `web/package-lock.json`, `justfile`
- Changement : `JsonSchema` sur les types du graphe ; `GraphSnapshot` délègue à son `Raw` sérialisé ; `NodeChange` et `EdgeChange` ont un schéma écrit à la main pour garder `NodeStatus`/`EdgeStatus` dans `$defs` (le derive inline le `flatten`). `just contract` écrit les schémas (binaire `write-contract`) puis génère `contract.ts` (`json-schema-to-typescript` 16.0.0 exact, script Node qui fusionne les deux schémas, Prettier ensuite ; deux exécutions donnent le même fichier). Périmètre : ni `meta`, ni `FileRename`, ni `FormatOnlySummary` (voir « Décision de périmètre »). Critère manuel vérifié : `lines_added: u32` passé en `u64` sans `just contract` fait échouer `committed_diff_schema_is_up_to_date` (« run `just contract` »), puis annulé.
- Suite : cargo 283 passés / 0 échoué (baseline 277 + 6) ; web 3 / 0 (baseline 2 + 1) ; `just lint` propre ; aucun fichier de test dans `git diff --name-only`.
- Questions ouvertes : aucune

## Review

(Écrit par l'orchestrateur à partir du rapport de `tdd-review`, en lecture seule.)

- Verdict : ship
- Must fix : aucun
- Consider :
  - `crates/relief-model/src/diff.rs:101-146` : les schémas écrits à la main de `NodeChange`/`EdgeChange` correspondent à la sérialisation actuelle (statut aplati en `allOf`, `commit` requis et nullable, camelCase), mais rien ne les relie aux structs : un champ ajouté ne ferait pas échouer le test de fraîcheur. Piste : un test qui sérialise un `NodeChange`/`EdgeChange` réel et compare ses clés à `required`/`properties`.
  - `crates/relief-model/src/contract.rs:8` : `unwrap_or_default()` donnerait un schéma vide si la sérialisation échouait ; un `expect` documenté ou un `Result` serait plus honnête.
  - `docs/contract/README.md`, « Périmètre » : le report de `meta`, `FileRename`, `FormatOnlySummary` à C03 est cohérent ; C03 doit le reprendre (note ajoutée à `.scratch/cli/issues/03-serve-and-api.md`).
  - `web/scripts/generate-contract.mjs` : la garde sur des `$defs` divergents entre schémas n'est pas testée ; acceptable pour un script de génération.
- Points vérifiés : schéma de `NodeId` repris tel quel de E01 (`{"type":"string"}`, test `node_id_is_a_plain_string_in_both_schemas`) ; `GraphSnapshot` décrit la forme sérialisée `{commit, nodes, edges}` ; critère manuel vérifié ; pas de secret ; `contract.ts` porte une bannière « Do not edit ».

## Documentation

Ticket interne (contrat pour les développeurs) : rien ne change pour l'utilisateur, `user-docs/` n'est pas touché. La doc développeur est `docs/contract/README.md`.

## Answer

- Construit : `JsonSchema` sur les types du graphe ; module `relief_model::contract` (`snapshot_schema()`, `diff_schema()`) et binaire `write-contract` ; schémas commités `docs/contract/snapshot.schema.json` et `diff.schema.json` ; `web/src/app/core/models/contract.ts` généré par `json-schema-to-typescript` 16.0.0 épinglé (`web/scripts/generate-contract.mjs`, puis Prettier) ; recette `just contract` ; `docs/contract/README.md`.
- Décisions : `GraphSnapshot` décrit sa forme sérialisée `{commit, nodes, edges}` ; `NodeChange`/`EdgeChange` ont un schéma écrit à la main pour garder `NodeStatus`/`EdgeStatus` dans `$defs` ; le schéma de `NodeId` écrit à la main en E01 est repris tel quel ; `meta`, `FileRename`, `FormatOnlySummary` (non sérialisés aujourd'hui) sont renvoyés à C03 (note dans son ticket).
- Vérifié : 6 tests Rust (`crates/relief-model/tests/contract.rs`, dont la fraîcheur avec « run `just contract` ») et 1 spec Vitest qui importe `GraphSnapshot`/`GraphDiff` ; critère manuel (champ `u32` → `u64` sans `just contract` fait échouer le test, annulé) ; `just contract` idempotent (empreintes identiques après deux exécutions) ; `just lint` propre ; suite complète cargo 283/0, web 3/0 (baseline 277/0 et 2/0).
