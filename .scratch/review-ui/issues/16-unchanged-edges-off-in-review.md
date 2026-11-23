# R16 Arêtes inchangées masquées par défaut en relecture

Status: ready-for-agent
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `review` (calques)

Spec: `../spec.md` (Phase 14)

## Constat

En relecture, les arêtes grises (inchangées) se mêlent aux arêtes du diff. L'interrupteur qui les masque existe mais est actif par défaut.

## Comportement

- En mode Relire la PR, « Arêtes inchangées » est désactivé par défaut ; en Exploration, actif par défaut. Le choix de l'utilisateur est mémorisé par mode.
- Les arêtes inchangées du nœud sélectionné restent visibles (comme U18), pour ne pas perdre le contexte d'un nœud qu'on lit.

## Critères d'acceptation

- [ ] Business : défaut par mode, mémorisé par mode.
- [ ] e2e acme-shop : en relecture, la scène n'a aucune arête inchangée hors du nœud sélectionné ; l'interrupteur les remet ; en exploration elles sont là.
- [ ] Doc `review` FR/EN.
