# Symboles TS/TSX

Status: resolved
Type: task
Blocked by: M01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions)

## À faire

- `relief-lang-ts` : `TsAdapter` qui implémente `LanguageAdapter` pour `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`.
- Symboles : fonctions, classes et leurs méthodes (`Class.method`), interfaces, types, enums, constantes exportées ; `subkind` (`function`, `class`, `method`, `type`, `enum`, `const`, `component`, `hook` si le nom commence par `use`), visibilité (`public` si exporté, `internal` sinon ; méthode `private`/`#x` → `internal`), `span`.
- `content_hash` et `signature_hash` + texte de signature normalisé (voir spec).
- Fichier qui ne parse pas : nœud `file` avec un avertissement, pas d'échec.

## Critères d'acceptation

- [x] Sur des fichiers d'acme-shop (`billing/invoice.ts`, `auth/session.ts`, `PromoCodeInput.tsx`) : snapshot `insta` des symboles (noms, subkinds, visibilité).
- [x] Reformater un fichier (Prettier) ne change aucun `content_hash` ; ajouter un paramètre optionnel change le `signature_hash` ; changer seulement le corps change le `content_hash` mais pas le `signature_hash`.
- [x] Un fichier avec une erreur de syntaxe produit ses symboles valides et un avertissement.

## Baseline

`just test-summary` sur `develop` (3cf049a) : cargo 105 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. **`relief_lang_ts::TsAdapter`, méthode publique `index_file(path, bytes) -> FileIndex`** (contrat nommé par le spec : symboles + avertissements, sérialisable), alimentée par les octets des fichiers d'acme-shop (lus via `relief-fixtures`/`relief-git`, git non mocké) et par des sources en mémoire. Attrape : noms, subkinds, visibilité, spans (snapshot `insta`), invariants de `content_hash`/`signature_hash` et texte de signature, fichier en erreur de syntaxe (symboles valides + avertissement). Rate : l'intégration dans le graphe du commit.
2. **`relief_index::Indexer::new(..).with_adapter(Box::new(TsAdapter::new()))` sur la fixture acme-shop** (trait `LanguageAdapter` existant, éventuellement étendu pour remonter les avertissements). Attrape : `TsAdapter` implémente bien `LanguageAdapter`, ne prend que `.ts/.tsx/.js/.jsx/.mts/.cts`, ses symboles sont des nœuds du snapshot rattachés à leur fichier (graphe valide), son nom est dans `meta.adapters`, un fichier qui ne parse pas donne un avertissement dans `meta.warnings` sans faire échouer l'indexation. Rate : le détail des hashes (seam 1) et la CLI (`relief show` n'enregistre pas encore l'adapter : hors ticket).

## Red

