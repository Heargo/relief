# S17 Peintre Canvas : caméra, boîtes et texte

Status: ready-for-agent
Type: task
Blocked by: S15
UI: oui
Doc: aucune tant que le DOM reste le rendu par défaut

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Pourquoi

Premier morceau du moteur Canvas, à côté du DOM : tout ce qu'un nœud montre aujourd'hui.

## Comportement

- Préférence `relief.renderer` (`dom` par défaut, `canvas`) lue au démarrage (`localStorage`, `try/catch`), et `?renderer=canvas` pour les tests et le banc. En `canvas`, les effets `sync*` du DOM ne tournent pas et un `<canvas>` unique remplace le calque des nœuds et le SVG des arêtes.
- Le peintre (`map-painter.ts`, sans Angular) dessine la scène de S15 : redessin complet au plus une fois par `requestAnimationFrame`, `devicePixelRatio`, formes en coordonnées monde sous la caméra, texte en pixels écran.
- Couleurs lues dans les variables CSS `--relief-*` au démarrage et quand le thème change (clair / sombre).
- Nœuds, à parité visuelle avec le DOM (`map-canvas.component.scss`, maquette) : boîte fermée et conteneur ouvert, en-tête (`header` / onglet `tab`, `headerLayout`), libellé tronqué avec `…`, icône (police PrimeIcons dessinée en `fillText`), `sub`, badges, chips de comptes, marque de diff (statut et intensité), fantôme de l'ancien emplacement, impact (`hit` / `box` / `dim` et compte), lecture (vu, progression), archi, chargement, niveau de risque, focus (`faded`), emphase de sélection.
- Le prototype du spike (`proto-renderer.ts`) est supprimé.

## Critères d'acceptation

- [ ] Le peintre est testé sur un canvas factice (appels enregistrés) pour les cas : fermé, ouvert avec en-tête, onglet, libellé tronqué, statut, impact, emphase.
- [ ] En `?renderer=canvas`, la carte d'acme-shop montre les mêmes nœuds et textes qu'en DOM (capture comparée à l'œil, FR et EN, clair et sombre).
- [ ] `just e2e` (DOM par défaut) reste vert.
