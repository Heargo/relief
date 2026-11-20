# R09 Notes de relecture ancrées sur la carte

Status: needs-triage
Type: task
Blocked by: R05
UI: oui
Doc: docs/user `review` (notes de relecture)

Spec: `../spec.md` (Phase 13)

## Constat

Retour du 2026-11-20 (`quicknotes.md`) : en relecture, rien ne garde ce qu'on a pensé en lisant un nœud. Le « vu » dit qu'on l'a lu, pas ce qu'on en pense ni ce qu'il reste à vérifier.

## À faire

- Une note s'ancre sur un nœud (symbole, fichier, module) ou une arête, et facultativement sur une ligne du diff ; elle a un type : **note**, **question**, **à corriger**, et un état ouverte / réglée.
- Cas d'usage `Session::review_notes` (lire, ajouter, modifier, supprimer) et commandes Tauri ; les notes sont enregistrées avec l'état « vu », par dépôt et par plage (`.relief/state/review/`, ADR 0007).
- UI : bouton « Ajouter une note » et touche `c` dans l'inspecteur et sur une ligne du diff ; badge sur le nœud (compte des notes ouvertes, couleur du type le plus grave), qui remonte dans les boîtes fermées comme « x/y vus » ; section **Notes** dans la barre de gauche (filtrable par type et état), un clic sélectionne et cadre le nœud.
- Une note dont le nœud a disparu (rechargement du working tree) reste listée, marquée « nœud disparu ».

## Critères d'acceptation

- [ ] Test du cas d'usage : une note ajoutée sur acme-shop est relue après réouverture de la `Session` ; une autre plage n'a pas de notes.
- [ ] e2e : ajouter une question sur `SessionStore.refresh` ; le badge apparaît sur le nœud et sur sa boîte fermée ; la section Notes la liste et un clic la cadre.

## Questions ouvertes

- Une note ancrée sur une ligne suit-elle la ligne quand le working tree change (ancrage par contenu), ou reste-t-elle sur le symbole ?
- Partager les notes avec d'autres relecteurs (fichier versionné, `git notes`) : hors de ce ticket, voir R10 pour l'export.
