# N11 Détacher un panneau dans sa propre fenêtre

Status: needs-triage
Type: task
Blocked by: N05
UI: oui
Doc: docs/user `map` (panneaux et multi-écran)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 (`quicknotes.md`) : sur deux écrans, on veut la carte en plein écran sur l'un et le code (inspecteur, diff) sur l'autre.

## À faire

- Maquette d'abord (comme U23) : bouton « Détacher » dans l'en-tête des panneaux gauche et droit, ce qui reste à la place du panneau détaché, comment le rattacher.
- Une seconde fenêtre Tauri (`WebviewWindow`) qui charge l'UI sur une route du panneau ; une seule `Session` côté cœur, partagée par les deux fenêtres.
- La sélection, la plage, les calques et l'état « vu » restent synchronisés entre fenêtres (événements Tauri émis par l'état de l'UI ou par le cœur, à trancher dans la maquette).
- Fermer la fenêtre détachée rattache le panneau ; position et taille des fenêtres mémorisées.

## Critères d'acceptation

- [ ] e2e (WebdriverIO, deux fenêtres) : détacher le panneau droit, sélectionner un nœud dans la carte : son inspecteur s'affiche dans la fenêtre détachée ; la fermer rattache le panneau.

## Questions ouvertes

- `tauri-driver` sait-il piloter deux fenêtres ? Sinon, test du cas d'usage de synchronisation seul et vérification manuelle.
