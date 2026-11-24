# K07 Fichier d'espace de travail et session multidépôt

Status: resolved
Type: task
Blocked by: K02
UI: non
Doc: docs/user `getting-started` (espace de travail)

Spec: `../spec.md` (Espace de travail)

## Comportement

- `relief-app` : `Workspace` lu et écrit dans `<nom>.relief.json` (dépôts : nom, chemin relatif au fichier, étiquettes, source et destination par défaut), données dans le `.relief/` voisin ; les `.relief/` des dépôts membres sont ignorés.
- Cas d'usage : créer un espace dans un dossier, ajouter un dépôt, retirer un dépôt, ouvrir ce dépôt comme espace, ouvrir un espace ; commandes Tauri correspondantes.
- `relief <fichier>.relief.json` (ou son dossier) ouvre l'espace.

## Critères d'acceptation

- [x] Cas d'usage sur deux dépôts de fixture : créer, ajouter, rouvrir ; le cache est dans le `.relief/` de l'espace, rien n'est écrit dans les dépôts.
- [x] Test du binaire : ouverture par le fichier et par le dossier.

## Baseline

Après K02 (`1c3253e`) : cargo 723/0 ; web 1088/0 ; e2e 187 passés, 1 ignoré.

## Seams

- **Cas d'usage `relief-app` sur deux dépôts de fixture** (`relief-fixtures`, dossier d'espace temporaire) : créer un espace dans un dossier, ajouter puis retirer un dépôt, ouvrir un dépôt comme espace, rouvrir l'espace ; le fichier `<nom>.relief.json` (nom, chemin relatif au fichier, étiquettes, source/destination par défaut) fait l'aller-retour ; le cache est dans le `.relief/` de l'espace, rien n'est écrit dans les dépôts membres (pas de `.relief/` créé ni modifié chez eux). Rate Tauri et l'UI.
- **Commandes Tauri (`tauri::test`) + test du binaire (`tests/binary.rs`)** : les commandes d'espace (créer, ajouter, retirer, ouvrir comme espace, ouvrir) ; `relief <fichier>.relief.json` et `relief <dossier de l'espace>` ouvrent l'espace (vu par `meta`, qui dit qu'il s'agit d'un espace et liste ses dépôts). Rate l'UI.

Hors périmètre : le snapshot multidépôt (K08). Les entrées de menu et d'accueil multidépôt restent désactivées jusqu'à K08, qui donne quelque chose à afficher.

## Red

- Fichiers de test : `src/app/relief-app/tests/workspace.rs`, `src/interfaces/relief-desktop/tests/workspace.rs`, `src/interfaces/relief-desktop/tests/binary.rs` (deux tests ajoutés)
- Lancer : `cargo test -p relief-app --test workspace` ; `cargo test -p relief-desktop --test workspace` ; `cargo test -p relief-desktop --test binary`
- API choisie (en tête des deux fichiers) : `Workspace { name, repos }`, `WorkspaceRepo { name, path, labels, source, destination }`, `Workspace::{create, open, locate, from_repo, add_repo, remove_repo, file, path_of}`, `Session::open_workspace`, `MetaResponse.workspace: { repos: [{ name, labels }] }` ; commandes `create_workspace`, `open_workspace`, `open_repo_as_workspace`, `add_workspace_repo`, `remove_workspace_repo` ; le `SessionOpener` reçoit aussi les chemins d'espace.
- En échec : 24 tests
  - app (13, ne compilent pas : `Workspace`, `WorkspaceRepo`, `Session::open_workspace` absents) : create_writes_an_empty_workspace_file_and_its_data_folder, add_repo_stores_a_path_relative_to_the_file_and_the_default_comparison, the_workspace_reopens_by_its_file_and_by_its_folder_with_what_was_saved, a_file_written_by_hand_keeps_its_comparison_defaults, remove_repo_drops_it_from_the_file, add_repo_refuses_a_folder_that_is_not_a_repository_and_a_name_already_taken, from_repo_makes_a_workspace_named_after_the_repository, locate_finds_the_file_from_the_file_or_its_folder, opening_a_folder_without_a_workspace_file_is_an_error, the_session_meta_says_it_is_a_workspace_and_lists_its_repositories, a_repository_session_has_no_workspace_in_its_meta, the_workspace_session_keeps_its_data_in_the_workspace_folder_and_writes_nothing_in_the_repositories, opening_a_workspace_with_a_missing_repository_is_an_error
  - desktop workspace.rs (9, ne compile pas : `Workspace`, `Session::open_workspace` absents ; commandes absentes) : create_workspace_opens_an_empty_workspace_in_the_window, add_workspace_repo_adds_the_repository_with_its_labels, remove_workspace_repo_removes_it, open_repo_as_workspace_creates_a_workspace_named_after_the_repository, open_workspace_reopens_a_workspace_by_its_file_and_by_its_folder, opening_a_workspace_adds_it_to_the_recents_by_its_file, open_workspace_on_a_folder_without_a_workspace_fails_and_keeps_the_window_as_it_was, add_workspace_repo_needs_an_open_workspace, add_workspace_repo_refuses_a_folder_that_is_not_a_repository
  - binary.rs (2, exit 2 « not a git repository ») : a_workspace_file_is_opened_as_a_workspace, a_workspace_folder_is_opened_as_a_workspace


## Green

- Fichiers : `src/app/relief-app/src/workspace.rs` (nouveau), `src/app/relief-app/src/{lib,error,data_dir}.rs`, `src/domain/relief-model/src/{api,lib}.rs`, `src/interfaces/relief-desktop/src/{lib,main}.rs`, `docs/contract/meta-response.schema.json`, `src/ui/src/app/core/models/contract.ts`, `docs/user/src/content/docs/{,en/}{getting-started,cli}.md`
- Changement : `Workspace`/`WorkspaceRepo` (fichier `<nom>.relief.json`, chemins relatifs, create/open/locate/from_repo/add_repo/remove_repo) et `Session::open_workspace` (données dans le `.relief/` de l'espace, dépôts membres vérifiés mais jamais écrits ; `snapshot`/`diff` etc. refusés par `AppError::Workspace`, code `workspace`, en attendant K08). `MetaResponse.workspace` (`WorkspaceMeta`) ajouté, contrat régénéré. Cinq commandes Tauri (`create_workspace`, `open_workspace`, `open_repo_as_workspace`, `add_workspace_repo`, `remove_workspace_repo`) ; `relief <fichier|dossier>` ouvre l'espace. Doc FR/EN : section « Espace de travail » et `cli`.
- Suite : cargo 747/0 (baseline 723/0, +24), web 1088/0 (identique) ; lint propre ; aucun fichier de test modifié.
- Questions ouvertes : aucune

## Review

Verdict : ship. Considers appliqués : plusieurs `*.relief.json` dans un dossier → erreur qui les nomme ; noms validés à l'ouverture d'un fichier écrit à la main ; un dossier d'espace dans un dépôt membre est refusé (rien n'est écrit) ; `RELIEF_CACHE_DIR` respecté pour un espace (tests `workspace_checks.rs`).

## Answer

- `relief-app` : `Workspace` / `WorkspaceRepo` dans `<nom>.relief.json` (`{ "repos": [{ name, path, labels, source, destination }] }`, chemins relatifs au fichier, absolus acceptés) ; `create`, `open`, `locate`, `from_repo`, `add_repo`, `remove_repo` ; `Session::open_workspace` garde ses données dans le `.relief/` de l'espace et n'écrit rien dans les dépôts membres.
- `MetaResponse.workspace` (`{ repos: [{ name, labels }] }`), contrat régénéré. Commandes Tauri `create_workspace`, `open_workspace`, `open_repo_as_workspace`, `add_workspace_repo`, `remove_workspace_repo` ; récents `kind: workspace`. `relief <fichier>.relief.json` ou `<dossier>` ouvre l'espace.
- Limite voulue jusqu'à K08 : sur un espace, `snapshot`, `diff` et les autres opérations git répondent l'erreur `workspace` ; les entrées UI multidépôt restent désactivées.
- Vérifié : cargo 751/0, web 1088/0, e2e 187 passés / 1 ignoré, lint propre, docs-build.
- Doc : `getting-started` (section Espace de travail) et `cli` FR/EN.
