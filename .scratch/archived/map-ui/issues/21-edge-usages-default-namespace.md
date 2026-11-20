# U21 Utilisations d'arête : imports par défaut et espace de noms

Status: resolved
Type: bug
Blocked by: U20
UI: oui (texte de l'inspecteur d'arête seulement)
Doc: user-docs `map` (utilisations dans le code) si le comportement visible change

Spec: `../spec.md` (« Retours du 2026-11-20 ») ; suite de la review d'U20.

## Constat

`import Foo from './foo'` et `import * as db from './db'` créent une arête `imports` vers le **fichier** cible (pas vers un symbole) : `Session::edge_usages` (`src/app/relief-app/src/lib.rs`, la boucle sur les arêtes `Imports`) saute toute arête dont `edge.to.symbol_key()` est `None`. Ces imports ne rapportent donc aucune utilisation, et l'inspecteur affiche « Importé mais jamais utilisé » alors que le fichier se sert de `Foo(...)` ou de `db.findUser(...)`. De même, `refs::bindings` (`relief-lang-ts`) rend `imported = "default"` ou `"*"` pour ces liaisons, alors qu'`edge_usages` ne demande que des noms exportés.

## À faire

- Une arête `imports` vers un fichier (import par défaut ou espace de noms) compte aussi : les utilisations de la liaison locale (`Foo`, `db`) dans le fichier source sont listées. Pour `db.findUser(x)`, l'utilisation est l'identifiant `db` à cette position.
- Seules les liaisons dont le module importé est bien la cible de l'arête comptent : un import par défaut ou `* as` d'un **autre** module dans le même fichier n'apparaît pas. (La résolution d'un spécifieur vers un fichier existe déjà côté adapter TS : `resolve`.)
- Le nom affiché du groupe pour ces liaisons est le nom local (`Foo`, `db`), pas `default` ni `*`.
- Les imports nommés gardent leur comportement d'U20 (aucune régression des 11 tests de `relief-lang-ts/tests/usages.rs` ni des 5 de `relief-app/tests/edge_usages.rs`).
- Le contrat de `LanguageAdapter::usages` peut évoluer si nécessaire ; garder « `None` = non pris en charge ».

## Critères d'acceptation

- [ ] cargo (`relief-lang-ts`) : utilisations d'un import par défaut ; d'un espace de noms (`ns.f()` compté sur `ns`) ; ombrage local exclu ; un import par défaut d'un autre module dans le même fichier exclu.
- [ ] cargo (`relief-app`) : `edge_usages` sur une fixture où un fichier importe un autre par défaut et par `* as` rend ces utilisations, groupées sous le nom local ; plus de `total: 0` pour ce cas.
- [ ] Les suites existantes restent vertes.

## Seams

1. **Adapter TS** (cargo, sur des octets) : `usages`.
2. **relief-app** (cargo, dépôt de fixture `relief-fixtures`) : `Session::edge_usages`.

## Baseline

Après U20 (2dbaa29, 2026-11-20) : cargo 603/0 ; web 641/0 ; e2e 129 passed, 1 skipped, 0 failed.

## Red

