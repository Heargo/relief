# Detector npm, pnpm et yarn workspaces

Status: resolved
Type: task
Blocked by: D01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : workspaces)

## À faire

- Reconnaît `pnpm-workspace.yaml` ou un champ `workspaces` dans le `package.json` racine (globs) ; un système par package trouvé.
- `kind` : `service` pour un package sous `apps/` ou qui a un script `start`/`dev`, sinon `package` ; `subkind` d'après les dépendances (`react` → `react-app`, `fastify`/`express` → `http-server`, sinon `library`).
- Arêtes `depends_on` entre packages du workspace (dependencies, devDependencies, peerDependencies) ; un nœud `external` par dépendance externe, rattaché à un groupe « dépendances externes ».
- Expose aux adapters la table `nom de package → dossier` (servira à T02 pour résoudre `@acme/shared/money`).
- Repli sur le générique si les globs ne trouvent rien.

## Critères d'acceptation

- [ ] Sur acme-shop (`main`) : 4 systèmes (`apps/web` service react-app, `apps/api` service http-server, `packages/shared`, `packages/db`) et les arêtes `depends_on` attendues (littérales dans le test).
- [ ] Un monorepo `workspaces` yarn en mémoire est reconnu de la même façon.
- [ ] Un `package.json` invalide donne un avertissement dans `meta.warnings` du snapshot, pas une erreur fatale.

## Baseline

`just test-summary` sur `develop` (f1ef34e) : cargo 93 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. **API publique de `relief-detect`** (detector workspaces / détection en chaîne, sur une liste de chemins et un lecteur de blob en mémoire) : attrape la reconnaissance pnpm/yarn/npm, un système par package, `kind`/`subkind`, arêtes `depends_on`, nœuds `external` groupés, la table `nom de package → dossier`, le repli générique quand les globs ne trouvent rien, et l'avertissement (non fatal) sur un `package.json` invalide. Rate la lecture git réelle et la propagation dans le snapshot.
2. **`relief-index` sur un dépôt de fixture** (`relief-fixtures` : acme-shop `main`, plus une fixture avec un `package.json` invalide) : attrape le chemin complet git → detector → snapshot, les 4 systèmes et arêtes `depends_on` littérales d'acme-shop, et l'avertissement dans `meta.warnings`. Rate les cas limites de globs (couverts par le seam 1).

UI : non. Doc utilisateur : aucune (ticket interne au moteur ; `Doc: aucune`).

## Red

- Fichiers de test : `crates/relief-detect/tests/workspaces.rs`, `crates/relief-index/tests/snapshot.rs` (2 tests ajoutés). Fixtures : `package.json` de `fixtures/acme-shop/base/` enrichis (deps, scripts) ; nouvelle fixture `fixtures/bad-package-json/` (un package valide `@bad/ok`, un `package.json` invalide sous `packages/broken`).
- Lancer : `cargo test -p relief-detect --test workspaces` ; `cargo test -p relief-index --test snapshot`
- API supposée (à créer) : `relief_detect::detect(repo_name, &[&str], &dyn Fn(&str)->Option<Vec<u8>>) -> Detection` avec `nodes: Vec<Node>`, `edges: Vec<Edge>`, `warnings: Vec<String>`, `package_dirs: BTreeMap<String,String>` (nom → dossier), `detector: String|&str` (`"workspaces"` ou `"generic"`). Ids : système `pkg:@acme/web` (parent = repo), externe `pkg:external/react`, groupe `pkg:external` (kind `module`). Avertissement contenant le chemin du `package.json`. `Indexer::new` doit utiliser cette chaîne (`meta.detector == "workspaces"`, `meta.warnings` rempli, arêtes `depends_on` dans le graphe).
- En échec : 12 tests
  - relief-detect/workspaces.rs (10 tests, le fichier ne compile pas, `Detection` et `detect` n'existent pas dans `relief_detect`) : pnpm_workspace_yields_one_system_per_package, workspace_edges_follow_all_three_dependency_fields, external_dependencies_are_external_nodes_under_one_group, pnpm_workspace_edges_are_between_workspace_packages, package_names_map_to_their_directories, yarn_workspaces_array_is_recognised, yarn_workspaces_object_form_is_recognised, start_or_dev_script_makes_a_service_outside_apps, globs_matching_nothing_fall_back_to_the_generic_detector, invalid_package_json_is_a_warning_not_an_error — erreur de compilation (symboles manquants)
  - relief-index/snapshot.rs : acme_shop_main_has_four_systems_and_their_dependencies — aucun système service/package (detector générique seul) ; invalid_package_json_surfaces_in_meta_warnings — aucun avertissement dans `meta.warnings`

## Green

- Fichiers : `crates/relief-detect/src/workspaces.rs` (nouveau), `crates/relief-detect/src/lib.rs`, `crates/relief-detect/src/generic.rs` (helpers en `pub(crate)`), `crates/relief-detect/Cargo.toml` (serde_json), `crates/relief-index/src/lib.rs`
- Changement : `relief_detect::detect` chaîne workspaces (pnpm-workspace.yaml ou `workspaces` du package.json, globs `*`/`**`) puis repli générique ; un système par package, kind/subkind, arêtes `depends_on`, externes groupés sous `pkg:external`, `package_dirs`, avertissements non fatals. `Indexer` utilise cette chaîne et remplit `meta.detector`/`meta.warnings`.
- Suite : cargo 105 passed, 0 failed (baseline 93/0) ; web 2 passed, 0 failed ; lint propre.
- Questions ouvertes : aucune

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `workspaces.rs` : deux packages de même `name`, le second est ignoré sans avertissement ; pousser un warning de doublon.
  - `workspaces.rs` : `detect_workspaces` (~150 lignes) mêle manifests, nœuds, arêtes, externes et fichiers ; à scinder (`build_edges`, `assign_files`).
  - `Detection.detector: String`, `kind`/`subkind` en `&str` : un enum ou des constantes éviteraient les fautes de frappe (`"external-group"` est un littéral isolé).
  - `relief-index` : `detection.package_dirs` est calculé puis jeté ; T02 doit le brancher.
  - `relief-detect/Cargo.toml` : ligne vide en fin de fichier.
  - Le trait `Detector` ne sert plus qu'au générique.

## Documentation

Aucune : ticket interne au moteur de détection (`Doc: aucune`), pas de commande ni d'écran nouveau.

## Answer

- Construit : `relief_detect::detect(repo, chemins, lecteur de blob) -> Detection` chaîne le detector workspaces (`pnpm-workspace.yaml`, ou champ `workspaces` du `package.json` racine en tableau ou objet, globs `*`/`**`) puis le générique en repli. Un système `pkg:<name>` par package ; `service` sous `apps/` ou avec script `start`/`dev`, sinon `package` ; subkind `react-app` / `http-server` / `library`. Arêtes `depends_on` depuis dependencies, devDependencies et peerDependencies ; externes `pkg:external/<nom>` sous le groupe `pkg:external`. Table `package_dirs` (nom → dossier) exposée pour T02. Un `package.json` illisible donne un avertissement non fatal.
- `Indexer` passe par cette chaîne et remplit `meta.detector` et `meta.warnings`.
- Fixtures : `package.json` d'acme-shop enrichis (dépendances, scripts) ; nouvelle fixture `bad-package-json`.
- Vérifié : 10 tests `relief-detect/tests/workspaces.rs` (mémoire), 2 tests `relief-index/tests/snapshot.rs` (acme-shop `main` : 4 systèmes et arêtes littérales ; `meta.warnings`), `just lint` propre, `just test-summary` sans régression.
