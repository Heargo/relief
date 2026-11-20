# R11 Suivre les dépendances transitives sans se perdre

Status: needs-triage
Type: task
Blocked by: R05, R04
UI: oui
Doc: docs/user `review` (ordre de lecture, rayon d'impact)

Spec: `../spec.md` (Phase 13)

## Constat

Retour du 2026-11-20 (`quicknotes.md`) : en relecture, on suit un appelant, puis l'appelant de l'appelant, et on ne sait plus d'où on vient ni ce qu'on a déjà vérifié hors du diff.

## À faire

- **Où suis-je** : en relecture, l'inspecteur dit si le nœud sélectionné est dans le diff ou non, et s'il ne l'est pas, à combien de sauts il est de l'entrée de lecture en cours (« hors diff · appelant à 2 sauts de `invoice.ts` (3/14) »).
- **Revenir** : touche `r` et bouton « Revenir à l'entrée 3/14 » : sélectionne et cadre l'entrée de lecture en cours (la dernière sélectionnée depuis l'ordre de lecture, ou par `n` / `p`).
- **Vérifié** : un nœud hors du diff (un appelant de l'impact, par exemple) se marque « vérifié » (touche `v`, comme « vu ») ; même stockage que « vu » ; les lignes du rayon d'impact et les nœuds de la carte le montrent (coche, nœud atténué) ; le rayon d'impact compte « 4/8 appelants vérifiés ».

## Critères d'acceptation

- [ ] Test du cas d'usage : un nœud hors diff marqué vérifié est relu après réouverture ; il ne compte pas dans la progression « x/y vus » du diff.
- [ ] e2e acme-shop : depuis l'entrée `SessionStore.refresh`, sélectionner `renewSubscriptions` dans l'impact affiche « hors diff », `v` le marque vérifié, `r` revient à `SessionStore.refresh`.
