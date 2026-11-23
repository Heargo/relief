# R18 Changements répétitifs dans la relecture

Status: resolved
Type: task
Blocked by: E08
UI: oui
Doc: docs/user `review` (vue d'ensemble)

Spec: `../spec.md` (Phase 14)

## Comportement

- Vue d'ensemble de la PR : une ligne par groupe de E08, « 28 fichiers : <résumé> », dépliable sur la liste des membres.
- Carte : le représentant est normal ; les autres membres sont atténués et portent « ×N identiques » sur le représentant ; leurs arêtes du diff sont repliées dans celles du représentant (compteur).
- Ordre de lecture : le groupe est une seule entrée ; marquer « vu » le représentant propose de marquer tout le groupe.
- Sélectionner un membre le déplie (ses arêtes, son badge normal).

## Critères d'acceptation

- [x] e2e sur la fixture de E08 : une ligne de groupe dans la vue d'ensemble, une entrée dans l'ordre de lecture, membres atténués sur la carte, « vu » sur tout le groupe.
- [x] Doc `review` FR/EN.

## Baseline

`1dea04c` (develop) : cargo 682 ; web 913 ; e2e 167 passés / 1 ignoré.

## Seams

- **Logique UI (`*.logic.ts`, Vitest)** : formatage d'un résumé (`RepeatedChangeItem[]` → texte traduit), membres atténués et compteur « ×N » à partir de `repeated`, regroupement des entrées de l'ordre de lecture. Attrape la règle ; rate le rendu.
- **Business / composants (TestBed, `ReliefApiService` mocké)** : la vue d'ensemble affiche une ligne par groupe ; « vu » sur le représentant propose de marquer le groupe. Attrape le câblage.
- **e2e (fixture `repeated-imports` de E08, plage `main...feat/migration`)** : ligne de groupe dans la vue d'ensemble, une entrée dans l'ordre de lecture, membres atténués dans la scène, « vu » sur tout le groupe. Attrape le parcours.

## Red

- Fichiers de test : `src/ui/src/app/modules/review/helpers/repeated-changes.logic.spec.ts`, `src/ui/src/app/modules/map/helpers/map-scene-repeated.logic.spec.ts`, `src/ui/src/app/modules/review/business/reading-order.business.spec.ts` (nouveau `describe`), `src/ui/src/app/modules/review/components/structural-overview/structural-overview-repeated.component.spec.ts`, `src/ui/src/app/modules/review/components/reading-order-section/reading-order-section-repeated.component.spec.ts`, `tests/e2e/tests/repeated-changes.e2e.ts` (+ champ `repeated` dans `tests/e2e/helpers/map-scene.ts`)
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/review/helpers/repeated-changes.logic.spec.ts --include src/app/modules/map/helpers/map-scene-repeated.logic.spec.ts --include src/app/modules/review/business/reading-order.business.spec.ts --include src/app/modules/review/components/structural-overview/structural-overview-repeated.component.spec.ts --include src/app/modules/review/components/reading-order-section/reading-order-section-repeated.component.spec.ts` ; e2e : `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/repeated-changes.e2e.ts`
- Rouge par erreur de compilation (symboles manquants : `./repeated-changes.logic`, `ReadingOrderBusiness.setRepeated/groupOf/markGroup`, `ReadingOrderSectionComponent.groupMark`, `SceneNode.repeated`, `MapSceneInput.repeated`).
- Contrat pour green :
  - `review/helpers/repeated-changes.logic.ts` : `repeatedSummary(items, t)`, `repeatedNodes(repeated?, selected) -> { counts: Map<rep, N>, faded: Set }`, `foldRepeatedEdges(edges, repeated?, selected)` (arêtes `changed` des membres atténués repliées sur le représentant, `count` sommé, ordre rep d'abord), `collapseRepeated(items, repeated?)`, `groupProposal(repeated?, seen, id) -> string[] | null`.
  - Clés i18n : `review.repeated.items.{edge_added,edge_removed,symbol_added,symbol_removed}` (params `{kind, target}` ou `{name}`, `target` = `nodeLabel`), ligne de vue d'ensemble EN « 4 files: … » / FR « 4 fichiers : … ».
  - Scène : `MapSceneInput.repeated?: { counts, faded }` ; `SceneNode.repeated: { count } | null` ; `faded` vrai pour les membres atténués (en plus du focus).
  - Business : `ReadingOrderBusiness.setRepeated(groups)`, `groupOf(id)`, `markGroup(id)` ; `ids()`/`items()` en mode fichier : un seul élément par groupe, `progress` compte le groupe une fois.
  - Vue d'ensemble : `overview-group[data-group="repeated"]`, `overview-row[data-repeated=<rep>]`, `repeated-members-toggle` (`aria-expanded`), `repeated-member[data-node-id]` (clic sélectionne).
  - Ordre de lecture : input `repeated`, output `groupMark`, `data-group-size` + « ×N » sur la ligne du représentant, `reading-group-prompt` et `reading-group-mark` quand le représentant est vu et des membres ne le sont pas.

## Green

- Fichiers : `src/ui/src/app/modules/review/helpers/repeated-changes.logic.ts` (nouveau), `review/business/reading-order.business.ts`, `review/components/{reading-order-section,structural-overview}/*`, `map/helpers/map-scene.logic.ts`, `map/business/map.business.ts`, `map/components/map-canvas/{map-canvas.component.ts,map-painter.ts}`, `map/components/map-page/map-page.component.{ts,html}`, `src/ui/public/i18n/{en,fr}.json`, `docs/user/src/content/docs/{,en/}review.md`
- Changement : logique pure (résumé, `repeatedNodes`, `foldRepeatedEdges`, `collapseRepeated`, `groupProposal`) ; `ReadingOrderBusiness.setRepeated/groupOf/markGroup` (une entrée par groupe) ; scène `repeated`/`faded` + pastille « ×N identiques » ; arêtes des membres atténués repliées dans `MapBusiness.edges` (le membre sélectionné se déplie) ; ligne de groupe dépliable dans la vue d'ensemble ; invite « marquer le groupe » dans l'ordre de lecture ; câblage `map-page` ; i18n EN/FR ; doc `review` FR/EN (`just docs-build` OK).
- Suite : cargo 682/0 (baseline 682) ; web 942 réussis / 1 échoué sur 943 (baseline 913, +30 nouveaux) ; e2e repeated-changes 4/4, reading-order 3/3, structural-overview OK ; `just lint` propre ; `just build` OK ; aucun fichier de test non indexé modifié.
- Questions ouvertes : le test `structural-overview-repeated.component.spec.ts` > « has no group without repeated changes » est faux : il appelle `render()` deux fois dans le même `it`, donc `TestBed.configureTestingModule` lève « already instantiated » quelle que soit l'implémentation. À corriger côté red (par exemple deux `it`, ou `TestBed.resetTestingModule()` entre les deux). Le comportement testé (pas de groupe sans `repeated`) est implémenté.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - map.business.ts:218 — le signal `_repeated` s'est glissé sous le commentaire de `_testIds` ("The nodes the core flags as tests…") — remettre le commentaire sur `_testIds`.
  - map.business.ts:470 / map-canvas.component.ts:390 — « sélectionné » diffère : le canvas passe `selectedNodeId()` brut, `edges` passe `visibleOf(selected) ?? selected`. Un symbole sélectionné dans un membre déplie ses arêtes mais le membre reste atténué. Aligner sur la même valeur.
  - repeated-changes.logic.ts:60 — `foldRepeatedEdges` ne replie que `edge.from` égal à un fichier membre ; si le membre est déplié (U30), les arêtes issues de ses symboles ne sont pas repliées. À trancher, avec un test.
  - Aucun test de `MapBusiness.edges` pour l'ordre test-fold → repli répétitif → filtre « inchangées » (R16/R17/U30). L'ordre est correct (arêtes repliées `changed`, donc épargnées par R16), mais seule la logique pure est testée.
  - map-page.component.ts:301 — `repeated` vient du résumé de toute la PR : en mode commit, des membres absents du commit sélectionné restent atténués. Regroupement des entrées limité au mode fichier (symbole et commit non regroupés ; `commitProgress` compte chaque membre) : cohérent, mais la doc `review` dit « une seule entrée » sans préciser « en mode Fichier » (FR/EN).
  - « vu » : `markGroup` persiste chaque membre via `save` (R05 ok), la progression compte le groupe une fois dès que le représentant est vu ; désocher le représentant laisse les membres vus. Acceptable, à documenter si voulu.
  - reading-order-section.component.ts:54 — `proposes` reconstruit un tableau depuis `seenIds()` à chaque ligne et cycle de détection ; passer l'ensemble à `groupProposal`.
  - i18n EN/FR et doc `review` FR/EN présentes et alignées ; le test « has no group without repeated changes » est maintenant en deux `it`.

## Answer

- Vue d'ensemble : une ligne par groupe de E08 (« 4 fichiers : <résumé traduit> »), dépliable sur ses membres, qui se sélectionnent. Carte : le représentant porte « ×N », les autres membres sont atténués et leurs arêtes du diff repliées sur le représentant ; un membre sélectionné se déplie. Ordre de lecture (mode Fichier) : une entrée par groupe ; « vu » sur le représentant propose de marquer tout le groupe.
- Review : ship ; retouches appliquées (même notion de sélection dans la carte et les arêtes, commentaire, doc « en mode Fichier »).
- Vérifié : Vitest 944 ; e2e 171 passés / 1 ignoré (dont `repeated-changes` 4/4) ; `just lint` ; doc `review` FR/EN.
- Consider laissés : en mode commit, l'atténuation suit les groupes de toute la PR ; les arêtes issues des symboles d'un membre déplié (U30) ne sont pas repliées ; décocher le représentant laisse les membres vus.