- Fichiers de test : `src/analysis/lang/relief-lang-ts/tests/usages.rs`, `src/app/relief-app/tests/edge_usages.rs`
- Contrat posé par les tests : nouvelle méthode `LanguageAdapter::module_usages(&self, path, bytes, target: &str, paths: &[&str]) -> Option<Vec<Usage>>` (`target` = chemin du fichier importé, `paths` = chemins de l'arbre pour résoudre les spécifieurs ; `Usage.binding` = nom local ; `None` = non pris en charge). `Session::edge_usages` doit l'appeler pour les arêtes `imports` vers un fichier.
- Lancer : `cargo test -p relief-lang-ts --test usages` ; `cargo test -p relief-app --test edge_usages`
- En échec : 7 tests
  - usages.rs (ne compile pas, `module_usages` n'existe pas sur `TsAdapter`/le trait) : `a_default_import_is_found_under_its_local_name`, `a_namespace_member_call_is_counted_on_the_namespace_identifier`, `a_default_import_shadowed_by_a_parameter_is_not_a_usage`, `default_and_namespace_imports_of_another_module_are_not_usages` (les 11 tests d'U20 du fichier sont bloqués par l'erreur de compilation tant que le symbole manque)
  - edge_usages.rs : `an_edge_for_a_default_import_lists_the_uses_under_the_local_name` — total 0 au lieu de 1 ; `an_edge_for_a_namespace_import_lists_the_uses_of_the_namespace` — total 0 au lieu de 1 ; `a_module_edge_gathers_default_and_namespace_imports_of_its_files` — aucune utilisation `Ledger`/`rates`/`Other` rendue

## Green

- Fichiers : `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/relief-index/src/lib.rs`, `src/analysis/lang/relief-lang-ts/src/lib.rs`, `src/analysis/lang/relief-lang-ts/src/usages.rs`, `src/app/relief-app/src/lib.rs`, `src/analysis/lang/relief-lang-ts/tests/usages.rs` (helper seulement : argument `&TREE` devenu `&relief_adapter_api::ResolveEnv {..}`, autorisé)
- Changement : `LanguageAdapter::module_usages(path, bytes, target, env: &ResolveEnv)` (`None` par défaut) ; `ResolveEnv` = chemins de l'arbre, lecteur de blobs, `package_dirs`. L'adapter TS construit un `LinkContext` et réutilise `resolve` (paquets du workspace, tsconfig inclus). `Indexer::package_dirs` expose la détection ; `Session::edge_usages` regroupe noms importés et fichiers cibles par fichier source.
- Suite : cargo 611/0 (baseline 603/0) ; web 641/0 ; e2e 129 passed, 1 skipped, 0 failed ; lint propre.
- Questions ouvertes : aucune

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - src/analysis/relief-index/src/lib.rs:86 — `package_dirs` refait `list_tree`, la table `by_path`, la closure `read` et la détection que `snapshot_excluding` fait déjà (duplication) ; coût : détection et lecture des manifestes à chaque appel d'`edge_usages` — extraire un helper `TreeView` partagé, ou mettre `package_dirs` en cache dans `IndexedSnapshot`.
  - src/analysis/lang/relief-lang-ts/src/usages.rs:41 — `module_usages` reconstruit la map `files` (O(chemins)) et reparse le fichier à chaque (fichier source, cible) ; une seule passe par fichier avec toutes les cibles éviterait cela sur de gros modules.
  - src/app/relief-app/src/lib.rs:~915 — `edge_usages` parse deux fois un fichier qui mêle imports nommés et par défaut ; acceptable.
  - docs/user/src (page `map`, « Utilisations dans le code ») — dire en une phrase que les imports par défaut et `* as` sont groupés sous leur nom local (la page parle de « symbole importé »).

## Answer

Une arête `imports` vers un fichier (import par défaut ou `* as`) remonte maintenant ses utilisations. La nouvelle capacité d'adapter `LanguageAdapter::module_usages(path, bytes, target, env: &ResolveEnv)` (`None` par défaut) liste les utilisations des liaisons locales dont le spécifieur se résout vers `target`. `ResolveEnv` regroupe les chemins de l'arbre, un lecteur de blobs et `package_dirs`. L'adapter TS réutilise `resolve` de l'indexation : chemins relatifs, paquets du workspace et tsconfig. Les groupes portent le nom local (`Ledger`, `rates`), et `ns.f()` compte sur `ns`. `Session::edge_usages` appelle `usages` pour les imports nommés et `module_usages` pour les arêtes vers un fichier. `Indexer::package_dirs` est ajouté.

Vérifié : cargo 611/0 (dont 4 nouveaux tests d'adapter et 4 de `relief-app`, avec un cas `@acme/shared/...` du workspace), web 641/0, e2e 129 passés / 1 ignoré / 0 échec, `just lint` propre, review `ship`. Deux retouches de tests après green, avec accord : la colonne de `rates` passe de 22 à 21 (base 0), et le helper du test d'adapter est adapté au contrat `ResolveEnv`, attentes intactes. Doc `map` (FR/EN) : une phrase sur le nom local.

Restent en `Consider` : `package_dirs` recalculé à chaque appel (à mettre en cache avec le snapshot), et un fichier source reparsé pour chaque cible.
