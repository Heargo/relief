# K08 Snapshot d'un espace : niveau dépôt et plage par dépôt

Status: resolved
Type: task
Blocked by: K07
UI: oui
Doc: docs/user `map` (niveau Dépôts)

Spec: `../spec.md` (Modèle et ids)

## Comportement

- Le snapshot d'un espace réunit les snapshots de ses dépôts, chacun sous un nœud `repo` (ids préfixés, K02), chacun à sa propre plage (source → destination du dépôt).
- La carte gagne un niveau **Dépôts** au-dessus de Systèmes ; boîtes de dépôt avec nom, branche et étiquettes.
- Diff, ordre de lecture et impact fonctionnent par dépôt et sur l'union.

## Critères d'acceptation

- [x] Cas d'usage sur une fixture à deux dépôts : nœuds `repo`, ids préfixés, plages distinctes.
- [x] e2e : niveau Dépôts, zoom dans un dépôt, diff des deux dépôts.
- [x] Doc FR/EN.

## Baseline

Après K07 (`7ff5cf9`) : cargo 751/0 ; web 1088/0 ; e2e 187 passés, 1 ignoré.

## Seams

- **Cas d'usage `relief-app` sur un espace de deux dépôts de fixture** : `snapshot` et `diff` d'une session d'espace (aujourd'hui refusés, erreur `workspace`) rendent l'union : un nœud `repo:<nom>` par dépôt (avec nom, branche, étiquettes), ids préfixés en dessous, chaque dépôt diffé à sa propre plage (source → destination du fichier d'espace) ; résumé de revue / ordre de lecture / impact sur l'union. Monodépôt inchangé (snapshots `insta` existants). Rate l'UI.
- **Logique de carte UI (`*.logic.ts`) / business** : un niveau **Dépôts** au-dessus de Systèmes quand le snapshot contient des nœuds `repo` (absent sinon) ; boîte de dépôt avec nom, branche, étiquettes ; zoom d'un dépôt vers ses systèmes. Rate le rendu canvas réel.
- **e2e** sur une nouvelle fixture d'espace à deux dépôts (directive de spec dédiée dans le harnais, sur le modèle de `// @fixture`) : niveau Dépôts, zoom dans un dépôt, diff des deux dépôts visible ; les entrées « Ouvrir un espace de travail… » (accueil et menu) sont activées. Rate les cas limites.

## Red

