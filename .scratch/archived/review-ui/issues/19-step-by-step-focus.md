# R19 Relecture pas à pas

Status: resolved
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `review` (ordre de lecture)

Spec: `../spec.md` (Phase 14)

## Comportement

- Interrupteur « Pas à pas » dans le panneau de l'ordre de lecture. Activé, l'élément courant de l'ordre de lecture (celui qu'on vient d'ouvrir, ou le suivant non vu) et ses voisins directs (sources et cibles de ses arêtes) restent vifs ; tout le reste de la carte est atténué à 10 %, arêtes comprises.
- Suivant / précédent de l'ordre de lecture change l'élément courant et cadre la caméra sur lui et ses voisins.
- Désactivé, la carte redevient normale ; la sélection reste.

## Critères d'acceptation

- [x] Logique : nœuds et arêtes vifs pour un élément courant.
- [x] e2e acme-shop : pas à pas sur la deuxième entrée de l'ordre de lecture ; la scène atténue tout sauf elle et ses voisins ; « suivant » change l'élément.
- [x] Doc `review` FR/EN.

## Baseline

`67773c1` (develop) : cargo 682 ; web 994 ; e2e 174 passés / 1 ignoré.

## Seams

- **Logique (`*.logic.ts`, Vitest)** : pour un élément courant, l'ensemble des nœuds et arêtes vifs (lui, ses voisins directs, leurs arêtes communes), le reste atténué. Attrape la règle.
- **Business (`ReadingOrderBusiness` / `MapBusiness`, TestBed)** : interrupteur pas à pas, élément courant = ouvert ou prochain non vu, suivant / précédent, cadrage demandé sur l'élément et ses voisins. Attrape le câblage.
- **e2e (acme-shop)** : pas à pas sur la deuxième entrée ; la scène atténue tout sauf elle et ses voisins ; « suivant » change l'élément ; désactivé, plus rien d'atténué.

## Red

