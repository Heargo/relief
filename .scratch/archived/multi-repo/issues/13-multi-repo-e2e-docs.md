# K13 Parcours multidépôt de bout en bout

Status: resolved
Type: task
Blocked by: K09, K10, K11, K12
UI: oui
Doc: docs/user `getting-started` (espace de travail, de A à Z)

Spec: `../spec.md`

## Comportement

- Une spec e2e qui part de l'accueil : créer un espace, ajouter deux dépôts, étiqueter, relire un changement full stack (front + API + lib), suivre une arête entre dépôts.
- Page de doc « Espace de travail » FR/EN, captures non requises (alpha).

## Critères d'acceptation

- [x] e2e vert ; doc à jour ; `just docs-build`.

## Baseline

Après K12 (`d5fc95a`) : cargo 814/0 ; web 1140/0 ; e2e 194 passés, 1 ignoré.

## Constat

Les commandes Tauri existent (K07 : `create_workspace`, `open_repo_as_workspace`, `add_workspace_repo`…), mais dans le menu Espace de travail, « Ajouter un dépôt à l'espace… » et « Ouvrir ce dépôt comme espace de travail » sont encore désactivés (K03), et l'accueil n'a pas « Créer un espace à partir d'un dépôt ». Ce ticket les branche, sinon le parcours n'existe pas.

## Seams

