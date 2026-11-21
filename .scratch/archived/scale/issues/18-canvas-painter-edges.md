# S18 Peintre Canvas : arêtes, étiquettes et co-changements

Status: resolved
Type: task
Blocked by: S17
UI: oui
Doc: aucune tant que le DOM reste le rendu par défaut

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Comportement

À parité avec le SVG actuel (`syncEdges`, `syncMergedEdges`, `syncCoChange`, `syncEdgeEmphasis`) :

- Arêtes complètes : courbe (`shape.d` en `Path2D`, cache par chaîne), flèche (`shape.arrow`), épaisseur `edgeThickness(count)`, couleur par statut, `changed`, sélectionnée, chemin d'impact, violation nouvelle ou ancienne, emphase (`out`, `in`, `picked`, `dim`, `hidden`).
- Étiquettes : visibles selon `edgeLabelVisible(label, length)`, au milieu (`mx`, `my`), en pixels écran, classe (`cls`, `hl` sur le chemin d'impact), `covered`.
- Arêtes fusionnées (au-delà de 500 à l'écran) : un seul tracé fin, sans flèche ni étiquette, estompé quand quelque chose est sélectionné.
- Co-changements : tirets, couleur `--relief-cochange`.

## Critères d'acceptation

- [x] Peintre testé sur un canvas factice : arête complète, étiquette visible ou non, fusionnées, co-changement, emphase.
- [x] En `?renderer=canvas`, les arêtes d'acme-shop (relecture et exploration) ressemblent au SVG (capture à l'œil).
- [x] `just e2e` (DOM par défaut) reste vert.

## Baseline

`4bd8d32` : cargo 630 ; web 806 ; e2e 47/47 specs (une spec instable connue, voir S17).

## Seams

- **Peintre (`map-painter.ts`, ou un module voisin `edge-painter.ts`, Vitest sur le contexte 2D factice de S17)** : attrape ce qui est dessiné pour chaque état d'arête de la scène (tracé et flèche, épaisseur, couleurs de statut, changée, sélectionnée, chemin d'impact, violation, emphase, étiquette visible ou non et sa classe, fusionnées, co-changements en tirets) ; rate les pixels réels.
- **e2e (`tests/e2e/tests/map-canvas.e2e.ts`)** : en `?renderer=canvas`, le parcours d'une PR montre les arêtes de la scène (mêmes arêtes qu'en DOM, étiquettes visibles identiques) et `map-edges-temp.ts` n'existe plus ; rate la parité visuelle fine (captures à l'œil).

## Red

