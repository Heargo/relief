# Lecture de relief.config.yaml

Status: resolved
Type: task
Blocked by: G01, N03
UI: non
Doc: docs/user `rules` (écrire des règles)

Spec: `../spec.md` (Décisions)

## À faire

- `relief-rules` (domaine, pur, sans I/O) : types `Config`, `Rule` (serde + schemars, schéma publié dans `docs/contract/config.schema.json`) et analyse du YAML à partir d'**octets**.
- `relief-app` lit le blob de `relief.config.yaml` à la ref head (via `relief-git`) et le donne à l'analyseur : `Session::rules(range)` renvoie les règles du head et le texte source du fichier.
- Globs compilés (`globset`) ; `exclude:` appliqué au snapshot : la `Session` passe l'ensemble d'exclusion à `Indexer` (option). Le cache par blob n'est pas touché, l'exclusion s'applique après lecture du cache.
- Erreurs avec ligne et colonne (`serde_yaml` / `serde_norway`) ; ids de règles uniques.
- Pas de fichier = pas de règles, sans avertissement.
- Le fichier reste à la racine du dépôt, versionné et partagé ; `.relief/` est local (ADR 0007).

## Critères d'acceptation

- [x] Le `relief.config.yaml` d'acme-shop est lu par `Session::rules` : 3 règles (test littéral).
- [x] Un id en double ou un glob invalide donne une erreur qui cite la ligne.
- [x] `relief-rules` ne dépend d'aucune crate d'I/O (vérifié par `layers.rs`).
- [x] Page `rules` : format du fichier avec l'exemple d'acme-shop (FR, EN), et la différence entre ce fichier versionné et `.relief/`.

## Baseline

`just test-summary` (develop, 3de1f80) : cargo 431 passed, 0 failed ; web 413 passed, 0 failed.

## Seams

- **Fonction publique de `relief-rules` qui analyse le YAML à partir d'octets** (sans git) : attrape les types `Config`/`Rule`, les défauts de `kinds`, les erreurs avec ligne et colonne (id en double, glob invalide, YAML malformé), `exclude:` compilé ; rate la lecture du blob.
- **Cas d'usage `Session::rules` de `relief-app` sur la fixture acme-shop** : attrape la lecture du blob à la ref head, les 3 règles et le texte source, l'absence de fichier sans avertissement (fixture sans config), `exclude:` appliqué au snapshot via l'option de l'`Indexer` ; rate la syntaxe fine du YAML.
- **`tests/relief-integration/tests/layers.rs`** (nommé par le ticket) : attrape une dépendance d'I/O de `relief-rules` ; rate le reste.

## Red

- Fichiers de test : `src/domain/relief-rules/tests/config.rs`, `src/app/relief-app/tests/rules.rs`, `tests/relief-integration/tests/layers.rs` (2 tests ajoutés)
- Lancer : `cargo test -p relief-rules --test config ; cargo test -p relief-app --test rules ; cargo test -p relief-integration --test layers`
- API supposée : `relief_rules::parse_config(&[u8]) -> Result<Config, ConfigError>` ; `Config { rules: Vec<Rule>, exclude }` + `is_excluded(&str)` ; `Rule { id, description, from, deny, kinds: Vec<relief_model::EdgeKind> }` ; `ConfigError::{line, column}() -> Option<usize>` et `Display` contenant « line N » ; `Session::rules(&RangeSpec) -> Result<RulesResponse, AppError>` avec `rules: Vec<Rule>` et `source: Option<String>` ; `relief-rules` dépend de `relief-model` (dev et normal) et `globset`.
- En échec : 16 tests
  - config.rs (8, ne compile pas : `parse_config` et la dépendance `relief_model` manquent) : parses_rules_with_their_fields, kinds_default_to_imports_calls_references_renders, explicit_kinds_replace_the_default, an_empty_file_has_no_rules, exclude_is_compiled_with_double_star_across_folders_and_star_in_one_segment, a_duplicate_id_is_an_error_citing_its_line, an_invalid_glob_is_an_error_citing_its_line, malformed_yaml_reports_line_and_column
  - rules.rs (6, ne compile pas : `Session::rules` manque) : acme_shop_config_gives_three_rules, the_source_text_of_the_file_is_returned, rules_come_from_the_head_ref_not_the_base, no_config_file_means_no_rules_and_no_error, an_invalid_config_is_an_error_citing_the_line, exclude_removes_files_from_the_snapshot
  - layers.rs (2, assertion) : rules_depends_only_on_the_model_among_workspace_crates — relief-rules n'a aucune dépendance ; rules_depends_on_no_io_crate — `globset` absent
