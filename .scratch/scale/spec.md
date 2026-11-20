# Spec : passage à l'échelle (S)

Status: ready-for-agent
Date: 2026-11-18

## But

Rester utilisable sur de gros dépôts et des monorepos (`docs/product/BRAINSTORM.md`, « Passage à l'échelle »).

## Décisions

- L'UI n'affiche jamais plus d'environ 2 000 nœuds. Au-delà, le cœur (`relief-app`) renvoie un sous-graphe : en relecture, les nœuds changés + 1 saut, leurs ancêtres, et les autres conteneurs fermés (avec leurs comptes) ; en exploration, les niveaux système et module, puis l'intérieur d'un conteneur à la demande quand on zoome dedans.
- Budgets mesurés sur des dépôts publics connus (clonés hors du dépôt, dans le cache) : indexation à froid et à chaud, `relief diff` d'une PR moyenne, premier affichage.

## Phase 10 : performances (brainstorm du 2026-11-20)

- **Mesurer avant d'optimiser** (S05) : une fixture avec beaucoup d'arêtes et un harnais de rendu (`just bench-ui`) fixent le budget que S06 à S09 tiennent.
- **Carte** : la caméra est un seul transform (S06) ; à chaque frame ne se recalcule que ce qui suit la caméra (S07) ; arêtes hors de la vue non dessinées et niveau de détail au-delà d'un seuil (S08) ; disposition dans un Web Worker si la mesure le justifie (S09).
- **Cœur** : index de fichier en cache (S04), indexation parallèle (S10), `analyse` incrémentale (S11), puis premier affichage avant la fin de l'indexation si un gros dépôt reste lent (S12).
- **Écarté** : rendu canvas ou WebGL de toute la carte. Le DOM + SVG reste (ADR 0002, e2e sur le DOM) tant que S06 à S08 tiennent le budget ; à rouvrir avec leurs chiffres.
