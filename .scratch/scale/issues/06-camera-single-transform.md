# S06 Caméra en un seul transform

Status: needs-triage
Type: task
Blocked by: S05
UI: oui
Doc: aucune (`docs/bench.md` complété)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Les nœuds et les arêtes sont placés en pixels d'écran : chaque frame de pan réécrit `transform`, `width`, `height` de chaque nœud et le `d` de chaque arête, alors qu'un pan ne change rien d'autre que la translation.

## À faire

- Nœuds et arêtes en coordonnées monde, dans un calque qui porte seul la caméra (`transform: translate(tx, ty) scale(s)`, même transform pour le `div` des nœuds et le `g` des arêtes ; traits en `vector-effect: non-scaling-stroke`).
- Pan : seul le transform du calque change ; aucun `computed` de nœud ou d'arête ne se relance.
- Zoom : pendant le geste, seul le transform change ; les modes (ouvert, boîte, fantôme), les en-têtes et les libellés se recalculent au repos (fin du geste, environ 120 ms) ou dès qu'un seuil d'ouverture est franchi, pour que l'ouverture des boîtes reste immédiate.
- Formes des arêtes (`edgeShape`) en coordonnées monde, recalculées au changement de layout ou de modes, pas de caméra.
- Le culling des nœuds hors de la vue (`isInViewport`) reste, recalculé au repos et quand le pan sort de la marge de rendu.

## Critères d'acceptation

- [ ] Budget de S05 tenu au pan sur `dense` (`just bench-ui`).
- [ ] Tous les tests existants passent ; les e2e de la carte (zoom, ouverture des boîtes, sélection, arêtes) inchangés.
- [ ] Les captures de la carte d'acme-shop sont identiques au pixel près au repos (textes et épaisseurs de trait compris).

## Questions ouvertes

- Les tailles de texte dépendent de l'échelle (`headerLayout`) : pendant un zoom, le texte grossit avec le transform jusqu'au repos. Acceptable, ou recalcul toutes les N frames ?
