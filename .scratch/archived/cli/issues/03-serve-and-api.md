# `relief serve` et l'API HTTP

Status: resolved
Type: task
Blocked by: C02, M02
UI: non
Doc: user-docs `getting-started`

Spec: `../spec.md` (Décisions : serve)

## À faire

- `relief-server` : axum, `127.0.0.1` uniquement (option `--host` explicite pour autre chose, avec un avertissement), port, ouverture du navigateur (`--no-open`).
- Routes : `GET /api/meta` (dépôt, refs, plage courante, branches et tags), `GET /api/snapshot?ref=`, `GET /api/diff?range=`, `GET /api/code?node=&side=base|head` (texte d'un fichier ou d'un symbole), `GET /api/impact?node=&dir=&http=` (arrive avec R04, prévoir la place).
- UI embarquée depuis `web/dist` (placeholder « UI not built » si absent en debug), doc embarquée sous `/docs` (quand F05 existe).
- Erreurs JSON `{ code, message }` avec statut HTTP adapté.

## Critères d'acceptation

- [ ] Tests `oneshot` sur acme-shop pour chaque route (snapshot du JSON de `/api/diff`).
- [ ] `/api/code?node=` avec un id inconnu → 404 ; un id forgé avec `../` ne lit rien hors du dépôt (test).
- [ ] Le serveur refuse d'écouter sur `0.0.0.0` sans `--host`.

## Note de M02 (contrat JSON)

M02 n'a mis au contrat que `GraphSnapshot` et `GraphDiff`. Les réponses de l'API qui exposent `meta` (`relief_index::SnapshotMeta`, via `IndexedSnapshot { graph, meta }`), `FileRename` ou `FormatOnlySummary` doivent recevoir `JsonSchema`, être ajoutées à `relief_model::contract`/`just contract` et au test de fraîcheur (`crates/relief-model/tests/contract.rs`), puis `contract.ts` régénéré. Voir `docs/contract/README.md`, « Périmètre ».

## Baseline

`just test-summary` sur `develop` (e0837dc) : cargo 283 passed, 0 failed ; web 3 passed, 0 failed.

## Seams

