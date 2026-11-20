# Detector générique : n'importe quel dépôt

Status: resolved
Type: task
Blocked by: M01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : Générique)

## À faire

- `relief-detect` : trait `Detector` et `GenericDetector`.
- Système unique nommé d'après le dossier du dépôt ; modules = dossiers (hiérarchie conservée jusqu'au fichier) ; nœuds `file` avec `lang` (table d'extensions : ts, tsx, js, jsx, py, go, rs, java, kt, rb, php, cs, c, cpp, h, swift, md, json, yaml, toml, sql, css, html…).
- Exclusions par défaut (voir spec) et détection des fichiers binaires (via le lecteur de blob).
- Un dossier avec un seul enfant dossier est fusionné dans l'affichage (`src/main/java/com/acme` → un module), pour éviter des boîtes vides imbriquées.

## Critères d'acceptation

- [x] Arbre d'un projet Go factice en mémoire : snapshot `insta` des nœuds produits.
- [x] `node_modules/x.js`, `yarn.lock`, une image PNG et `dist/app.js` sont exclus.
- [x] Chaîne de dossiers à enfant unique fusionnée en un module dont le nom garde le chemin complet.

## Baseline

`just test-summary` sur `develop` (a46c056) : cargo 73 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. **API publique de `relief-detect`** : trait `Detector` et `GenericDetector`, appelés sur un arbre en mémoire (liste de chemins + lecteur de blob fourni par l'appelant, sans git), sortie = nœuds `relief-model` comparés par snapshot `insta`. Attrape : système nommé d'après le dossier du dépôt, modules = dossiers, `lang` par extension, exclusions (node_modules, lockfiles, dist, binaire détecté via le lecteur de blob), fusion des chaînes de dossiers à enfant unique. Rate : la lecture réelle d'un arbre git (couverte plus tard par l'index sur fixture).

## Red

- Fichiers de test : `crates/relief-detect/tests/generic.rs` (dev-dependencies ajoutées à `crates/relief-detect/Cargo.toml` : relief-model, insta (json), serde_json)
- Lancer : `cargo test -p relief-detect --test generic`
- Forme de l'API fixée par les tests : `use relief_detect::{Detector, GenericDetector}` ; `GenericDetector::new().detect(repo_name: &str, paths: &[&str], read_blob: &dyn Fn(&str) -> Option<Vec<u8>>) -> Vec<relief_model::Node>` (méthode du trait `Detector`). Binaire = présence d'un octet NUL via `read_blob`. Le snapshot `insta` n'existe pas encore : le green le produit, puis la review le relit.
- En échec : 8 tests (le fichier ne compile pas : `Detector` et `GenericDetector` absents de `relief_detect`)
  - go_project_produces_the_expected_nodes — snapshot des nœuds d'un projet Go
  - files_carry_a_lang_from_their_extension — `lang` par extension, `None` sans extension connue
  - default_exclusions_drop_dependencies_lockfiles_images_and_build_output — node_modules, yarn.lock, PNG, dist exclus
  - other_default_excluded_directories_are_dropped — vendor, build, target, package-lock.json, Cargo.lock
  - a_file_with_a_nul_byte_is_excluded_as_binary_through_the_blob_reader — binaire détecté via le lecteur
  - single_child_directory_chain_is_merged_into_one_module_keeping_the_full_path — un seul module `src/main/java/com/acme`
  - a_directory_with_several_children_is_not_merged — 3 modules (src, src/billing, src/catalog)
  - the_system_is_named_after_the_repository_folder — racine unique nommée d'après le dépôt

## Green

- Fichiers : crates/relief-detect/Cargo.toml, crates/relief-detect/src/lib.rs, crates/relief-detect/src/generic.rs, crates/relief-detect/tests/snapshots/generic__go_project_produces_the_expected_nodes.snap, Cargo.lock
- Changement : trait `Detector` et `GenericDetector` (système `Repo` nommé d'après le dépôt, modules = dossiers, fichiers avec `lang` par extension). Exclusions par dossier, lockfile, extension binaire et octet NUL via le lecteur de blob. Un dossier sans fichier et à enfant dossier unique n'est pas un module (le module enfant garde le chemin complet). Ids : module `pkg:<repo>/<dir>`, fichier `<parent>::file:<chemin>` ; `content_hash` = FNV-1a du blob. Snapshot insta produit et relu.
- Suite : cargo 81 passed, 0 failed (baseline 73/0) ; web 2 passed, 0 failed (baseline 2/0)
- Questions ouvertes : le modèle d'id n'a pas de segment pour un module, d'où `pkg:<repo>/<dir>` ; le hash FNV maison est à remplacer par le hash de blob git quand l'index sera branché.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `generic.rs` `lang_of` : alias `yml`, `cc/cxx/hpp` non testés ; sensible à la casse (`A.TS` → `None`) alors que les exclusions ne le sont pas.
  - `is_module` : un dossier avec des fichiers ET un seul enfant dossier reste un module, non verrouillé par un test.
  - `BINARY_SNIFF_LEN` (8000 octets) non testé ; un blob illisible (`None`) est gardé avec un hash de contenu vide.
  - Spec : « fichiers générés connus » non couverts, à ouvrir en ticket de suivi.
  - Deux boucles de remontée des ancêtres à factoriser si un second detector réutilise l'arbre de dossiers.
  - Ids de module `pkg:<repo>/<dir>` (pas de segment module dans le modèle) et hash FNV maison : à trancher avant que l'index (I01) n'en dépende.

## Documentation

Ticket interne (aucune commande, option ni écran) : la doc utilisateur ne change pas.

## Answer

- `relief-detect` expose le trait `Detector` et `GenericDetector::detect(repo_name, paths, read_blob) -> Vec<Node>` : un système nommé d'après le dossier du dépôt, des modules par dossier (chaînes de dossiers sans fichier à enfant unique fusionnées, nom = chemin complet), des fichiers avec `lang` déduit de l'extension.
- Exclusions par défaut : `node_modules/`, `vendor/`, `dist/`, `build/`, `target/`, lockfiles, extensions binaires, et tout blob contenant un octet NUL (lu par le lecteur fourni par l'appelant : le detector ne lit pas git).
- Décisions : ids de module `pkg:<repo>/<dir>` faute de segment module dans le modèle ; `content_hash` = FNV-1a du blob, provisoire jusqu'au branchement de l'index.
- Vérifié : 8 tests `cargo test -p relief-detect --test generic` dont un snapshot `insta` relu ; suite cargo 81/0, web 2/0 (baseline 73/0, 2/0) ; `just lint` propre.
