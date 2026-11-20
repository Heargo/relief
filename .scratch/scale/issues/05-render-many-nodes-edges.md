# S05 Rendu fluide avec beaucoup de nœuds et d'arêtes

Status: needs-triage
Type: task
Blocked by: S02
UI: oui
Doc: aucune (`docs/bench.md` complété)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 : la carte rame (zoom, déplacement, sélection) quand beaucoup de nœuds et d'arêtes sont affichés.

## À faire

- Mesurer d'abord : profil du canvas sur `wide` et sur un vrai dépôt de S02 (temps par frame au zoom, au pan, à la sélection), et l'ajouter à `docs/bench.md`.
- Pistes selon le profil : ne rendre que ce qui est dans la vue (culling), ne recalculer layout et emphasis qu'au changement de niveau et pas à chaque frame, simplifier les arêtes et libellés hors du niveau courant, passer les arêtes en un seul `path` ou en canvas au-delà d'un seuil.

## Critères d'acceptation

- [ ] Budget chiffré (ex. 60 fps au pan sur `wide`) fixé après la mesure, et tenu.
- [ ] Tous les tests existants passent sans changement de rendu.
