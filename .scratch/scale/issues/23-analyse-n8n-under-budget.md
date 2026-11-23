# S23 `analyse` d'un très gros dépôt sous le budget

Status: needs-triage
Type: task
Blocked by: S11
UI: non
Doc: aucune (`docs/bench.md` remis à jour)

Spec: `../spec.md` (Décisions : budgets)

## Constat

Après S11 (`docs/bench.md`, « After S11 »), `analyse` d'une PR de ~50 fichiers sur n8n prend 5,7 s pour un budget de 1 s : base indexée en entier dans un processus neuf (2,35 s), coûts fixes du head (le détecteur lit et hache les 35 000 blobs, clone des 157 000 nœuds, validation : 1,6 s), `diff_graphs` et signatures (1,2 s). excalidraw tient le budget (351 ms).

## Pistes (à mesurer, une à la fois)

- Le détecteur reprend les hashes de contenu de la base au lieu de relire tous les blobs.
- Persister le snapshot d'un commit dans `.relief/` pour ne pas reconstruire la base dans un processus neuf.
- Partager nœuds et arêtes entre snapshots (pas de clone) ; `diff_graphs` limité aux fichiers changés et à leurs voisins.

## Critères d'acceptation

- [ ] `just bench` : `analyse` sur n8n sous 1 s, ou l'écart restant expliqué et accepté par l'utilisateur.
- [ ] Les tests de propriété de S11 passent sans changement.
