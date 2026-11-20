# Arêtes agrégées

Status: resolved
Type: task
Blocked by: U02
UI: oui
Doc: user-docs `map` (lire les arêtes)

Spec: `../spec.md` (Décisions : arêtes agrégées)

## À faire

- `edges.logic.ts` : rattacher chaque arête fine au premier ancêtre visible de ses extrémités, ignorer les arêtes internes et ancêtre/descendant, regrouper par paire (compte, types).
- Rendu SVG : courbe entre bords de boîtes, flèche, épaisseur selon le nombre, étiquette du nombre, zone de clic élargie, infobulle (« apps/web → apps/api · 3 liens (HTTP) »).
- Clic sur une arête : panneau de droite avec la liste des liens fins (clic → sélection du symbole).
- Calque « arêtes inchangées » (masquable) prêt pour le mode relecture.

## Critères d'acceptation

- [x] Vitest : agrégation d'arêtes littérales à deux niveaux de visibilité (comptes attendus).
- [x] e2e : au niveau Système, l'arête `apps/web → packages/db` existe et son panneau liste `validateCodeLocally → findDiscountByCode`.

## Baseline

`just test-summary` (develop, c7af5a0) : cargo 329 passed, 0 failed ; web 79 passed, 0 failed.

## Seams

1. `web/src/app/modules/map/edges.logic.ts` (Vitest, fonctions pures exportées) : rattachement au premier ancêtre visible, arêtes internes et ancêtre/descendant ignorées, regroupement par paire (compte, types), épaisseur selon le nombre, libellé d'infobulle, filtre du calque « inchangées ». Attrape les erreurs d'agrégation sur des graphes littéraux à deux niveaux de visibilité ; rate le rendu SVG et le clic.
2. `MapBusiness` (`TestBed`, `ReliefApiService` mocké) : arêtes agrégées exposées pour la visibilité courante, sélection d'une arête → liste des liens fins, sélection d'un lien → symbole sélectionné, calque « arêtes inchangées » masquable. Attrape l'état et son câblage ; rate la géométrie et le DOM.
3. e2e Playwright sur acme-shop : au niveau Système, l'arête `apps/web → packages/db` est visible avec son nombre, son clic ouvre le panneau de droite qui liste `validateCodeLocally → findDiscountByCode`, et le clic sur ce lien sélectionne le symbole. Attrape le parcours réel (API, rendu, panneau) ; rate les cas limites d'agrégation.

## Red

- Fichiers de test : `web/src/app/modules/map/helpers/edges.logic.spec.ts`, `web/src/app/modules/map/business/map-edges.business.spec.ts`, `e2e/tests/edges.spec.ts`
- Lancer (depuis `web/`) : `npx ng test --watch=false --include src/app/modules/map/helpers/edges.logic.spec.ts` ; idem avec `.../business/map-edges.business.spec.ts` ; (depuis `e2e/`) `npx playwright test edges.spec.ts`
- API attendue (inventée par les tests) :
  - `edges.logic.ts` : `aggregateEdges(edges, parents: Map<id, id|null>, visible: Set<id>, opts?: { changed?: (e: Edge) => boolean }): AggregatedEdge[]` avec `AggregatedEdge { from, to, count, kinds: EdgeKind[], links: Edge[], changed: boolean }` ; `filterEdges(edges, showUnchanged)` ; `edgeThickness(count)` ; `edgeTooltip({from,to,count,kinds}, label: (id) => string)` (contient `apps/web → apps/api · 3` et `(HTTP)`).
  - `MapBusiness` : `edges()`, `selectedEdge()` (`AggregatedEdge | null`), `selectEdge(from, to)`, `clearEdgeSelection()`, `selectedNodeId()`, `selectLink(edge)` (sélectionne le symbole `from` du lien), `showUnchangedEdges()`, `setShowUnchangedEdges(bool)` (hors relecture, toutes les arêtes sont « inchangées »).
  - e2e : `data-testid` `map-edge` (`data-from`, `data-to`, `data-count`), `edge-panel`, `edge-link`, `selected-node` (`data-node-id`).
- En échec :
  - `edges.logic.spec.ts` (tous les tests) — le module `./edges.logic` n'existe pas.
  - `map-edges.business.spec.ts` (tous les tests) — `edges`, `selectEdge`, `selectedEdge`, `clearEdgeSelection`, `selectLink`, `selectedNodeId`, `showUnchangedEdges`, `setShowUnchangedEdges` absents de `MapBusiness`.
  - `e2e/tests/edges.spec.ts` (1 test) — aucun `map-edge` `pkg:@acme/web → pkg:@acme/db` rendu.

