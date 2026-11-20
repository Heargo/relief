# Imports et résolution de modules

Status: resolved
Type: task
Blocked by: T01, D02, I01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : contrat)

## À faire

- Extraire les imports (`import … from`, `export … from`, `import()` littéral, `require()` littéral) avec les noms importés.
- Résoudre dans l'index : chemins relatifs (extensions, `index.ts`), `paths` de `tsconfig.json` (avec `extends`), packages du workspace (table de D02, `exports` du `package.json` si présent), sinon dépendance externe.
- Arête `imports` du symbole (ou du fichier, pour un import en tête utilisé partout) vers le symbole importé quand il est nommé, vers le fichier sinon.
- Un import non résolu produit une arête vers un nœud `external` « non résolu » et un avertissement, jamais une erreur.

## Critères d'acceptation

- [ ] Sur acme-shop (branche) : `CartSummary` importe `formatPrice` de `packages/shared/money/format.ts` via `@acme/shared/money` (test sur l'arête).
- [ ] `PromoCodeInput.tsx` importe `findDiscountByCode` de `packages/db/repos/discountRepo.ts`.
- [ ] Un import de `react` mène au nœud externe `react` ; un chemin relatif cassé mène au nœud « non résolu ».

## Baseline

`just test-summary` sur `develop` (5c923f6) : cargo 127 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. **`TsAdapter::index_file` (relief-lang-ts, octets → `FileIndex.imports`)** : attrape l'extraction des quatre formes d'import (`import … from`, `export … from`, `import()` littéral, `require()` littéral) avec leurs noms importés (nommé, alias, défaut, namespace, side-effect), et l'ignorance des `import()`/`require()` non littéraux. Rate la résolution entre fichiers.
2. **`Indexer::with_adapter(TsAdapter)` sur un dépôt de fixture (relief-index, tests d'intégration)** : sur acme-shop (branche) les arêtes `imports` `CartSummary` → `formatPrice` via `@acme/shared/money` et `PromoCodeInput` → `findDiscountByCode`, l'import de `react` vers le nœud `external` `react` ; sur une petite fixture dédiée (relief-fixtures) les chemins relatifs (extensions, `index.ts`), les `paths` de `tsconfig.json` avec `extends`, les `exports` d'un `package.json` de workspace (table `package_dirs` de D02), et un relatif cassé vers le nœud « non résolu » avec un avertissement, sans erreur. Rate l'exposition CLI (non demandée par le ticket).

## Red

- Fichiers de test : `crates/relief-lang-ts/tests/imports.rs`, `crates/relief-lang-ts/tests/imports_resolution.rs`, fixture `fixtures/ts-imports/` (relatifs, `index.ts`, `paths` + `extends`, `exports` de package.json, relatif cassé `./missing`, `react`)
- Lancer : `cargo test -p relief-lang-ts --test imports` puis `cargo test -p relief-lang-ts --test imports_resolution`
- API attendue (à créer par green) : `FileIndex.imports: Vec<Import>`, `Import { specifier: String, names: Vec<String> }` (nom exporté d'origine pour un alias, `"default"`, `"*"` pour namespace / `export *` / `import()` / `require()` littéraux, vide pour side-effect), ordre source. Nœud non résolu : `NodeKind::External` dont l'id contient `unresolved` (ex. `pkg:external/unresolved`) + un avertissement par import contenant le chemin du fichier et le spécifieur. Arêtes `imports` : depuis le fichier ou son symbole, `precision: syntactic`.
- En échec : `imports` ne compile pas (champ `FileIndex.imports` manquant), donc les 14 tests de `imports.rs` sont rouges (formes d'import, alias, défaut, namespace, side-effect, type-only, re-exports, dynamic/require littéraux, non littéraux ignorés, ordre, tsx).
- En échec : 8 tests de `imports_resolution.rs`, tous faute d'arête `imports` (l'index n'en produit aucune) : cart_summary_imports_format_price_through_the_workspace_alias, promo_code_input_imports_find_discount_by_code, an_import_of_react_leads_to_the_external_node, imports_edges_are_syntactic, relative_imports_resolve_extensions_and_index_files, tsconfig_paths_are_followed_through_extends, package_exports_map_the_subpath_to_a_file, a_broken_relative_import_leads_to_the_unresolved_node_with_a_warning.

## Green

- Fichiers : `crates/relief-lang-ts/src/lib.rs`, `crates/relief-lang-ts/src/resolve.rs` (nouveau), `crates/relief-lang-ts/Cargo.toml`, `crates/relief-index/src/lib.rs`
- Changement : `FileIndex.imports` (`Import { specifier, names }`) extrait par parcours de l'arbre (4 formes). `LanguageAdapter::link` (2e passe de l'`Indexer`, `LinkContext` avec chemin du fichier, table `package_dirs` de D02, chemin→id des fichiers) ; `resolve.rs` résout relatifs, `paths` + `extends`, packages du workspace (`exports`), sinon externe ; arêtes `imports` syntactic fichier → symbole/fichier, nœuds `pkg:external/<nom>` et `pkg:external/unresolved` + avertissement.
- Suite : cargo 149 passed / 0 failed (baseline 127), web 2 / 0 ; `just lint` propre.
- Questions ouvertes : l'`Indexer` découpe encore l'id sur `::file:` une seule fois pour bâtir la table chemin→id (le reste passe par `LinkContext.path`) ; `extract` de `TsAdapter` fait toujours ce découpage.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `relief-index/src/lib.rs` et `relief-lang-ts/src/lib.rs` (`extract`) : découpage de l'id sur `::file:` répété ; un accesseur `NodeId::file_path()` dans relief-model remplacerait les deux et la table `by_path` dérivée.
  - `relief-index/src/lib.rs` : `detection.nodes/edges/warnings.clone()` inutiles ; déstructurer `detection` en gardant `package_dirs`.
  - `relief-lang-ts` `link` : second parse tree-sitter par fichier (le cache par blob pourra l'absorber).
  - `link` : les arêtes partent toujours du fichier, jamais du symbole ; acceptable tant qu'il n'y a pas d'attribution d'usage.
  - `resolve.rs` : `load_tsconfig` relit la chaîne `extends` à chaque import ; à mettre en cache. `strip_jsonc` pourrait devenir un helper testé.
  - `relief-lang-ts/Cargo.toml` : ordre alphabétique des dépendances rompu.

## Documentation

Ticket interne (Doc: aucune, UI: non, `TsAdapter` non branché dans la CLI) : rien à documenter pour l'instant. Quand l'adapter sera branché dans la CLI, la page de `relief show` devra mentionner les arêtes `imports` et les nœuds `external` / « non résolu » avec leurs avertissements.

## Answer

- Construit : extraction des imports dans `TsAdapter::index_file` (`FileIndex.imports`, `Import { specifier, names }`, quatre formes) ; seconde passe `LanguageAdapter::link` dans l'`Indexer` avec un `LinkContext` (chemin du fichier, `package_dirs` de D02, table chemin → id) ; résolution dans `relief-lang-ts/src/resolve.rs` (relatifs avec extensions et `index.ts`, `paths` de `tsconfig.json` avec `extends`, packages du workspace et leurs `exports`, sinon `pkg:external/<nom>`, ou `pkg:external/unresolved` avec un avertissement).
- Décisions : arêtes `imports` `precision: syntactic`, depuis le fichier, vers le symbole nommé ou le fichier ; `TsAdapter` reste hors CLI (non demandé).
- Vérifié : 14 tests d'extraction (`tests/imports.rs`) et 8 tests de résolution sur acme-shop et la nouvelle fixture `ts-imports` (`tests/imports_resolution.rs`) ; `just test-summary` cargo 149/0 (baseline 127), web 2/0 ; `just lint` propre.
