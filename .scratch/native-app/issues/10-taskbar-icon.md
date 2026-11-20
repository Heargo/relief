# N10 Icône cassée dans le gestionnaire de tâches

Status: needs-triage
Type: bug
Blocked by: aucun
UI: non
Doc: aucune

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 : sous CachyOS (KDE, Wayland), la fenêtre de relief apparaît dans la barre des tâches avec une icône générique au lieu de celle de l'app.

## Piste

Le paquet installe bien `usr/share/icons/hicolor/256x256/apps/relief.png` et `relief.desktop` (`Icon=relief`, `StartupWMClass=relief`). Sous Wayland, la barre des tâches associe la fenêtre au `.desktop` par l'`app_id`, qui pour GTK/Tauri vient probablement de l'identifiant `dev.relief.app` : il ne correspond pas à `relief.desktop`. À vérifier (`app_id` réel de la fenêtre), puis aligner l'un sur l'autre (renommer le `.desktop` en `dev.relief.app.desktop`, ou fixer l'`app_id`). Ajouter aussi les tailles 32, 48 et 128 px et l'icône de fenêtre (`set_icon`) pour le binaire lancé hors paquet.

## Critères d'acceptation

- [ ] Après installation du paquet, l'icône de relief s'affiche dans la barre des tâches KDE sous Wayland et sous X11.
- [ ] Lancé hors paquet (`just dev`), la fenêtre porte son icône.
