# R17 Les tests comme calque repliable

Status: resolved
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `review` (calques)

Spec: `../spec.md` (Phase 14)

## Constat

Dans beaucoup de PR, le gros des arêtes vient des tests. On relit d'abord le code ; les lignes test → code noient la carte.

## Comportement

- Un fichier est un **test** s'il est sous un dossier `test`, `tests`, `__tests__`, `e2e`, `spec`, ou s'il se nomme `*.test.*`, `*.spec.*`, `*.e2e.*` (règle dans le cœur, exposée par nœud : `isTest`, et pour un module ou package qui ne contient que des tests).
- Calque « Tests » dans la section Affichage, replié par défaut : les arêtes dont la source est un test ne sont pas tracées ; leur cible porte un badge « testé par N » (« dont M nouveaux » en relecture). Les boîtes de test restent sur la carte, atténuées.
- Cliquer le badge, ou sélectionner un nœud de test, déplie ses arêtes. Déplier le calque trace tout comme avant.

## Critères d'acceptation

- [x] Cœur : `isTest` sur les nœuds fichier (fixture avec les variantes de nom), dans le contrat JSON.
- [x] Logique : arêtes repliées et badges calculés à partir des arêtes et d'`isTest`.
- [x] e2e : une fixture avec un dossier `tests/` ; calque replié par défaut, badge sur la cible, déplié au clic.
- [x] Doc `review` FR/EN.

## Baseline

`3796951` (develop) : cargo 660 ; web 898 ; e2e 163 passés / 1 ignoré.

## Seams

- **Cœur (`relief-detect` ou `relief-index`, fixture `relief-fixtures`)** : `is_test` sur les nœuds fichier selon la règle du ticket (dossiers `test`, `tests`, `__tests__`, `e2e`, `spec` ; noms `*.test.*`, `*.spec.*`, `*.e2e.*`), sérialisé dans le contrat (`isTest`), types TS régénérés (`just contract`). Attrape la règle ; rate l'UI.
- **Logique UI (`*.logic.ts`, Vitest)** : à partir des arêtes et d'`isTest`, arêtes dont la source est un test repliées (sauf nœud de test sélectionné ou cible dépliée) et badges « testé par N (dont M nouveaux) » sur les cibles. Attrape le repli ; rate le rendu.
- **e2e (fixture avec un dossier `tests/`)** : calque Tests replié par défaut (aucune arête test → code dans la scène, badge sur la cible), dépliage au clic du badge, calque déplié = tout. Attrape le parcours.

## Green

- Fichiers : `src/domain/relief-model/src/types.rs` (+ `testing.rs`, littéraux `Node` des lang/index/detect), `src/analysis/relief-detect/src/{generic,workspaces,pyproject}.rs`, `docs/contract/*`, `contract.ts`, `src/ui/.../map/helpers/{test-edges.logic,external.logic,map-scene.logic}.ts`, `map.business.ts`, `map-canvas.component.{ts,html,scss}`, `map-painter.ts`, `map-page.component.html`, `layers-section.component.ts`, `i18n/{en,fr}.json`, `docs/user/.../review.md` FR/EN, snapshot insta `workspace_modules__acme_shop_workspace_nodes_snapshot.snap`.
- Changement : `Node.is_test` (`isTest`, omis si faux) posé par `mark_tests` dans les trois detectors (dossier ou nom de test, puis conteneurs ne contenant que des tests) ; `foldTestEdges` replie les arêtes dont la source est un test, calcule les badges ; `MapBusiness` l'applique après le filtre « inchangées » (préférence `relief.testEdges`, dépliage par badge), la scène expose `test` et `testedBy`, badge DOM `tested-by-badge`, interrupteur `toggle-test-edges`, boîtes de test atténuées.
- Suite : cargo 665 réussis / 0 échoué (baseline 660) ; web 911 / 0 (898) ; lint propre, build ok, `just docs-build` ok ; e2e complet 50 specs sur 51 passent, 1 échec : `tests-layer.e2e.ts` « is collapsed by default » (les 3 autres cas passent).
- Questions ouvertes : (1) le premier cas e2e est une course : `waitForScene(edges > 0)` est satisfait dès l'état de niveau 1 (5 arêtes entre packages) et `sceneNode(payment.spec.ts)` est lu avant la fin de la transition (~480 ms) ; indépendant de mon code, la spec doit attendre le nœud ou le badge. (2) Les littéraux `Node { .. }` de `relief-index/tests/{detectors,entries}.rs` et `relief-diff/tests/impact_externals.rs` reçoivent `is_test: false` (champ obligatoire), donc apparaissent dans `git diff --name-only` ; aucune spec e2e existante n'a cassé.

## Review

- Verdict : fix first
- Must fix : map.business.ts (`testFold` sur `shownEdges`) — en relecture, le filtre « inchangées » retire les arêtes de test non modifiées avant le repli : le badge « testé par N » sous-compte (N = nouveaux) et n'apparaît pas sur une cible dont les tests n'ont pas bougé ; le ticket veut N total et « dont M nouveaux » — calculer les badges sur `allEdges()` (avant le filtre), replier ensuite ; ajouter un test Vitest/business sur ce cas. L'e2e passe `unchangedEdges: true` et masque ce défaut.
- Consider : generic.rs:is_test_path — tout composant de dossier `spec`/`test`/`e2e` suffit, y compris `docs/spec/*.md` ; acceptable (règle du ticket) mais à noter. | pyproject.rs — `mark_tests` appelé sans test dédié (seuls generic et workspaces/acme sont couverts). | test-edges.logic.ts — « M nouveaux » compte les tests ayant une arête modifiée, pas les fichiers de test ajoutés ; un test ajouté dont la cible est hors écran n'a aucun signal que sa boîte atténuée (alpha 0,55 cumulé aux couleurs du diff). | e2e : la spec tourne sur acme-shop, pas sur la fixture `test-files/tests/` prévue au ticket. | i18n : « testé par N (M nouveaux) » au lieu de « dont M nouveaux ».

## Answer

- Cœur : `Node.is_test` (JSON `isTest`, omis quand faux) posé par `mark_tests` (helper unique de `relief-detect`) : dossiers `test`, `tests`, `__tests__`, `e2e`, `spec`, noms `*.test.*`, `*.spec.*`, `*.e2e.*` ; un module ou package qui ne contient que des tests l'est aussi. Contrat régénéré ; snapshot d'acme-shop : `isTest` sur les fichiers `*.spec.*`.
- UI : calque « Tests » (section Affichage, replié par défaut, `relief.testEdges`). Replié, les arêtes qui partent d'un test ne sont pas tracées ; leur cible porte un badge « testé par N, dont M nouveaux » ; un clic sur le badge ou la sélection d'un test déplie ses arêtes. Boîtes de test atténuées.
- Review : fix first (badges calculés après le filtre des arêtes inchangées, donc sous-comptés en relecture), corrigé : badges sur toutes les arêtes, puis repli. Test ajouté.
- Vérifié : cargo 665, Vitest 913 ; e2e 167 passés / 1 ignoré ; `just lint` ; doc `review` FR/EN.
- Écarts notés : l'e2e tourne sur acme-shop (`payment.spec.ts`) plutôt que sur une fixture avec `tests/` (la fixture `test-files` sert au test du cœur) ; un dossier `spec/` de documentation compte comme test (règle du ticket).