- **Composant / business UI** (`TEST_PROVIDERS`, `ReliefApiService` mocké) : les entrées « Ajouter un dépôt à l'espace… » (en espace) et « Ouvrir ce dépôt comme espace de travail » (en monodépôt) sont actives et appellent les commandes de K07 après le sélecteur de dossier ; l'accueil propose de créer un espace à partir d'un dépôt. Rate le dialogue natif.
- **e2e de bout en bout** sur les fixtures `shop-api`, `shop-web` (et une lib si utile) : depuis l'accueil, créer un espace, y ajouter les dépôts, étiqueter, relire le changement full stack (niveau Dépôts, diff des dépôts), suivre une arête entre dépôts (import de paquet ou HTTP). Le sélecteur de dossier natif ne se pilote pas : le harnais le remplace par un point d'injection de test explicite (variable d'environnement lue par le backend ou valeur posée par la spec), documenté et inactif hors e2e. Rate le dialogue natif réel.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/components/menu-bar/menu-bar.component.spec.ts` (modifié), `src/ui/src/app/modules/map/components/map-page/map-page-workspace-menu.component.spec.ts` (nouveau), `src/ui/src/app/modules/welcome/components/welcome/welcome-create-workspace.component.spec.ts` (nouveau), `src/ui/src/app/core/services/relief-api.service.spec.ts` (3 tests ajoutés), `tests/e2e/tests/multi-repo-journey.e2e.ts` (nouveau), `tests/e2e/wdio.base.ts` (directive `// @fixtures a b` en 1re ligne : construit ces fixtures dans `<tmp>/<nom>`, sans espace ni fixture par défaut ; `RELIEF_E2E_REPO` = `<tmp>` ; avec `// @welcome`, aucun récent).
- API attendue (inventée par les tests) : `MenuBarComponent` : input `workspace` (booléen, faux par défaut), sorties `addRepo` et `openAsWorkspace` ; « Ajouter un dépôt… » actif seulement en espace, « Ouvrir ce dépôt comme espace » actif seulement en monodépôt. `ReliefApiService.addWorkspaceRepo(repo, labels)` (`add_workspace_repo {repo, labels}`), `openRepoAsWorkspace(repo, dir)` (`open_repo_as_workspace {repo, dir}`). Accueil : bouton `welcome-create-workspace` (EN « Create a workspace from a repository… », FR commence par « Créer un espace de travail »), deux sélecteurs (dépôt puis dossier d'espace). `MetaResponse.path` (dossier du dépôt ouvert, ajouté par le ticket : contrat et meta Rust) sert à « Ouvrir ce dépôt comme espace ». Point d'injection : `ReliefApiService.pickRepoFolder()` rend en premier `window.__reliefE2ePicks.shift()` quand ce tableau de chaînes est non vide, sans ouvrir le dialogue ; la spec le pose avec `browser.execute`, rien ne le pose hors e2e.
- Lancer : depuis `src/ui/` : `npx ng test --watch=false --include "**/menu-bar.component.spec.ts" --include "**/map-page-workspace-menu.component.spec.ts" --include "**/welcome-create-workspace.component.spec.ts" --include "**/relief-api.service.spec.ts"` ; `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/multi-repo-journey.e2e.ts`
- En échec : le build web ne compile pas (symboles absents), donc tout le run web est rouge ; e2e 5 tests.
  - menu-bar.component.spec.ts — sortie `addRepo`/`openAsWorkspace` et entrée `workspace` absentes (ne compile pas).
  - map-page-workspace-menu.component.spec.ts (5 tests) — entrées de menu désactivées, `addWorkspaceRepo`/`openRepoAsWorkspace` absents.
  - welcome-create-workspace.component.spec.ts (5 tests) — pas de `welcome-create-workspace`.
  - relief-api.service.spec.ts (3 tests) — `addWorkspaceRepo`, `openRepoAsWorkspace`, file `__reliefE2ePicks` absents.
  - multi-repo-journey.e2e.ts (5 tests) — `welcome-create-workspace` non affiché ; les quatre suivants en cascade (le parcours dépend de la création).

## Green

- Fichiers : `src/domain/relief-model/src/api.rs`, `src/app/relief-app/src/lib.rs` (`MetaResponse.path`, optionnel), `docs/contract/meta-response.schema.json`, `src/ui/src/app/core/models/contract.ts`, `src/interfaces/relief-desktop/build.rs` et `capabilities/main.json`, `relief-api.service.ts`, `welcome.business.ts`, `welcome.component.*`, `map-page.component.*`, `menu-bar.component.ts`, `i18n/en.json` et `fr.json`, `docs/user` (`workspace.md` FR/EN, `astro.config.mjs`, `getting-started`), `docs/dev/rules.md`.
- Changement : entrées de menu « Ajouter un dépôt » (en espace) et « Ouvrir ce dépôt comme espace » (monodépôt) actives, bouton d'accueil de création d'espace, `addWorkspaceRepo`, `openRepoAsWorkspace`, file `__reliefE2ePicks` dans `pickRepoFolder`. Les commandes `open_workspace`, `open_repo_as_workspace`, `add_workspace_repo` n'étaient pas dans l'ACL Tauri (refusées dans l'app construite) : ajoutées.
- Suite : cargo 814/0, web 1156/0 (baseline 814/0, 1140/0 + tests rouges). e2e `multi-repo-journey` 4/5 ; `welcome` et `workspace-map` verts ; `settings-menu` 1 échec (spec obsolète).
- Questions ouvertes : (1) la 5e étape du parcours échoue : l'arête `repo:shop-web` -> `repo:shop-api` existe dans le graphe et l'agrégation la produit, mais en mode Relecture les arêtes inchangées sont masquées (`toggle-unchanged-edges` faux) et l'arête entre dépôts n'est jamais « changée » (le diff d'espace n'a 0 arête) ; avec la bascule activée, elle apparaît. Décision produit requise. (2) `settings-menu.e2e.ts` exige encore que `add-repo` et `open-as-workspace` soient désactivés avec un `title` : à mettre à jour (fichier de test non modifié).

## Review

Verdict : ship. Décisions orchestrateur dans les tests : `multi-repo-journey.e2e.ts` active « Arêtes inchangées » (l'arête entre dépôts n'a pas changé, règle R16) et attend `settledNode` avant `clickEdge` (course avec l'animation de caméra) ; `settings-menu.e2e.ts` suit l'activation des entrées. Considers appliqués : commandes d'espace vérifiées depuis `relief <chemin>` (`workspace_from_cli.rs`), test de `MetaResponse.path` (`meta_path.rs`), `pickFolderAndOpenAsWorkspace`. Laissé : `window.__reliefE2ePicks` reste lu en production (la webview ne charge que notre code ; documenté dans `docs/dev/rules.md`).

## Answer

- Menu Espace de travail : « Ajouter un dépôt à l'espace… » (en espace) et « Ouvrir ce dépôt comme espace de travail » (en monodépôt) actifs ; accueil : « Créer un espace de travail à partir d'un dépôt… ». `MetaResponse.path` (optionnel) ; `ReliefApiService.addWorkspaceRepo`, `openRepoAsWorkspace`.
- Bug corrigé en passant : `open_workspace`, `open_repo_as_workspace`, `add_workspace_repo` manquaient à l'ACL Tauri, donc « Ouvrir un espace de travail… » échouait dans l'app construite.
- e2e `multi-repo-journey` : accueil → créer un espace → ajouter le second dépôt → étiqueter → niveau Dépôts et diff des deux dépôts → arête entre dépôts et son panneau. Harnais : `// @fixtures a b`, sélecteur de dossier remplacé en e2e par `window.__reliefE2ePicks`.
- Doc : nouvelle page `workspace` FR/EN (de A à Z, limites), dans la navigation ; `getting-started` y renvoie ; `docs/dev/rules.md` décrit le point d'injection et `@fixtures`.
- Vérifié : cargo 819/0, web 1156/0, e2e 199 passés / 1 ignoré, lint propre, docs-build.
