# 0005. Pas d'IA dans le MVP

Status: accepted (2026-11-18, revue de la maquette)

## Décision

relief est d'abord un client local qui marche sur n'importe quelle codebase git. Tout ce qu'il affiche est calculé de façon déterministe depuis git et le graphe : changements structurels, signatures cassantes et leur raison, impact, violations, ordre de lecture. Aucun résumé généré, aucun appel réseau.

## Conséquences

- Les textes explicatifs sont construits à partir de faits du graphe (« paramètre optionnel ajouté », « 3 appelants hors du diff »), jamais rédigés par un modèle.
- Les résumés IA par nœud restent une idée pour plus tard (après la v1), ancrés dans le graphe.