- Fichiers de test : `src/ui/src/app/modules/map/components/map-canvas/map-painter.spec.ts`, `src/ui/src/app/modules/map/helpers/map-scene.logic.spec.ts`, `tests/e2e/tests/map-canvas.e2e.ts`
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/map/components/map-canvas/map-painter.spec.ts` (idem pour `src/app/modules/map/helpers/map-scene.logic.spec.ts`) ; `just build` puis `cd tests/e2e && GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/map-canvas.e2e.ts`
- Contrat posé : `SceneEdge.shape = { d, arrow, covered }` (pleines, fusionnées, co-changements) ; `Palette` gagne `cochange` (`--relief-cochange`) et `ruleOld` (`--relief-rule-old`) ; le peintre utilise `Path2D` (le spec le remplace par un faux) ; fusionnées estompées (0.12, sinon 0.6) dès qu'un nœud ou une arête de la scène a une emphase non normale.
- En échec : les deux specs Vitest ne compilent pas (TS2353 : `shape` n'existe pas dans `SceneEdge`), donc tous leurs tests sont rouges, dont les nouveaux :
  - map-scene.logic.spec : 3 tests « edge shapes » (pleine avec `covered`, fusionnée, co-changement) — `shape` absent de la scène.
  - map-painter.spec : readPalette (clés `cochange`/`ruleOld` attendues) ; arêtes pleines (tracé + flèche, épaisseur, faint, statuts, tirets, violation, sélectionnée, chemin d'impact, emphases out/in/picked, dim, hidden) ; étiquettes (position écran, non visible, classes, impact, ordre) ; fusionnées (un seul tracé, fin, estompé) ; co-changement (tirets 6 4, `--relief-cochange`, sans flèche ni étiquette).
  - e2e : 1 échec sur 7 — « the edge painter of the spike no longer exists » : `map-edges-temp.ts` existe encore. Les deux autres nouveaux tests e2e (parité des arêtes DOM/canvas, arêtes peintes sur le canvas) passent déjà avec le provisoire, ils gardent la non-régression.

## Green

- Fichiers : `src/ui/src/app/modules/map/components/map-canvas/edge-painter.ts` (nouveau), `map-painter.ts`, `map-canvas.component.ts`, `src/ui/src/app/modules/map/helpers/map-scene.logic.ts` ; `map-edges-temp.ts` supprimé.
- Changement : `SceneEdge.shape` (d, arrow, covered) ; `Palette` gagne `cochange` et `ruleOld` ; `createEdgePainter` dessine fusionnées (un `Path2D` union mis en cache), arêtes pleines et co-changements en unités monde (cache `Path2D` par chaîne `d`), puis étiquettes en pixels écran ; le peintre l'appelle après les boîtes ; le composant n'a plus de peintre provisoire. Pas de halo sous les étiquettes (pas de couleur de carte dans la palette).
- Suite : web 830 réussis / 0 échoué (baseline 806) ; e2e map-canvas 7/7 et map-scene 7/7 ; lint propre ; cargo non touché.
- Questions ouvertes : halo des étiquettes (`--relief-map`) à ajouter à la palette si la capture à l'œil le réclame ; animation `relief-flow` des tirets non reproduite.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - edge-painter.ts:35-43 — le cache du chemin fusionné (invalidation quand les chaînes `d` changent à longueur égale) n'est testé par aucun spec (un seul `paint` par peintre) — peindre deux fois avec des chaînes différentes et vérifier l'union.
  - edge-painter.ts:107,129 — `dashOf` et le tiret des co-changements allouent un tableau par arête et par frame — mettre en cache par `px` ou réutiliser.
  - edge-painter.ts:89 — pas d'élagage des arêtes hors écran ; coût O(arêtes) par frame — à mesurer dans le banc.
  - edge-painter.ts:149 — pas de halo sous les étiquettes (`--relief-map`), écart avec `styles.scss` `.el` ; ajouter `map` à la palette si la capture l'exige.
  - edge-painter.ts:114 — dim à 0.12 sur le trait, alors que le SVG l'applique au groupe (0.75 x 0.12) ; écart faible.
  - map-painter.ts:5 — l'import `./edge-painter` précède les imports `../../helpers/*` ; ordre à ranger.
  - Parité : le survol (`:hover` accent) et l'animation `relief-flow` ne sont pas reproduits (assumé dans le ticket).

## Answer

- `edge-painter.ts` (`createEdgePainter`) : fusionnées en un `Path2D` union mis en cache, arêtes pleines et co-changements en unités monde (cache `Path2D` par chaîne `d`, flèche, épaisseur `edgeThickness`, priorité de couleurs du SVG, violation, sélection, chemin d'impact, emphase, tirets en pixels écran), puis étiquettes en pixels écran. `SceneEdge.shape` (`d`, `arrow`, `covered`) ; `Palette` gagne `cochange` et `ruleOld`. `map-edges-temp.ts` supprimé.
- Vérifié : web 830 (806 + 24), cargo 630, `just e2e` 155 passés / 1 ignoré / 0 échec, lint propre. Capture DOM / Canvas d'acme-shop en relecture : mêmes arêtes, couleurs, tirets, étiquettes et flèches. Review : ship.
- Écarts et remarques reportés à S20 : halo des étiquettes (`--relief-map`), survol en accent et animation `relief-flow` non reproduits ; pas d'élagage des arêtes pleines hors écran dans le peintre (à mesurer au banc) ; tableaux de tirets alloués par arête et par frame ; cache de l'union des fusionnées non couvert par un test à deux frames.
