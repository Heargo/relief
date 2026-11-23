# U27 Masquer des éléments de la carte

Status: needs-triage
Type: task
Blocked by: U13
UI: oui
Doc: docs/user `map` (masquer des éléments)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 (`quicknotes.md`) : certains modules (générés, tests, outillage) encombrent la carte et ne servent jamais ; U13 ne masque que les dépendances externes.

## À faire

- Menu contextuel d'un nœud (clic droit) : **Masquer** ; le nœud, ses descendants et leurs arêtes disparaissent, la disposition se refait sans eux.
- Section « Masqués » de la barre de gauche (sous Affichage) : la liste, chaque élément réaffichable, et « Tout réafficher ».
- Masquage enregistré par dépôt (`.relief/state/view.json`, cas d'usage `Session::view_state` et commandes Tauri), toutes plages confondues.
- En relecture, un nœud masqué qui contient des changements reste compté dans la carte de la PR et dans l'ordre de lecture, avec la mention « masqué » ; le sélectionner depuis l'ordre de lecture le réaffiche.

## Critères d'acceptation

- [ ] Test du cas d'usage : l'état est relu après réouverture de la `Session`.
- [ ] e2e acme-shop : masquer `packages/db` le retire de la carte avec ses arêtes, le réafficher depuis la section le remet.

## Questions ouvertes

- Masquer par motif (`**/__generated__/**`) : dans `relief.config.yaml` (exclusions, A01) ou dans l'UI ?