- Fichiers de test : `src/ui/src/app/modules/review/helpers/step-focus.logic.spec.ts`, `src/ui/src/app/modules/review/business/reading-order.business.spec.ts` (bloc « step by step » ajouté), `tests/e2e/tests/step-by-step.e2e.ts` (non lancé)
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/review/helpers/step-focus.logic.spec.ts` puis `--include src/app/modules/review/business/reading-order.business.spec.ts` ; e2e : `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/step-by-step.e2e.ts`
- En échec : 6 tests logique — module `./step-focus.logic` absent ; 5 tests business — `stepByStep`, `setStepByStep`, `open`, `current`, `stepCurrent`, `stepFocus`, `frameIds` absents (compilation) ; 1 e2e — `toggle-step-by-step` absent.
- Contrat pour green :
  - `review/helpers/step-focus.logic.ts` : `stepFocus(graph, current): { nodes: Set<string>; edges: Set<string> }` ; nodes = courant + voisins directs (deux sens) + boîtes parentes ; edges = `edgeKey(from,to)` (`from\0to`, `map/helpers/emphasis.logic`) dont les deux bouts sont courant ou voisin.
  - `ReadingOrderBusiness` : `stepByStep` (signal, faux par défaut, session seulement, pas de persistance), `setStepByStep(on)`, `open(id)`, `current()` (ouvert, sinon premier non vu, null si off), `stepCurrent(1|-1)` (renvoie le nouvel id, null aux extrémités), `stepFocus(graph)`, `frameIds(graph)` (courant + voisins, null si off).
  - Scène : `SceneEdge.faded: boolean` à ajouter (+ `tests/e2e/helpers/map-scene.ts`) ; nœuds via `focus`/`SceneNode.faded` ; peinture à 10 % (FADED vaut 0,2 aujourd'hui, arêtes non atténuées aujourd'hui).
  - Testids : `toggle-step-by-step` (`aria-pressed`), `reading-next`, `reading-previous` (n'existent pas : seules les touches n/p existent), `data-current` sur `reading-row`. Cadrage : `map.frameNodes(frameIds)`.

## Green

- Fichiers : `src/ui/src/app/modules/review/helpers/step-focus.logic.ts` (nouveau), `review/business/reading-order.business.ts`, `review/components/reading-order-section/*.{ts,html}`, `map/components/map-page/map-page.component.{ts,html}`, `map/components/map-canvas/{map-canvas.component,map-painter,edge-painter}.ts`, `map/helpers/map-scene.logic.ts`, `src/ui/public/i18n/{en,fr}.json`, `docs/user/src/content/docs/{review.md,en/review.md}`
- Changement : `stepFocus` (+ `elementEdges`, qui ajoute les arêtes remontées au niveau de l'élément courant) ; `ReadingOrderBusiness` porte `stepByStep`, `open`, `current`, `stepCurrent`, `stepFocus`, `frameIds`. Scène : `SceneEdge.faded` (optionnel dans le type, les specs existantes construisent des `SceneEdge` sans) et `SceneNode.deepFade`, peints à 10 % (le calque PR reste à 20 %) ; une arête agrégée vers une boîte est vive si elle couvre une arête vive. Section : `toggle-step-by-step`, `reading-previous`/`reading-next`, `data-current` ; la page branche sélection -> `open`, cadrage par `map.frameNodes(frameIds)`, retour de vue à la désactivation.
- Suite : cargo 682/0 (baseline 682), web 1005/0 (baseline 994 + 11 nouveaux) ; e2e `reading-order` 3/3 et `focus-layers` 2/2 ; `step-by-step` : 0/1 (voir questions). `just build` et `just docs-build` passent.
- Questions ouvertes :
  - `just lint` échoue seulement sur Prettier des deux specs rouges (`reading-order.business.spec.ts`, `step-focus.logic.spec.ts` ne sont pas formatés) ; je ne les ai pas touchés, à formater par red.
  - e2e `step-by-step.e2e.ts` ligne 43 : `expect(n.faded, n.id)` n'est pas supporté par l'`expect` de `@wdio/globals` (« Expect takes at most one argument »), le test échoue avant d'exercer le code. Avec un `expect(n.faded)` en copie temporaire, il reste en désaccord avec le contrat : le test traite comme « parent » seulement les ids préfixés par `<id>::` (donc `pkg:@acme/api` et `pkg:@acme/shared` devraient être atténués), alors que le test logique exige que les boîtes parentes restent vives ; il lit aussi la scène une seule fois, en cours de transition.
  - `tests/e2e/helpers/map-scene.ts` n'est pas dans l'index et n'a pas reçu `faded` sur `SceneEdge` (modification de fichier de test refusée) : à ajouter par red.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - step-focus.logic.ts:3-8 — commentaire de tête brouillé (phrases mêlées sur `elements` et `edges`) — le réécrire.
  - map-scene.logic.ts:318-350 — `fadedNode` et `edgeFaded` recréent `[...set]` et reparcourent toutes les arêtes vives à chaque nœud/arête (O(n·m) par scène) — précalculer un tableau une fois par scène.
  - map-scene.logic.ts:283 — `deepFade` redondant avec `faded` + `stepEdges` ; `fine()` par regex sur le suffixe d'id est fragile si le format d'id change.
  - map-painter.ts:93 / edge-painter.ts:14 — `STEP_FADED` dupliqué — le partager.
  - edge-painter.ts:136 — `(b.edges ?? []).length > 0 && b.edges.every(...)` : garde incohérente — normaliser.
  - map-page.component.ts:~395 — `frameNodes(null)` du cadrage pas à pas et celui du scope de lecture partagent `beforeFrame` : un changement de scope pendant le pas à pas restaure la vue trop tôt.
  - Le pas à pas prend le pas sur la couche focus PR (R07) tant qu'il est actif : voulu, à garder documenté.

## Answer

- Interrupteur « Pas à pas » dans la section de l'ordre de lecture (non mémorisé). Actif, l'élément courant (l'entrée ouverte, sinon la première non vue) et ses voisins directs, avec leurs boîtes et leur contenu, restent vifs ; le reste de la carte, arêtes comprises, est atténué à 10 %. Boutons Précédent / Suivant ; la caméra cadre l'élément et ses voisins, et revient à la vue d'avant à la désactivation. Les arêtes dépliées en symboles (U30) sont jugées au niveau de l'élément ; un faisceau (U31) reste vif si une de ses branches l'est.
- Défaut trouvé à l'e2e et corrigé : en pas à pas, les arêtes de symboles de l'entrée courante (sélectionnée, donc dépliée) étaient atténuées. La spec e2e vérifie des propriétés robustes ; la règle exacte est couverte par les tests logiques.
- Review : ship ; retouches appliquées (index par scène au lieu d'un parcours par nœud, cadrage par propriétaire, constante partagée).
- Vérifié : Vitest 1008 ; e2e 175 passés / 1 ignoré ; `just lint` ; doc `review` FR/EN.
