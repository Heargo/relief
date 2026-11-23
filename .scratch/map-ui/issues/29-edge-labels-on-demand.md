# U29 Étiquettes d'arête à la demande

Status: ready-for-agent
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `map` (arêtes)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Sur une grosse PR, le texte `new` / `-1` / le compteur est peint sur chaque arête : des centaines d'étiquettes, alors que la couleur et le tiret disent déjà ajoutée / supprimée.

## Comportement

- Au repos, aucune étiquette d'arête individuelle. Une étiquette s'affiche pour l'arête survolée, pour les arêtes du nœud sélectionné et pour l'arête sélectionnée.
- Ce que disait l'étiquette (statut, nombre de liens, sortes) reste dans l'infobulle et l'inspecteur.
- Les arêtes fusionnées (S08) gardent leur pastille de compte, une par paire de boîtes.
- Interrupteur « Étiquettes d'arête : toujours » dans la section Affichage (désactivé par défaut), mémorisé comme les autres réglages d'affichage.

## Critères d'acceptation

- [ ] Logique : `edgeLabelShown(edge, { hovered, selectedNode, selectedEdge, always })`.
- [ ] e2e acme-shop : au repos la scène n'a aucune étiquette d'arête visible ; au survol d'une arête, la sienne apparaît ; à la sélection de `apps/web`, celles de ses arêtes ; avec l'interrupteur, toutes.
- [ ] Doc `map` FR/EN.
