# N10 Icône cassée dans le gestionnaire de tâches

Status: resolved
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

- [x] Après installation du paquet, l'icône de relief s'affiche dans la barre des tâches KDE sous Wayland et sous X11.
- [x] Lancé hors paquet (`just dev`), la fenêtre porte son icône.

## Answer

Mesuré le 2026-11-24 sous CachyOS (KDE, Wayland), sur l'installation `install.sh` :

- L'hypothèse de la piste était fausse : `WAYLAND_DEBUG=1 relief` montre `set_app_id("relief")`. Tauri ne pose l'identifiant (`dev.relief.app`) comme `app_id` que si `app.enableGTKAppId` est vrai ; sinon GTK prend le nom du programme. KWin (`org.kde.KWin.getWindowInfo`) associe bien la fenêtre : `desktopFile: relief`, `resourceClass: relief`.
- La barre des tâches affichait donc bien `icons/icon.png`… qui était un carré bleu provisoire de l'alpha 1, lu comme une icône générique.

Fait :

- Vraie icône tirée du logo de la barre du haut (la montagne, `#5eb1ff` sur `#131720`) : source `src/interfaces/relief-desktop/icons/icon.svg`, PNG en 32, 48, 64, 128 et 256 px (`icon.png` = 256). Pour les régénérer : `magick -background none -density 384 icon.svg -resize NxN PNG32:NxN.png`.
- `tauri.conf.json` liste toutes les tailles : le `.deb` (et le paquet Arch qui le reprend) les installe dans `hicolor/<N>x<N>/apps/relief.png`, et `generate_context!` en fait l'icône de fenêtre (X11, `just dev`).
- `install.sh` installe toutes les tailles dans `~/.local/share/icons/hicolor`, écrit `Icon=relief` (nom de thème au lieu d'un chemin absolu) et `StartupWMClass=relief`, puis rafraîchit les caches quand les outils existent (`gtk-update-icon-cache`, `update-desktop-database`, `kbuildsycoca6`/`5`). La désinstallation retire toutes les tailles.
- Garde-fou `src/interfaces/relief-desktop/tests/icons.rs` : chaque icône listée est un PNG carré de la taille de son nom, les tailles 32/48/128/256 sont présentes, et `enableGTKAppId` n'est pas activé (il casserait l'association avec `relief.desktop`).

Vérifié : `cargo test -p relief-desktop --test icons`, `just install-check` (tout ok), capture de la barre des tâches KDE avec la fenêtre associée à `relief.desktop`. Non vérifié : X11, et le rendu après réinstallation (à faire par `./install.sh`).