- Fichiers de test : `crates/relief-lang-ts/tests/symbols.rs`, `crates/relief-lang-ts/tests/indexer.rs` (dev-dependencies ajoutées à `crates/relief-lang-ts/Cargo.toml` : insta, relief-fixtures, relief-git, relief-index, relief-model, serde_json, tempfile)
- Lancer : `cargo test -p relief-lang-ts --test symbols` et `cargo test -p relief-lang-ts --test indexer`
- Formes attendues (à implémenter par green) :
  - `relief_lang_ts::{TsAdapter, FileIndex, Symbol}` ; `TsAdapter::new()` ; `TsAdapter::index_file(&self, path: &str, bytes: &[u8]) -> FileIndex`.
  - `FileIndex { symbols: Vec<Symbol>, warnings: Vec<String>, .. }`, symboles dans l'ordre du source (méthodes juste après leur classe).
  - `Symbol { name: String ("Class.method" pour une méthode), subkind: String, visibility: relief_model::Visibility, span: relief_model::Span (1-based), content_hash: String, signature_hash: Option<String>, signature: Option<String> }`.
  - Un avertissement nomme le chemin du fichier ; `TsAdapter` implémente `relief_index::LanguageAdapter` (`handles("ts"|"tsx"|"js"|"jsx"|"mts"|"cts")`, pas `rs`/`py`/`json`/`md`...), et le trait doit remonter les avertissements dans `meta.warnings` (un par fichier en erreur, contenant son chemin ; forme de l'extension du trait laissée à green).
  - Id d'un symbole : `<id du fichier>::sym:<name>`, `parent` = nœud fichier, `kind: Symbol`, `lang` = celui du fichier.
- Snapshots insta : `acme_invoice_symbols`, `acme_session_symbols`, `acme_promo_code_input_symbols` n'existent pas encore ; green doit les créer (`cargo insta review`), relire leur contenu et ne pas les accepter à vide.
- En échec : 22 tests (les 17 de `symbols.rs`, les 5 de `indexer.rs`) — aucun ne compile : `TsAdapter`, `FileIndex`, `Symbol` absents de `relief_lang_ts` (le rouge est l'export manquant). Détail des comportements :
  - symbols.rs : acme_invoice_symbols, acme_session_symbols, acme_promo_code_input_symbols — noms/subkinds/visibilité des fichiers acme-shop + snapshot des spans ; every_declaration_kind_gets_its_subkind ; private_and_hash_methods_are_internal ; local_variables_are_not_symbols ; react_component_is_a_capitalised_function_or_const_returning_jsx ; every_supported_extension_is_indexed ; span_is_one_based_and_covers_the_declaration ; reformatting_changes_no_hash_nor_signature_text ; adding_an_optional_parameter_changes_the_signature_hash ; changing_only_the_body_changes_content_hash_but_not_signature_hash ; changing_the_return_type_changes_the_signature_hash ; dropping_the_export_changes_the_signature_hash ; a_method_body_change_only_touches_that_method ; a_syntax_error_keeps_the_valid_symbols_and_warns ; a_clean_file_has_no_warning — symbole `TsAdapter` manquant.
  - indexer.rs : handles_only_the_ts_family_of_languages ; acme_symbols_are_nodes_attached_to_their_file ; every_symbol_node_hangs_under_a_file_of_a_supported_language ; the_adapter_name_is_reported_in_the_meta ; a_file_that_does_not_parse_warns_without_failing_the_indexation — symbole `TsAdapter` manquant.

## Green

- Fichiers : `crates/relief-lang-ts/src/lib.rs`, `crates/relief-lang-ts/queries/symbols.scm`, `crates/relief-lang-ts/Cargo.toml`, `crates/relief-lang-ts/tests/snapshots/symbols__acme_{invoice,session,promo_code_input}_symbols.snap`, `crates/relief-index/src/lib.rs`, `Cargo.lock`
- Changement : `TsAdapter` (tree-sitter, grammaires typescript/tsx, requête `symbols.scm`) avec `index_file` -> `FileIndex`/`Symbol` ; hashes sur les tokens (sans commentaires, `;`, virgules finales, guillemets), signature normalisée. `LanguageAdapter::extract` renvoie maintenant `Extraction { nodes, edges, warnings }` et l'index reporte les avertissements dans `meta.warnings`. Un symbole dont la déclaration contient une erreur de syntaxe est écarté, le fichier garde un avertissement `<chemin>: syntax error at line N`. Les 3 snapshots ont été relus contre les sources acme-shop (lignes et visibilités correctes).
- Suite : cargo 127 passés, 0 échoué (baseline 105/0) ; web 2/0 ; `just lint` propre ; aucun fichier de test modifié.
- Questions ouvertes : aucune

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `tokens()` retire les guillemets des chaînes : `f("x")` et `f(x)` ont le même `content_hash`. Normaliser les guillemets au lieu de les supprimer.
  - `index_file` dédoublonne par nom en gardant le premier : surcharges fusionnées, collision possible entre `#x` et `x` d'une même classe. À commenter ou tester.
  - `build_symbol` est long (~120 lignes, quatre cas) : extraire `function_like`, `variable`, `method`.
  - La `Query` est recompilée à chaque fichier : la mettre en cache (`OnceLock`) dans `TsAdapter`.
  - `extract` retrouve le chemin en découpant l'id sur `::file:` : fragile, préférer un accesseur de `relief-model`.
  - `Cargo.toml` de `relief-lang-ts` : `serde` sans `features = ["derive"]` (compile par unification des features) ; sections `[dev-dependencies]` avant `[dependencies]`.

## Documentation

Ticket interne (`Doc: aucune`) : aucune commande, option ni écran ne change, `relief show` n'enregistre pas encore l'adapter. Rien à documenter dans `user-docs/`.

## Answer

- Construit : `relief_lang_ts::TsAdapter` (tree-sitter, grammaires `typescript` et `tsx`, requête `queries/symbols.scm`) avec `index_file(path, bytes) -> FileIndex { symbols, warnings }` ; chaque `Symbol` porte nom (`Class.method`), subkind, visibilité, span, `content_hash` (tokens sans espaces ni commentaires), `signature_hash` et texte de signature normalisé. `TsAdapter` implémente `LanguageAdapter` pour `ts`, `tsx`, `js`, `jsx`, `mts`, `cts`.
- Décisions : `LanguageAdapter::extract` renvoie `Extraction { nodes, edges, warnings }` ; l'`Indexer` reporte les avertissements dans `meta.warnings`. Un fichier en erreur de syntaxe garde ses symboles valides et un avertissement `<chemin>: syntax error at line N`. Ids de symboles `<id du fichier>::sym:<name>`. L'adapter n'est branché qu'en test (`Indexer::with_adapter`), pas encore dans la CLI.
- Vérifié : 22 nouveaux tests (`cargo test -p relief-lang-ts --test symbols --test indexer`), dont 3 snapshots insta sur acme-shop relus ; suite complète cargo 127/0 (baseline 105/0), web 2/0 ; `just lint` propre. Pas d'UI, pas de navigateur.
