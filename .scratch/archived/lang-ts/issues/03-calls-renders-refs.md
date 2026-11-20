# Appels, rendus JSX et références de types

Status: resolved
Type: task
Blocked by: T02
UI: non
Doc: aucune

Spec: `../spec.md`

## À faire

- `calls` : appels de fonctions et de méthodes dont la cible est un symbole connu (même fichier, ou nom importé ; `obj.method()` sur une instance importée de classe connue quand c'est syntaxiquement évident, sinon ignoré).
- `renders` : `<Composant />` vers le composant importé ou local.
- `references` : types utilisés dans les signatures et corps (`InvoiceLine`, `DiscountCode`).
- Arêtes au niveau symbole → symbole ; doublons fusionnés (un compteur `weight`).

## Critères d'acceptation

- [x] Sur acme-shop (branche), les arêtes de la maquette (`E_SPEC`) de type `calls`, `renders`, `references` sont présentes (test qui compare à une liste littérale, sauf `http`), aux écarts près listés ci-dessous.
- [x] Pas d'arête vers une fonction locale homonyme d'un autre fichier (portée respectée).

Amendement (décision de l'orchestrateur, review du 2026-11-19) : `E_SPEC` résume la maquette, la fixture acme-shop est du vrai code. Le test vérifie l'**inclusion** des arêtes de `E_SPEC` (la fixture en produit d'autres, réelles : `CheckoutPage -> Layout`, `renewSubscriptions -> buildInvoice`…) et écarte celles que le code de la fixture ne contient pas syntaxiquement :

- `getInvoice`, `listInvoices`, `postCheckout` -> `requireAuth` : `requireAuth` n'est pas appelé dans ces fonctions, il est passé comme `preHandler` dans les fonctions `register*Routes`.
- `refresh` -> `findUser` : le code passe par `this.load(...)`, donc `refresh` -> `SessionStore.load` -> `findUser`.
- `formatPrice`, `toCents` -> `Currency` : ces fonctions ne mentionnent que l'alias `Money`, qui référence `Currency`.
- `renewSubscriptions` -> `computeTotal` : remplacé par `renewSubscriptions` -> `buildInvoice` et `buildInvoice` -> `computeTotal`.

On garde la fixture fidèle à son code plutôt que de la tordre vers la maquette ; la maquette n'est pas un artefact testé.

## Baseline

`just test-summary` sur `develop` (35316e8) : cargo 149 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. **`TsAdapter::index_file` (relief-lang-ts, fonction publique)**, sur des sources TS/TSX en mémoire : attrape la reconnaissance syntaxique des `refs` (appel simple, appel de méthode `obj.method()` sur une instance de classe connue, `<Composant />`, types dans signatures et corps, fusion des doublons en `weight`) ; rate la résolution entre fichiers.
2. **`Indexer::with_adapter(TsAdapter)` sur la fixture acme-shop (relief-fixtures, branche)**, test d'intégration dans `crates/relief-lang-ts/tests/` : attrape les arêtes symbole → symbole résolues de bout en bout et compare à la liste littérale de `E_SPEC` (`calls`, `renders`, `references`, sans `http`) ; attrape aussi la portée (pas d'arête vers un homonyme d'un autre fichier, via une petite fixture dédiée) ; rate la CLI.

Hors périmètre : le branchement de `TsAdapter` dans la CLI (`relief show`). Ni ce ticket ni `spec.md` ne le demandent ; aucun ticket ne le fait à ce jour. `relief show --json` reste donc sans symbole ni arête sur un dépôt TS, même après ce ticket.

## Red

- Fichiers de test : `crates/relief-lang-ts/tests/refs.rs` (seam 1), `crates/relief-lang-ts/tests/refs_resolution.rs` (seam 2) ; fixture ajoutée : `fixtures/ts-scope/` (3 fichiers, fonctions locales homonymes)
- Lancer : `cargo test -p relief-lang-ts --test refs --test refs_resolution`
- En échec : 20 tests (10 + 10)
  - `refs.rs` (10, ne compile pas : `FileIndex.refs` / `Ref { from, name, kind, weight }` n'existent pas) : appel simple, appel dans une méthode (`C.run`), doublons fusionnés en `weight`, méthode sur instance locale (`Store.run`), méthode sur instance importée (`sessions.refresh`), receveur inconnu ignoré, JSX `renders` (capitale seulement, `weight` 2), types de signature et de corps, type utilisé deux fois (`weight` 2), type d'une signature de méthode
  - `refs_resolution.rs` : `acme_calls_match_the_maquette`, `acme_renders_match_the_maquette`, `acme_references_match_the_maquette`, `a_local_component_is_rendered_by_its_local_symbol`, `removed_edges_exist_on_main_and_are_gone_on_the_branch`, `added_edges_do_not_exist_on_main` — aucune arête `calls`/`renders`/`references` dans le graphe ; `calls_renders_and_references_are_syntactic_and_unique`, `edges_join_symbols_not_files` — aucune arête de ces types ; `a_call_stays_in_its_file_when_other_files_declare_a_homonym`, `a_call_to_a_name_neither_local_nor_imported_has_no_edge` — pas d'arête `calls` sur `ts-scope`

## Green

- Fichiers : `crates/relief-lang-ts/src/refs.rs` (nouveau), `crates/relief-lang-ts/src/lib.rs`
- Changement : `FileIndex` gagne `refs` (`Ref { from, name, kind, weight }`), `bindings` (imports nommés) et `instances` (`const x = new C()`). `index_file` collecte calls/renders/references par symbole englobant, doublons fusionnés. `TsAdapter::link` résout chaque ref en arête symbole -> symbole (portée : symbole du fichier d'abord, puis nom importé ; `recv.method` via l'instance déclarée dans le fichier importé, lue par `ctx.read`). Les identifiants importés utilisés comme valeur (`invoicesTable`) sont des `references`.
- Suite : `refs` 10/10, `refs_resolution` 10/10 après correction du test par tdd-red (`renewSubscriptions -> computeTotal` remplacé, voir l'amendement des critères) ; le reste de la crate est vert ; `just lint` propre.

Écart `E_SPEC` / fixture (test `acme_calls_match_the_maquette`) : `renewSubscriptions -> computeTotal` n'existe pas dans le code ; l'appel est dans `buildInvoice`. Le test attend `renewSubscriptions -> buildInvoice` et `buildInvoice -> computeTotal`.

## Review

- Verdict : **ship** (après une boucle `fix first`).
- Must fix appliqués (ticket seulement, aucun code) : (1) le critère E_SPEC est amendé (inclusion, quatre écarts listés avec leur raison) ; (2) `## Green` mis à jour (10/10).
- Consider (non appliqués) : un paramètre ou une variable locale homonyme d'un import donne une fausse `references` (pas de masquage) ; `resolve_import` ré-indexe le fichier cible à chaque `link` (cache par appel seulement) ; `Binding`/`Instance` publics, `pub(crate)` possible ; `from`/`name` en `String` qui codent `Class.method` (un type `Target` serait plus sûr) ; `collect` long ; `add` en recherche linéaire.

## Documentation

Ticket interne : aucune commande, option ni écran ne change (`Doc: aucune`), et l'adapter n'est pas branché dans la CLI. À documenter quand `TsAdapter` sera branché dans `relief show` (site F05) : les types d'arêtes `calls`, `renders`, `references`, leur `weight`, `precision: syntactic`, et les limites (receveurs de méthode reconnus seulement pour `new Classe()` local ou importé ; pas de masquage des noms par les paramètres).

## Answer

- Construit : `crates/relief-lang-ts/src/refs.rs` collecte, par symbole englobant, les `calls` (fonctions, méthodes `this`/instance `new C()` locale ou importée), `renders` (JSX à majuscule) et `references` (types des signatures et corps, identifiants importés utilisés comme valeur), doublons fusionnés en `weight`. `TsAdapter::link` les résout en arêtes symbole → symbole `syntactic` : symbole du même fichier d'abord, puis nom importé ; jamais un homonyme d'un autre fichier.
- Décisions : la comparaison à `E_SPEC` est une inclusion, avec quatre écarts actés (voir Critères). La fixture acme-shop n'est pas modifiée ; une fixture `fixtures/ts-scope/` couvre la portée.
- Non fait : le branchement de `TsAdapter` dans la CLI. Ni ce ticket ni le spec ne le demandent, et aucun ticket de la ROADMAP ne le prévoit : le jalon B (« carte complète d'un dépôt TS en JSON ») n'est atteint qu'à travers `Indexer::with_adapter`, pas par `relief show --json`.
- Vérifié : `cargo test -p relief-lang-ts --test refs --test refs_resolution` 20/20 ; `just lint` propre ; `just test-summary` cargo 169 passed / 0 failed (baseline 149), web 2/0.
