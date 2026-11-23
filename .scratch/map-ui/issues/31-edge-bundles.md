# U31 Faisceaux d'arêtes et ports d'entrée

Status: ready-for-agent
Type: task
Blocked by: U30
UI: oui
Doc: docs/user `map` (arêtes)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Une étoile de 30 arêtes vers un même fichier trace 30 lignes qui traversent la carte.

## Comportement

- Les arêtes qui entrent dans une même boîte par le même côté convergent vers un **port** sur ce côté ; à partir d'une distance de la boîte, elles partagent un tronc. Même chose en sortie.
- Le tronc porte la pastille du nombre d'arêtes (et `+N` nouvelles en relecture) ; la couleur du tronc est celle du statut majoritaire, avec un liseré si les statuts sont mêlés.
- Une arête survolée ou sélectionnée est tracée seule, en entier, par-dessus le faisceau ; le hit-test touche l'arête individuelle près de ses extrémités, le faisceau sur le tronc (sélection du faisceau : l'inspecteur liste ses arêtes).
- Seuil : faisceau à partir de 3 arêtes vers la même boîte et le même côté.

## Critères d'acceptation

- [ ] Logique : ports et troncs déterministes, faisceaux à partir de 3 arêtes.
- [ ] Peintre : tronc commun + branches.
- [ ] e2e : la scène expose les faisceaux (`bundles`) ; sélection d'un faisceau ; survol d'une arête du faisceau.
- [ ] `just bench-ui` sans régression.
- [ ] Doc `map` FR/EN.