## Green

- Fichiers : `web/src/app/modules/map/helpers/edges.logic.ts` (nouveau), `business/map.business.ts`, `components/map-canvas/map-canvas.component.{ts,html,scss}`, `components/map-page/map-page.component.{ts,html,scss}`, `web/public/i18n/{en,fr}.json` (`map.edges.*`)
- Changement : `edges.logic.ts` agrège les arêtes fines sur les boîtes ouvertes ou fermées (hors fantômes), filtre le calque « inchangées », donne l'épaisseur, l'infobulle et la géométrie (courbe bord à bord, flèche). `MapBusiness` expose `edges`, `edgeLines` (pixels, suit la caméra), la sélection d'arête et de lien, `showUnchangedEdges` (« changé » toujours faux hors relecture). Le canvas écrit le SVG directement dans le DOM, sans `detectChanges` par frame ; le nombre sert de cible de clic (`map-edge`) en plus d'une zone de clic élargie, et le bouton « Arêtes inchangées » masque le calque. Le panneau de droite liste les liens (`edge-panel`, `edge-link`) et affiche le symbole choisi (`selected-node`).
- Suite : cargo 329/0 (baseline 329/0) ; web 99/0 (baseline 79/0, +20 tests rouges devenus verts) ; e2e 32 passés (dont `edges.spec.ts`), après `just build` ; `just lint` propre ; aucun fichier de test modifié.
- Questions ouvertes : aucune

## Review

- Verdict : fix first, puis ship après correction de la doc (revérifié par tdd-review).
- Must fix : `user-docs/src/content/docs/map.md` et `en/map.md` ne parlent pas des arêtes alors que le ticket annonce « Doc: user-docs `map` (lire les arêtes) ». Traité par l'orchestrateur à l'étape 8 (section « Lire les arêtes » FR et EN), ce qui relève de la doc et non du code.
- Consider :
  - `map-canvas.component.html:9` : `<defs></defs>` vide et inutilisé, à retirer.
  - `syncEdges` : l'infobulle est un `<title>` SVG natif, alors que la maquette (`#tip`) a une infobulle personnalisée. i18n EN/FR correcte (`map.edges.links[_one]`).
  - `syncEdges` : destructuration positionnelle de `group.children` puis `el?.` partout ; des références typées par clé dans `edgeElements` seraient plus claires.
  - `edgeTooltip` : `k === 'http' ? 'HTTP' : k` code en dur le libellé du type ; à centraliser quand d'autres types seront affichés.
  - Construction du libellé d'infobulle dupliquée entre `map-page` et `map-canvas` ; extraire un helper.
- Conforme : ADR 0002 (effect + `untracked`, SVG écrit dans le DOM, pas de `detectChanges` par frame), seams respectés, `changed: () => false` sans dépendance à U04, chaînes EN et FR présentes.

## Answer

- Construit : `helpers/edges.logic.ts` (agrégation au premier ancêtre visible, arêtes internes et ancêtre/descendant ignorées, regroupement par paire avec compte, types et liens fins, épaisseur, infobulle, géométrie bord à bord avec flèche, filtre du calque « inchangées »). `MapBusiness` expose `edges`, `edgeLines`, la sélection d'arête et de lien, `showUnchangedEdges`. Le canvas écrit le SVG directement dans le DOM (ADR 0002). Panneau de droite : liste des liens fins, clic → symbole sélectionné. Bouton « Arêtes inchangées » (EN/FR).
- Décisions : `selectLink` sélectionne le symbole d'origine du lien ; hors relecture, « changé » vaut toujours faux (R01 le branchera) ; infobulle en `<title>` SVG natif ; types de liens affichés en brut (`calls`, `imports`).
- Vérifié : Vitest 99/0 (baseline 79/0), cargo 329/0, e2e 32/0 dont `edges.spec.ts`, `just lint` propre. Navigateur sur acme-shop : EN et FR, 1280 et 1024 px, arêtes aux niveaux 0 (7), 1, 2, 3, panneau `@acme/web → @acme/db · 2 links` listant `validateCodeLocally → findDiscountByCode`, clic → symbole sélectionné, calque masquable, console sans erreur. À 1024 px la carte ne fait que 294 px (défaut U01 connu) : les arêtes restent visibles mais à l'étroit.
- Doc : section « Lire les dépendances » / « Reading dependencies » de `user-docs` `map` (FR, EN), captures `map.png` régénérées, `just docs-build` passe.