- Le fichier réel d'acme-shop a bien 3 règles (web-sans-db, packages-sans-apps, routes-via-repos).

## Green

- Fichiers : src/domain/relief-rules/{Cargo.toml,src/lib.rs,src/config.rs,src/bin/write-config-schema.rs}, src/analysis/relief-index/src/lib.rs, src/app/relief-app/{Cargo.toml,src/lib.rs,src/error.rs}, justfile, docs/contract/config.schema.json, Cargo.lock
- Changement : `relief-rules` analyse le YAML à partir d'octets (`parse_config`, `Config`, `Rule`, `ConfigError` avec ligne/colonne, globs `globset`, schéma via `just contract`). `Indexer::snapshot_excluding` filtre le listing d'arbre (cache par blob intact). `Session::rules` lit le blob à la ref head ; `Session::snapshot` applique `exclude:` de la config du commit indexé.
- Suite : relief-rules 8/8, layers 10/10, relief-app rules 5/6 ; `just test-summary` cargo s'arrête sur 1 échec (baseline 431/0), web 413/0.
- Questions ouvertes : le test `no_config_file_means_no_rules_and_no_error` (rules.rs) échoue : `init..reshape` n'est pas une ref git (les ids de commit de la fixture `tiny` ne sont ni tags ni branches, d'où `UnknownRef`) ; le test est à corriger (ex. `HEAD~2..HEAD`). `just lint` échoue uniquement sur Prettier pour docs/user/.../rules.md (FR et EN), modifiés par un autre acteur que moi (non touchés par ce green).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - docs/user/src/content/docs/rules.md et en/rules.md — « les arêtes `http` et `depends_on` ne sont pas vérifiées par défaut » : `extends` et `implements` ne le sont pas non plus ; citer les six sortes ou dire « les quatre par défaut, les autres sur demande ».
  - src/domain/relief-rules/src/config.rs:35 — `RawConfig` sans `deny_unknown_fields` : une faute de frappe (`kind:`, `denny:`) est ignorée en silence. Le refuser donnerait une erreur avec ligne et colonne.
  - src/domain/relief-rules/src/config.rs:~105 — `rule_line` retrouve la ligne en rescannant le texte (heuristique sur `- ` et l'indentation) ; fragile avec du YAML en flux ou des commentaires. Acceptable ici, à surveiller.
  - src/app/relief-app/src/lib.rs:512 — `Session::snapshot` ignore en silence une config invalide (`.ok()`) et relit `list_tree` une seconde fois à chaque indexation. Un test de l'erreur de doublon d'id côté `Session` manque aussi (seul le glob invalide est couvert).
  - src/app/relief-app/tests/rules.rs:119 — l'assertion `exclude` passe par `format!("{:?}", graph)` et un `contains("discount.ts")` ; chercher les ids de nœuds serait plus précis.
  - src/app/relief-app/src/lib.rs `read_config` — `#[allow(clippy::type_complexity)]` : un petit type (`ConfigFile { text, parsed }`) serait plus lisible.

## Answer

- Construit : `relief-rules` (pur, dépend seulement de `relief-model`, `serde`, `serde_yaml`, `schemars`, `globset`) : `parse_config(&[u8])`, `Config` (`rules`, `exclude`, `is_excluded`), `Rule` (`kinds` par défaut `imports, calls, references, renders`), `ConfigError` avec ligne et colonne ; schéma `docs/contract/config.schema.json` publié par `just contract` (bin `write-config-schema`). `Indexer::snapshot_excluding` filtre le listing d'arbre (cache par blob intact). `Session::rules(range)` lit le blob à la ref head et renvoie les règles et le texte source ; `Session::snapshot` applique `exclude:`. Pas de fichier = pas de règles.
- Décision : le test « pas de fichier » utilisait `init..reshape`, qui ne sont pas des refs git dans la fixture `tiny` ; plage corrigée en `HEAD~1..HEAD` par l'orchestrateur.
- Vérifié : `just test-summary` cargo 447/0, web 413/0 (baseline 431/413) ; `just e2e-summary` 69 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-build` ; review « ship ».
- Doc : page `rules` (FR et EN) : format avec l'exemple d'acme-shop, `kinds`, globs, `exclude:`, lecture au head, erreurs, différence avec `.relief/`. Les erreurs de config ne sont pas encore affichées dans l'UI (A03).
- Suivis (Consider) : `deny_unknown_fields` pour signaler une faute de frappe (`denny:`) ; retrouver la ligne d'une règle par les positions du parseur plutôt qu'en rescannant le texte ; `Session::snapshot` ignore une config invalide en silence et relit l'arbre deux fois ; test `Session` du doublon d'id.