1. **API HTTP** : le `Router` axum public de `relief-server` (construit pour un dépôt ouvert, en réutilisant l'indexeur et `diff_graphs_with_options` de C02 plutôt que de les dupliquer), appelé avec `tower::ServiceExt::oneshot` sur la fixture acme-shop (`RELIEF_CACHE_DIR`/sans cache, rien dans `~/.cache`). Attrape : chaque route (`/api/meta`, `/api/snapshot?ref=`, `/api/diff?range=` en snapshot insta, `/api/code?node=&side=`, `/api/impact` réservée), les erreurs JSON `{ code, message }` et leurs statuts, le 404 sur id inconnu, l'id forgé avec `../` qui ne lit rien hors du dépôt, le placeholder « UI not built ». Rate : l'écoute réseau réelle et l'ouverture du navigateur.
2. **Configuration d'écoute** : la fonction/le type public de `relief-server` (ou de la CLI) qui résout l'adresse d'écoute à partir de `--host`/`--port`, testé sans ouvrir de socket, plus `relief serve` en `assert_cmd` pour les seules erreurs d'usage (dépôt invalide → code 2), sans jamais laisser de serveur ouvert. Attrape : `127.0.0.1` par défaut, `0.0.0.0` refusé sans `--host` explicite, avertissement avec `--host`. Rate : l'ouverture effective du navigateur (`--no-open` seulement parsé).
3. **Contrat JSON** : `relief_model::contract` / `just contract` et son test de fraîcheur (`crates/relief-model/tests/contract.rs`). Attrape : `SnapshotMeta`, `FileRename`, `FormatOnlySummary` et le type d'erreur `{ code, message }` (et toute réponse d'API nouvelle) présents dans le contrat et `contract.ts` à jour ; les schémas écrits à la main de `NodeChange` et `EdgeChange` reliés à un test (validation d'un `GraphDiff` réel contre le schéma). Rate : l'usage côté UI.

## Red

- Fichiers de test : `crates/relief-server/tests/api.rs`, `crates/relief-server/tests/listen.rs`, `crates/relief-cli/tests/serve.rs`, `crates/relief-model/tests/contract_api.rs`. Cargo.toml touchés pour les tests : `relief-server` (axum, tokio, relief-* ; dev : tower, http-body-util, insta, tempfile, relief-fixtures), `relief-model` (dev : `jsonschema`).
- Lancer : `cargo test -p relief-server --test api`, `cargo test -p relief-server --test listen`, `cargo test -p relief-cli --test serve`, `cargo test -p relief-model --test contract_api`
- API publique attendue (à réutiliser côté serveur : indexeur + `diff_graphs_with_options`/`DiffOptions` ; la construction du diff de `main.rs` du CLI (renames, signatures, `attribute_edge_commits`) est à extraire dans une fonction partagée, pas dupliquée) :
  - `relief_server::{AppState, ServerOptions { cache_dir: Option<PathBuf>, range: Option<String>, ui: Ui }, Ui::{Embedded, Missing}, router(AppState) -> axum::Router}`, `AppState::open(&Path, ServerOptions) -> Result<_, ServerError>` (`ServerOptions: Default`).
  - `relief_server::{resolve_listen(Option<&str>, u16) -> Result<Listen, ListenError>, Listen { addr, warning: Option<String> }, check_bind(SocketAddr, host_explicit: bool) -> Result<(), ListenError>}`.
  - Réponses : `/api/meta` `{repo, range, branches, tags}` ; `/api/snapshot?ref=` `{graph, meta}` ; `/api/diff?range=` `{diff, renames, formatOnly}` (sans `range` : celui d'ouverture) ; `/api/code?node=&side=` en `text/plain`, lu depuis les objets git uniquement ; `/api/impact` 501 `not_implemented` ; erreurs `{code, message}` : 400 `bad_request`/`invalid_range`, 404 `not_found`/`unknown_ref`, 501 `not_implemented` ; `/api/*` inconnu : 404 JSON ; `/` sans UI : placeholder « UI not built ».
  - Contrat : `relief_model::contract::{snapshot_response_schema, diff_response_schema, meta_response_schema, api_error_schema}` écrits dans `docs/contract/{snapshot-response,diff-response,meta-response,api-error}.schema.json` ; `SnapshotMeta`, `FileRename`, `FormatOnlySummary` (à déplacer dans `relief-model` ou à exposer via des types miroirs) en `JsonSchema` ; `contract.ts` régénéré avec `SnapshotMeta`, `FileRename`, `FormatOnlySummary`, `ApiError`, `SnapshotResponse`, `DiffResponse`, `MetaResponse`.
  - Le snapshot insta `api_diff_acme` est créé au vert et relu à la main.
- En échec : 4 fichiers, tous rouges
  - `api.rs` (18 tests) — ne compile pas : `AppState`, `ServerOptions`, `Ui`, `router` absents de `relief-server`.
  - `listen.rs` (6 tests) — ne compile pas : `resolve_listen`, `check_bind` absents.
  - `serve.rs` (4 tests) — `serve_help_lists_host_port_and_no_open`, `serve_outside_a_repository_exits_with_2`, `serve_with_a_public_host_still_checks_the_repository_first`, `serve_with_an_invalid_range_exits_with_2` : sous-commande `serve` inconnue (« unrecognized subcommand »).
  - `contract_api.rs` (9 tests) — ne compile pas : `api_error_schema`, `diff_response_schema`, `meta_response_schema`, `snapshot_response_schema` absents de `relief_model::contract` (puis fraîcheur des 4 nouveaux fichiers, présence des types dans `contract.ts`, validation d'un `GraphDiff` réel contre les schémas écrits à la main de `NodeChange`/`EdgeChange`).

## Green

- Fichiers : `crates/relief-server/{Cargo.toml,build.rs,src/{lib,analysis,listen,ui}.rs,tests/snapshots/api__api_diff_acme.snap}`, `crates/relief-cli/{Cargo.toml,src/main.rs}`, `crates/relief-model/src/{api,contract,lib}.rs`, `crates/relief-model/src/bin/write-contract.rs`, `crates/relief-diff/src/lib.rs`, `crates/relief-index/src/lib.rs`, `crates/relief-git/src/lib.rs` (`branches`/`tags`), `docs/contract/*` (4 schémas + README), `web/scripts/generate-contract.mjs`, `web/src/app/core/models/contract.ts`, `justfile`, `docs/rules.md`, `Cargo.lock`
- Changement : `relief-server` expose le `Router` axum (meta, snapshot, diff, code lu dans les objets git et limité aux ids du graphe, impact 501, 404 JSON, UI embarquée via rust-embed avec placeholder), `resolve_listen`/`check_bind` et `serve` ; `relief serve` (`--host`, `--port`, `--no-open`) ajouté à la CLI. L'indexeur et la construction du diff (renames, signatures, `attribute_edge_commits`) sont extraits dans `relief_server::analysis`, utilisé par `relief diff` et le serveur. `SnapshotMeta`, `FileRename`, `FormatOnlySummary` et les réponses/erreur d'API passent dans `relief-model` (réexportés par index/diff) ; `just contract` régénéré ; `serve-acme`/`dev` lancent acme-shop (construit sous `.cache/acme-shop`, ignoré par git) sur 7878.
- Suite : cargo 320 passed, 0 failed (baseline 283/0) ; web 3 passed, 0 failed (baseline 3/0) ; lint propre.
- Review (must fix) : `docs/rules.md` documente `relief_server::analysis` comme couche d'orchestration partagée, commentaire de module aligné.
- Questions ouvertes : doc embarquée `/docs` non servie (F05) ; l'UI n'est embarquée en release que si `web/dist/relief/browser` existe au build (`just build` fait déjà l'UI avant cargo).

## Review

- Verdict (1er passage) : fix first (correctif minime, documentaire)
- Must fix :
  - `docs/rules.md` (couches, ligne « Exposition ») et `crates/relief-server/src/analysis.rs` : l'orchestration indexeur + diff partagée (renames, signatures via `TsAdapter`, `attribute_edge_commits`, résolution des deux côtés d'une plage) vit dans `relief-server`, dont `relief-cli` dépend pour `relief diff`, alors que la règle dit « Exposition : aucune logique métier ». Aucune crate existante ne convient (`relief-index` ne peut pas dépendre de `relief-diff`, les crates de requêtes pas de git). Correction retenue : assumer `relief_server::analysis` dans `docs/rules.md` comme couche d'orchestration partagée par les deux expositions.
- Consider :
  - `crates/relief-server/src/lib.rs:222-253` : `/api/code` ignore `range` (toujours la plage d'ouverture), ré-indexe et fait un `list_tree` complet par requête. Accepter `range` ou documenter ; mettre le snapshot en cache pour l'UI.
  - `crates/relief-server/src/listen.rs:39` et `relief-cli/src/main.rs` : `check_bind` ne refuse jamais rien en pratique (`resolve_listen(None, …)` rend toujours le loopback) ; le critère « 0.0.0.0 refusé sans `--host` » n'est couvert que par le test unitaire.
  - `crates/relief-server/tests/api.rs:231` : le filtre insta remplace tous les SHA par `[sha]`, le snapshot ne vérifie plus le commit attribué à chaque arête ; un test ciblé fermerait ce trou.
  - `crates/relief-server/src/lib.rs:89` : `blocking` passe `&Self` à la fermeture alors que la plupart des appelants l'ignorent.
  - `crates/relief-server/src/analysis.rs:140` : extensions `ts|tsx|mts|cts` codées en dur dans l'orchestration ; à terme, l'adapter devrait les fournir.
- Vérifié sans écart : `/api/code` ne lit que des blobs git, seulement pour les ids du graphe (`../` et `/etc/passwd` → 4xx, fichier non suivi → 404) ; pas d'`unwrap()` hors tests ; pas de secret ; 127.0.0.1 par défaut ; `.cache/` ignoré (`.gitignore:10`) ; `.claude/launch.json` (`just serve-acme`, 7878) cohérent ; contrat régénéré avec `SnapshotMeta`, `FileRename`, `FormatOnlySummary` et 4 schémas, `contract_api.rs` valide un vrai `GraphDiff` contre les schémas de `NodeChange`/`EdgeChange`.
- Vérification de l'orchestrateur (sécurité d'écoute) : sans `--host`, `resolve_listen(None, port)` rend toujours `127.0.0.1` (seule source de l'adresse : l'option `--host` de clap, aucune variable d'environnement) ; une adresse non loopback n'est possible qu'avec `--host` explicite, avec un avertissement sur stderr, et `serve` appelle `check_bind` avant tout `bind` comme garde-fou. Conforme au ticket et au spec, couvert par `tests/listen.rs` (`defaults_to_loopback_without_warning`, `an_explicit_public_host_is_accepted_with_a_warning`, `listening_on_all_interfaces_needs_an_explicit_host`). Pas de Must fix : la remarque « `check_bind` ne refuse jamais rien en pratique » reste un Consider (garde-fou redondant), pas une faille.
- Verdict final (après correction) : **ship**. Must fix appliqué par tdd-green (ligne « Orchestration » pour `relief_server::analysis` dans le tableau des couches de `docs/rules.md`, avec sa justification ; commentaire de module d'`analysis.rs` aligné, code inchangé) et revérifié par tdd-review. Consider inchangés.

## Documentation

Le ticket change ce que tape l'utilisateur (`relief serve`), mais `user-docs/` n'existe pas encore (F05). À documenter dans la page `getting-started` (FR et EN) quand F05 existera : `relief serve [range]` (plage par défaut : HEAD vers l'arbre de travail), `--port` (7878 par défaut), `--no-open`, `--host` (127.0.0.1 par défaut ; toute autre adresse rend le code du dépôt accessible depuis le réseau, avec un avertissement), le placeholder « UI not built » quand l'UI n'est pas construite, et l'API JSON sous `/api`.

## Answer

- Construit : `relief-server` expose un `Router` axum (`AppState::open`, `ServerOptions`, `Ui`, `router`) avec `GET /api/meta` (dépôt, plage, branches, tags), `/api/snapshot?ref=` (`{graph, meta}`), `/api/diff?range=` (`{diff, renames, formatOnly}`, plage d'ouverture par défaut), `/api/code?node=&side=base|head` (texte lu uniquement dans les blobs git, pour les seuls ids du graphe), `/api/impact` réservée (501 `not_implemented`), 404 JSON sous `/api/*`, erreurs `{code, message}` (400/404/501), UI embarquée par rust-embed avec placeholder « UI not built ». `resolve_listen`/`check_bind`/`serve` ; `relief serve [range] --host --port --no-open` dans la CLI. `just serve-acme` (et `dev`) lancent acme-shop sur 7878 avec `--no-open`, dépôt construit sous `.cache/acme-shop` (ignoré), cohérent avec `.claude/launch.json`.
- Décisions : l'indexeur et la construction du diff (renames, signatures, `attribute_edge_commits`) sont extraits dans `relief_server::analysis`, partagé par `relief diff` et le serveur, assumé comme couche « Orchestration » dans `docs/rules.md`. `SnapshotMeta`, `FileRename`, `FormatOnlySummary` et les réponses/erreur d'API vivent dans `relief-model` (réexportés par index et diff) ; contrat régénéré (`just contract`, 4 nouveaux schémas, `contract.ts`), schémas de `NodeChange`/`EdgeChange` validés contre un vrai `GraphDiff`. Pas de doc sous `/docs` (F05).
- Vérifié : tests `oneshot` sur acme-shop pour chaque route (snapshot insta `api_diff_acme` relu), id inconnu → 404, id forgé `../` → 4xx sans lecture disque, `listen.rs` (loopback par défaut, 0.0.0.0 seulement avec `--host`), `relief serve` en `assert_cmd` (erreurs d'usage → 2). Suite : cargo 320/0 (baseline 283/0), web 3/3, `just lint` propre. Non vérifié : ouverture réelle du navigateur.