- Fichiers de test : `src/app/relief-app/tests/workspace_snapshot.rs` ; `src/ui/src/app/modules/map/helpers/repo-level.logic.spec.ts` ; `src/ui/src/app/modules/map/business/map-repo-level.business.spec.ts` ; `tests/e2e/tests/workspace-map.e2e.ts` ; modifiés : `tests/e2e/tests/welcome.e2e.ts`, `tests/e2e/tests/settings-menu.e2e.ts`, `tests/e2e/wdio.base.ts` (directive `// @workspace <nom>`), `tests/e2e/helpers/map-scene.ts` (champ `tags`). Fixtures : `tests/fixtures/shop-api/`, `tests/fixtures/shop-web/` (dépôts), `tests/fixtures/shop-space/shop.relief.json` (espace : `web` front `feat/order-badge`→`main`, `api` back `feat/order-total`→`main`).
- Lancer : `cargo test -p relief-app --test workspace_snapshot` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/repo-level.logic.spec.ts` (idem `--include src/app/modules/map/business/map-repo-level.business.spec.ts`) ; `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/workspace-map.e2e.ts` (idem `welcome`, `settings-menu`)
- Contrats choisis (à créer au vert) : en espace, `snapshot` ignore `rev` (chaque dépôt à sa `source`) ; `Node.branch?: string` et `Node.labels?: string[]` sur le nœud `repo:<nom>` (parent null ; le nœud racine des detectors passe dessous) ; `repo-level.logic.ts` (`hasRepoLevel`, `mapLevels` -> `repos|system|modules|files|symbols`, `repoBoxes`) ; `labelOf` sur ids préfixés ; `NodeContent.tags` (sub = branche) ; `MapBusiness.levels()` (le numéro de niveau = index dans `levels()`) ; scene e2e `tags`.
- En échec : 8 tests Rust, compile-fail UI (2 fichiers, ~16 tests), 4 e2e workspace-map + 1 welcome + 1 settings-menu
  - Rust `the_snapshot_has_one_repo_node_per_repository_with_its_branch_and_labels`, `every_other_id_is_prefixed_by_its_repository`, `each_repository_is_indexed_at_its_own_source`, `the_diff_unites_the_changes_of_each_repository_on_its_own_range`, `a_repository_whose_source_is_its_destination_has_no_change`, `the_reading_order_covers_the_union`, `the_impact_follows_callers_inside_a_repository_with_prefixed_ids`, `the_review_summary_is_the_one_of_the_union` — erreur `workspace` « not available on a workspace yet »
  - `repo-level.logic.spec.ts` — module `./repo-level.logic`, `Node.branch/labels`, `NodeContent.tags` absents (ne compile pas)
  - `map-repo-level.business.spec.ts` — `MapBusiness.levels` absent (ne compile pas)
  - `workspace-map.e2e.ts` (4 tests) — carte en erreur : pas de `level-0`..`level-3` (snapshot d'espace refusé)
  - `welcome.e2e.ts` — `welcome-open-workspace` désactivé ; `settings-menu.e2e.ts` — `menu-item-open-workspace` désactivé

## Green

- Fichiers : `src/app/relief-app/src/union.rs` (nouveau), `src/app/relief-app/src/lib.rs`, `src/analysis/relief-index/src/lib.rs`, `src/domain/relief-model/src/types.rs` (+ `docs/contract/*`, `contract.ts`), `src/ui/src/app/modules/map/helpers/{repo-level,layout,layout-optimize,breadcrumb,camera,visibility,node-info,node-content,map-scene}.logic.ts`, `map.business.ts`, `map-canvas.component.{ts,html}`, `map-painter.ts`, `menu-bar.component.ts`, `map-page.component.{ts,html}`, welcome (business, composant), `relief-api.service.ts`, `public/i18n/{en,fr}.json`, doc `docs/user` `map` et `getting-started` FR/EN.
- Changement : en espace, `snapshot`/`diff`/`analyse`/`review_summary`/`reading_order`/`impact` rendent l'union des dépôts sous des nœuds `repo:<nom>` (branche, étiquettes ; ids préfixés), chacun lu à sa `source` et diffé sur sa plage ; l'`Indexer` gagne des variantes `*_named_*` pour nommer la racine d'après le dossier du dépôt. UI : niveau Dépôts (`mapLevels`, `MapBusiness.levels()`, boîtes de dépôt avec branche et étiquettes, racine `repo` des detectors transparente), « Ouvrir un espace de travail… » activé (accueil, menu, récents).
- Suite : cargo 759/0 (baseline 751/0, +8) ; web 1102/0 (baseline 1088/0, +14) ; e2e : `workspace-map` 4/4, `welcome` 2/2, `settings-menu` 9/9, `map-canvas` 7/7, `navigation` 8/8, `diff-layer` 10/10 ; `just lint` propre.
- Questions ouvertes : (1) l'ajout de `Node.branch/labels` a obligé à toucher 3 tests existants (littéraux `Node` : `relief-index/tests/{entries,detectors}.rs`, `relief-diff/tests/impact_externals.rs`, deux lignes `branch/labels: None`) et à changer 2 specs UI devenues fausses (`welcome.component.spec.ts`, `menu-bar.component.spec.ts` : entrée « Ouvrir un espace » désormais active) ; `git diff --name-only` liste donc ces 5 fichiers de test. (2) Niveaux d'un espace : Dépôts et Systèmes s'ouvrent ensemble au niveau 1 (imposé par `map-repo-level.business.spec.ts`), le niveau 4 est un cran de zoom de plus ; pas de touche `4` (le spec des raccourcis l'interdit). (3) Le résumé de revue d'un espace n'évalue pas encore les violations de règles (`relief.config.yaml` par dépôt).

## Review

- Verdict : fix first
- Must fix : `src/app/relief-app/src/union.rs:~195` (`diff.files.extend(... .cloned())`) et `renames` non préfixés — deux dépôts avec le même chemin (`src/index.ts`) : `diff-panel.logic.ts:36,58` (`files.find(f => f.path === path)`) renvoie toujours le fichier du premier dépôt (comptes de lignes faux), `diff-layer.logic.ts:104,186` (map chemin → lignes, `touched`/`renamed` par chemin) écrasent ou confondent les deux ; les totaux (`files`, lignes ajoutées/retirées) restent justes, la liste des fichiers montre deux entrées indiscernables. L'état « vu » et l'ordre de lecture passent par les ids préfixés : non touchés. Correction : préfixer `FileChange.path` et `FileRename` par le dépôt (et chercher les nœuds par `path` préfixé côté UI), ou clé (dépôt, chemin) ; ajouter un cas à `workspace_snapshot.rs` avec un chemin commun aux deux dépôts de fixture.
- Consider : (1) `union.rs:12-20` — `prefixed` avale l'erreur de `in_repo` (`unwrap_or_else(clone)`) : un id non préfixé peut entrer en silence ; remonter l'erreur. (2) `union.rs:unite` — tuples `(Node, &str, GraphSnapshot)` : obsession des primitives, un petit struct `RepoPart` clarifierait ; `repo_node` est recalculé par côté dans `workspace_analysis`. (3) Violations de règles non évaluées en espace (question c) : acceptable pour K08 (hors critères), mais le dire dans `docs/user` `rules`/`map` pour ne pas laisser croire à une revue complète, et ouvrir un ticket. (4) Niveau 4 = simple cran de zoom (question d) : conforme au spec de test et documenté (« boutons seulement ») ; OK. (5) Tests adaptés (a) : les 3 littéraux `Node` sont de simples `branch/labels: None` et les 2 specs UI traduisent bien le changement voulu (entrée active) : légitimes. (6) Monodépôt : `snapshot`/`analyse_range` refactorés sans changement de chemin, nom de racine inchangé hors espace, champs `branch/labels` omis à la sérialisation : strictement inchangé (non exécuté).

## Suite de la review

Must fix corrigé : en espace, `FileChange.path` et `FileRename` sont préfixés `repo:<nom>/` et `relief-diff` compare par `NodeId::repo_file_path()` (test `workspace_common_path.rs` : un chemin commun aux deux dépôts donne deux fichiers et deux entrées de lecture). Considers appliqués : erreur de `in_repo` remontée, struct `Part`, limite des règles documentée (ticket de suivi K14). Après captures : en-tête d'espace (nom puis dépôts et branches), comparaison unique masquée en espace (K10), fichiers affichés `api · src/orders.ts`.

## Answer

- Cœur : en espace, `snapshot` (chaque dépôt à sa source), `diff`, `analyse`, `review_summary`, `reading_order`, `impact` rendent l'union sous des nœuds `repo:<nom>` (`branch`, `labels`), ids préfixés, chaque dépôt diffé sur sa plage. `Node` gagne `branch`/`labels` (omis en monodépôt), contrat régénéré.
- UI : niveau Dépôts (0 · Dépôts … 4 · Symboles) en espace seulement, boîtes de dépôt avec branche et étiquettes, zoom vers les systèmes ; « Ouvrir un espace de travail… » activé (accueil, menu, récents) ; en-tête d'espace et libellés `dépôt · chemin`.
- Fixtures `tests/fixtures/shop-api`, `shop-web`, `shop-space` (réutilisables par K11/K12) ; directive e2e `// @workspace <nom>`.
- Limites : règles d'architecture non évaluées en espace (K14) ; la comparaison par dépôt arrive en K10.
- Vérifié : cargo 760/0, web 1109/0, e2e 191 passés / 1 ignoré, lint propre, captures relues (FR/EN, 1280/1024).
- Doc : `map`, `getting-started` FR/EN (texte seulement).
