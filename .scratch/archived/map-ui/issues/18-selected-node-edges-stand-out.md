# U18 Les arêtes du nœud sélectionné ressortent

Status: resolved
Type: task
Blocked by: U09
UI: oui
Doc: user-docs `map` (sélection), captures

Spec: `../spec.md` (« Retours du 2026-11-20 ») ; référence visuelle : `docs/product/maquette/v2.html`, sujet 4

## Constat

Quand un nœud est sélectionné, ses arêtes ont le même aspect que les autres : on ne les distingue pas.

## À faire

- **Nœud sélectionné** : ses arêtes sortantes en `--acc`, ses entrantes en `--imp`, plus épaisses (≈ 2,4 px) ; toutes les autres arêtes et leurs libellés à 12 % d'opacité ; les nœuds qui ne sont ni lui ni un voisin direct à 35 %.
- **Arête sélectionnée** : elle seule en accent (≈ 3 px) ; les autres à 12 % ; seules ses deux extrémités restent nettes.
- **Arêtes agrégées** : une arête est incidente si l'une de ses extrémités visibles est le nœud sélectionné ou son premier ancêtre visible.
- Les calques (diff, impact, règles) gardent leurs marques ; l'estompage des nœuds ne s'applique pas aux nœuds marqués par le calque d'impact.
- Échap ou clic dans le vide : tout redevient normal. Transition d'opacité courte, coupée sous `prefers-reduced-motion`.
- Logique pure : `edgeEmphasis(edges, selection, visibleOf) → Map<edgeKey, 'out' | 'in' | 'picked' | 'dim' | 'normal'>` et `nodeEmphasis(...)`.

## Critères d'acceptation

- [ ] Vitest : sortantes `out`, entrantes `in`, autres `dim` ; arête agrégée incidente via l'ancêtre visible ; sans sélection tout est `normal` ; arête sélectionnée `picked`, ses extrémités nettes.
- [ ] e2e sur acme-shop : après sélection d'un nœud, ses arêtes ont la classe `out` ou `in`, les autres `dim` (opacité calculée < 0,2) ; Échap rétablit tout.
- [ ] Captures EN et FR.

## Seams

1. **Logique TS** (Vitest) : `edges.logic.ts` ou nouveau `emphasis.logic.ts`.
2. **e2e** : classes et opacités calculées.

## Baseline

