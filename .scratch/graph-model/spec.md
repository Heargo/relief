# Spec : modèle de graphe (M)

Status: ready-for-agent
Date: 2026-11-18

## But

Un modèle unique pour tous les langages et toutes les typologies de projet (`docs/product/BRAINSTORM.md`, « Modèle de graphe universel »), sérialisable, avec des ids stables, et un contrat JSON publié pour l'UI et les futurs plugins.

## Décisions

- `kind` des nœuds : `repo | workspace | service | package | module | file | symbol | external`. `subkind` libre, fourni par l'adapter (`class`, `method`, `function`, `type`, `component`, `route`, `table`, `job`…).
- `kind` des arêtes : `imports | calls | references | renders | extends | implements | http | depends_on`. `precision : syntactic | resolved`.
- Id stable : segments `kind:valeur` joints par `::` (`pkg:@acme/api::file:src/billing/invoice.ts::sym:computeTotal`, méthode `sym:SessionStore.refresh`). Pas de compteur, pas d'ordre de parcours.
- Hiérarchie de contenance par `parent` ; le zoom de l'UI suit cette hiérarchie (système = package/service, module = dossier, fichier, symbole).
- `GraphSnapshot { commit, nodes, edges, meta }` ; `GraphDiff` est défini par la spec `diff-engine`.
- Contrat : `schemars` → `docs/contract/*.schema.json` → `src/ui/src/app/core/models/contract.ts`. Un test échoue si le schéma commité n'est pas à jour.
