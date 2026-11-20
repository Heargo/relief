# S08 Arêtes : hors de la vue et niveau de détail

Status: needs-triage
Type: task
Blocked by: S06
UI: oui
Doc: docs/user `map` (beaucoup d'arêtes)

Spec: `../spec.md` (Décisions, phase 10)

## Constat

Toutes les arêtes agrégées du niveau courant sont dans le DOM (4 éléments SVG chacune : zone de clic, trait, flèche, étiquette), même celles dont aucune partie n'est à l'écran.

## À faire

- Ne pas créer les arêtes dont la boîte englobante ne coupe pas la vue (marge de rendu comprise).
- Au-delà d'un seuil d'arêtes à l'écran (fixé par la mesure de S05) : les arêtes inchangées sont dessinées dans un seul `path`, sans flèche, sans étiquette ni zone de clic ; les arêtes changées, en violation, sélectionnées ou sur le rayon d'impact gardent leur rendu complet.
- Une arête du `path` commun reste sélectionnable : clic sur le trait retrouvé par une recherche de proximité (fonction pure), pas par le DOM.

## Reprise de S07

Budget de zoom transféré de S07 : au franchissement d'un seuil d'ouverture, la forme de chaque arête change (courbure, flèche et étiquette en pixels écran), donc toutes sont réécrites (`edgeWrite` 56 ms p95, `syncEdges` 24 ms p95 sur `dense`). Zoom p95 après S07 : 174 / 341 ms pour 33.

## Critères d'acceptation

- [ ] Budget de S05 tenu au pan et au zoom sur excalidraw.
- [ ] e2e : sur `dense` au niveau fichiers, une arête inchangée fusionnée se sélectionne au clic et ouvre l'inspecteur d'arête.
- [ ] Sous le seuil, rendu identique à aujourd'hui (e2e existants inchangés).
