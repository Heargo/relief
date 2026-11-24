# K10 Comparaison par dépôt dans le panneau gauche

Status: resolved
Type: task
Blocked by: K05, K08
UI: oui
Doc: docs/user `review`

Spec: `../spec.md` (Interface)

## Comportement

- En multidépôt, sous la bascule de mode, un bouton « Comparaisons par dépôt » transforme le panneau gauche en un menu : une ligne source → destination par dépôt (K05), avec un bouton retour vers le panneau normal.
- Changer la comparaison d'un dépôt recharge seulement ce dépôt.

## Critères d'acceptation

- [x] e2e sur la fixture à deux dépôts : ouvrir le menu, changer la source d'un dépôt, revenir ; la carte suit.
- [x] Doc FR/EN.

## Baseline

Après K09 (`50201d2`) : cargo 772/0 ; web 1132/0 ; e2e 192 passés, 1 ignoré.

## Contexte

K05 a fait la sélection source → destination (monodépôt, `Settings`, `.relief/settings.json`). K08 a masqué `compare-section` en espace et diffe chaque dépôt sur la source/destination de son entrée dans le fichier d'espace. Ici : choisir la comparaison de chaque dépôt.

## Seams

- **Cas d'usage `relief-app` + commande Tauri sur `shop-space`** : changer la source/destination d'un dépôt de l'espace (en session, et « par défaut » = écrit dans le fichier d'espace) ; le diff de l'union suit ; seul ce dépôt est relu (les autres parties de l'union sont réutilisées, vérifiable par leur résultat inchangé et, si le code le permet, sans réindexation). Rate l'UI.
- **Composant / business UI** (`TEST_PROVIDERS`, `ReliefApiService` mocké) : en espace et en relecture, un bouton « Comparaisons par dépôt » sous la bascule ; il remplace le panneau gauche par une ligne source → destination par dépôt (sélecteur de K05 réutilisé) et un bouton retour ; changer une ligne appelle l'API pour ce dépôt seulement. Absent en monodépôt. Rate le canvas.
- **e2e `shop-space`** : ouvrir le menu, changer la source d'un dépôt, revenir ; la carte suit (fichiers modifiés de ce dépôt changent, l'autre dépôt inchangé).

## Red

- Fichiers de test : `src/app/relief-app/tests/workspace_comparison.rs`, `src/interfaces/relief-desktop/tests/workspace_comparison.rs`, `src/ui/src/app/modules/map/components/map-page/map-page-repo-comparisons.component.spec.ts`, `tests/e2e/tests/repo-comparisons.e2e.ts`
- Lancer :
  - `cargo test -p relief-app --test workspace_comparison`
  - `cargo test -p relief-desktop --test workspace_comparison`
  - `cd src/ui && npx ng test --watch=false --include src/app/modules/map/components/map-page/map-page-repo-comparisons.component.spec.ts`
  - `cd tests/e2e && timeout 550 xvfb-run -a npx wdio run wdio.conf.ts --spec tests/repo-comparisons.e2e.ts`
- API attendue : `Workspace::set_comparison(&mut self, repo, source, destination)` ; `Session::repo_comparisons() -> Vec<RepoComparison { name, source, destination, branches }>` ; `Session::set_repo_comparison(&self, repo, source, destination, save: bool)` (changement de session, écrit le fichier si `save`, relit seulement ce dépôt) ; commandes `workspace_comparisons {}` et `set_workspace_repo_comparison { name, source, destination, save }` (renvoient la liste, `bad_request` en monodépôt) ; `ReliefApiService.workspaceComparisons()` et `setRepoComparison(name, source, destination, save)` ; test ids `repo-comparisons-button`, `repo-comparisons-menu`, `repo-comparisons-back`, `repo-comparison`, `repo-comparison-name|source|merged-into|destination|default`.
- En échec : 22 tests
  - relief-app (7) : `the_comparisons_list_each_repository_with_its_sides_and_branches`, `changing_a_comparison_in_session_moves_the_diff_and_leaves_the_file_alone`, `saving_a_comparison_writes_it_in_the_workspace_file_for_the_next_session`, `only_the_changed_repository_is_read_again`, `an_unknown_repository_is_refused_and_changes_nothing`, `a_single_repository_session_has_no_repository_comparison`, `set_comparison_on_the_workspace_writes_one_repository_and_keeps_the_rest` — ne compilent pas : `repo_comparisons`, `set_repo_comparison`, `Workspace::set_comparison` absents
  - relief-desktop (5) : `workspace_comparisons_lists_each_repository_with_its_sides`, `a_change_in_session_moves_the_diff_and_leaves_the_file_alone`, `saving_writes_the_comparison_in_the_workspace_file`, `an_unknown_repository_fails_and_changes_nothing`, `the_comparison_commands_need_an_open_workspace` — commandes inconnues
  - web (8) : offre le bouton sous la bascule ; absent en monodépôt / présent en espace ; menu à une ligne par dépôt ; changer la source d'un dépôt ; changer la destination ; « Set as default » ; retour au panneau normal ; absent en mode explorer — `repo-comparisons-button` et le menu n'existent pas
  - e2e (2) : `changes the source of one repository from the menu, and the map follows`, `sets a repository comparison as its default in the workspace file` — `repo-comparisons-button` introuvable