Après U17 (2026-11-20) : cargo 578/0 ; web 608/0 ; e2e 118 passed, 1 skipped, 0 failed.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/emphasis.logic.spec.ts`, `tests/e2e/tests/edge-emphasis.e2e.ts`
- Contrat posé par les tests : nouveau module `emphasis.logic.ts` exportant `edgeKey(from, to)` (`from + '\u0000' + to`), `type Selection = {kind:'node', id} | {kind:'edge', from, to}`, `edgeEmphasis(edges, selection | null, visibleOf) → Map<edgeKey, 'out'|'in'|'picked'|'dim'|'normal'>`, `nodeEmphasis(ids, edges, selection | null, visibleOf, keep?: Set<string>) → Map<id, 'sharp'|'dim'>` ; en e2e, le `g.edge` porte la classe `out` / `in` / `picked` / `dim`.
- e2e existants à migrer : aucun (relu focus-layers, impact, edges, edge-labels, diff-layer, rules : aucune attente d'opacité ni de classe `sel`/`dim` d'arête). Le calque focus garde `data-faded` (0,2) : l'estompage de sélection doit utiliser un autre mécanisme (pas `data-faded`).
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/emphasis.logic.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/edge-emphasis.e2e.ts`
- En échec : 11 tests (9 Vitest + 2 e2e)
  - emphasis.logic.spec.ts (9 tests, un par `it`) — le module `./emphasis.logic` n'existe pas (ne compile pas)
  - e2e « out / in edges stand out, the others dim, Escape restores » — l'arête API→DB n'a pas la classe `out`
  - e2e « a selected edge is the only one to stay sharp » — l'arête sélectionnée n'a pas la classe `picked`

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/emphasis.logic.ts` (nouveau), `src/ui/src/app/modules/map/business/map.business.ts`, `src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts`, `src/ui/src/styles.scss`
- Changement : `edgeEmphasis` / `nodeEmphasis` purs (param optionnel `within` pour les extrémités sous la boîte sélectionnée) ; le business expose `selection`, `visibleOf`, `within` ; le canvas pose les classes `out`/`in`/`picked`/`dim` sur `g.edge` et `data-emph="dim"` sur les nœuds (pas `data-faded`, les nœuds de l'impact sont épargnés) ; styles (2,4 / 3 px, 12 % / 35 %, transition coupée en reduced-motion) dans `styles.scss` pour tenir le budget du scss du canvas.
- Suite : cargo 578/0 ; web 617/0 (baseline 608/0) ; e2e 119 passed, 1 skipped, 1 failed (baseline 118/1/0) ; lint propre.
- Questions ouvertes : le test e2e « out / in edges stand out… » échoue à la ligne 57 et me semble faux : la recherche + Entrée (`selectResult`) plonge dans `@acme/api`, qui s'ouvre ; l'arête agrégée `WEB>API` (et `WEB>DB`) disparaît alors du DOM (ses extrémités se rattachent aux boîtes internes d'API), donc `edgeState(WEB, API)` vaut null. `out` (API>DB, API>shared) et `dim` (WEB>shared) sont corrects. Il faut sélectionner par clic (sans plongée) ou attendre une autre arête entrante.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - src/ui/src/styles.scss:430-455 — `--edge-color` de `out`/`in`/`picked` posé dans un fichier global, à égalité de spécificité avec les `st-*`/`viol-*` du scss du canvas (chargé après) : la couleur accent/impact peut être masquée sur une arête diff ou règle ; épaisseur et opacité, elles, passent. À vérifier visuellement, sinon monter la spécificité.
  - emphasis.logic.ts:49 — `nodeEmphasis` pour une arête sélectionnée compare `selection.from/to` directement (sans `within`) : correct tant que ce sont des boîtes visibles, fragile si la plongée change les extrémités.
  - emphasis.logic.ts — `within` en dernier paramètre optionnel de deux fonctions (après `keep`) : signature un peu lourde ; un objet d'options serait plus lisible.

## Answer

Les fonctions pures `edgeEmphasis` et `nodeEmphasis` (`emphasis.logic.ts`) classent les arêtes en `out`, `in`, `picked`, `dim` ou `normal` et les nœuds en `sharp` ou `dim`. Une arête agrégée compte comme incidente quand une de ses extrémités visibles est le nœud sélectionné ou son premier ancêtre visible. Le canvas pose ces classes sur `g.edge` et `data-emph="dim"` sur les nœuds, sans toucher à `data-faded`, réservé au focus. Les nœuds marqués par l'impact sont épargnés. Styles : 2,4 px pour les arêtes du nœud et 3 px pour l'arête sélectionnée, 12 % d'opacité pour les autres arêtes et 35 % pour les nœuds non voisins, transition coupée sous `prefers-reduced-motion`.

Vérifié : web 617/0, cargo 578/0, e2e complète 120 passés / 1 ignoré / 0 échec, `just lint` propre, review `ship`. L'e2e `edge-emphasis` a été corrigé après green : la sélection par recherche plongeait dans le nœud, le test sélectionne maintenant par un vrai clic. Capture EN relue à 1280 px : sortantes en accent, entrante en couleur d'impact. Les voisins directs n'ont pas `emph=dim`, mais le calque d'impact (actif par défaut) les estompe déjà (`imp-dim`) : c'est le comportement existant, gardé comme le demande le ticket. Doc `map` (FR/EN) en texte seul, captures de doc non refaites (phase alpha).

Restent en `Consider` : les silhouettes fantômes à l'intérieur d'un voisin sont `dim` (seule la boîte voisine reste nette) ; `--edge-color` de `out`/`in` à la même spécificité que `st-*`/`viol-*` ; la signature de `nodeEmphasis` à passer en objet d'options.
