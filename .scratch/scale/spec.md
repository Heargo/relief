# Spec : passage à l'échelle (S)

Status: ready-for-agent
Date: 2026-11-18

## But

Rester utilisable sur de gros dépôts et des monorepos (`docs/product/BRAINSTORM.md`, « Passage à l'échelle »).

## Décisions

- L'UI n'affiche jamais plus d'environ 2 000 nœuds. Au-delà, le cœur (`relief-app`) renvoie un sous-graphe : en relecture, les nœuds changés + 1 saut, leurs ancêtres, et les autres conteneurs fermés (avec leurs comptes) ; en exploration, les niveaux système et module, puis l'intérieur d'un conteneur à la demande quand on zoome dedans.
- Budgets mesurés sur des dépôts publics connus (clonés hors du dépôt, dans le cache) : indexation à froid et à chaud, `relief diff` d'une PR moyenne, premier affichage.