## Green

- Fichiers : `src/domain/relief-model/src/{api,lib,contract}.rs`, `src/domain/relief-model/src/bin/write-contract.rs`, `docs/contract/repo-comparison.schema.json`, `src/ui/src/app/core/models/contract.ts`, `src/ui/scripts/generate-contract.mjs`, `src/app/relief-app/src/{lib,union,workspace}.rs`, `src/interfaces/relief-desktop/{build.rs,capabilities/main.json,src/lib.rs,permissions/autogenerated/*}`, `src/ui/src/app/core/services/relief-api.service.ts`, `src/ui/src/app/modules/map/{business/repo-comparisons.business.ts,helpers/repo-comparisons.logic.ts,components/repo-comparisons/*,components/map-page/map-page.component.{html,ts}}`, `src/ui/public/i18n/{en,fr}.json`, `docs/user/src/content/docs/{review,en/review}.md`
- Changement : `Workspace::set_comparison` (champs inconnus conservés) ; `Session` garde les comparaisons de session par dépôt (`Mutex`), `repo_comparisons` / `set_repo_comparison` (réf validées avant tout changement, fichier écrit si `save`) ; commandes `workspace_comparisons` et `set_workspace_repo_comparison` (`bad_request` en monodépôt, permissions Tauri ajoutées). UI : `RepoComparisonsBusiness` + `app-repo-comparisons` remplacent le panneau gauche ; le menu réutilise les helpers et textes du sélecteur K05 (`shortcutRefs`, `filterRefs`, `review.rangePicker.*`), mais pas le composant `app-range-picker`, lié au singleton `RangePickerBusiness` et aux ids `compare-*`.
- Suite : cargo 784/0 (baseline 772/0), web 1140/0 (baseline 1132/0) ; e2e `repo-comparisons` 2/2, `workspace-map` 4/4, `pr-comparison` 3/3 ; `just lint` propre ; aucun fichier de test modifié.
- Questions ouvertes : aucune

## Review

Verdict : ship. Considers appliqués : verrou empoisonné → `AppError::Workspace` ; dépôt illisible → `RepoComparison.error` affiché sous sa ligne, le menu reste utilisable (`workspace_comparison_unreadable.rs`). Laissé : deux enregistrements simultanés du fichier d'espace ne sont pas sérialisés (risque faible en mono-fenêtre) ; le popover est recâblé à côté de `app-range-picker` (lié à un singleton), helpers et textes partagés.

## Answer

- Cœur : `Workspace::set_comparison` (champs inconnus conservés), `Session::repo_comparisons` / `set_repo_comparison(repo, source, destination, save)` : comparaison de session par dépôt, écrite dans le fichier d'espace si `save` ; seul le dépôt changé est relu. Commandes `workspace_comparisons`, `set_workspace_repo_comparison` (ACL), `bad_request` en monodépôt. Contrat `RepoComparison`.
- UI : en espace et en relecture, « Comparaisons par dépôt » remplace le panneau gauche par une ligne source → fusionnée dans → destination par dépôt, avec « Définir par défaut » et « Retour au panneau ».
- Vérifié : cargo 785/0, web 1140/0, e2e 194 passés / 1 ignoré, lint propre, captures FR/EN relues.
- Doc : `review` FR/EN (texte seulement).
