# P02 Construire et installer relief en une commande, sans droits admin

Status: resolved
Type: task
Blocked by: P01
UI: non
Doc: `docs/user` `getting-started` (section « Installer », FR et EN)

Spec: aucune (demande de l'utilisateur, 2026-11-23)

## Constat

Installer relief depuis un clone demande aujourd'hui Rust, Node, les paquets `-dev` de webkit2gtk, `just package`, puis `sudo apt install` ou `sudo pacman -U`. On veut une seule commande qui construit l'app depuis la branche courante et l'installe pour l'utilisateur, sur n'importe quel OS, sans compte admin, Docker étant disponible.

## Comportement

- **Une commande depuis la racine du clone** : `./install.sh` (Linux, macOS, et Windows sous Git Bash) ; `.\install.ps1` sous PowerShell, qui fait la même chose. L'OS et l'architecture sont détectés (`uname`, ou `$env:OS` / `PROCESSOR_ARCHITECTURE`) ; `RELIEF_INSTALL_OS=linux|macos|windows` force la détection (tests).
- **Ce qui est construit** : le checkout courant, tel quel (modifications non commitées comprises). Le script affiche la branche, le commit et `dirty` s'il y a des modifications, avant et après.
- **Sans droits admin** : aucun `sudo`, aucune écriture hors du dossier de l'utilisateur. Si une étape en aurait besoin, le script s'arrête et dit pourquoi.
- **Linux** : build dans un conteneur Docker (image du dépôt, base Ubuntu 22.04 pour une glibc ancienne : glibc 2.35, ce qui lève la limite de P01), qui produit l'AppImage ; cache cargo et npm dans des volumes Docker nommés, pour que le second build soit rapide. L'installation extrait l'AppImage (pas besoin de FUSE) dans `~/.local/share/relief/`, avec un lanceur `~/.local/bin/relief`, un `.desktop` dans `~/.local/share/applications/` et l'icône dans `~/.local/share/icons/`. Le conteneur tourne avec l'uid de l'utilisateur, pour que les fichiers produits lui appartiennent.
- **Windows** : build croisé dans un conteneur Linux (Docker Desktop) vers `x86_64-pc-windows-msvc` avec `cargo-xwin`, installeur NSIS en mode `currentUser` (le défaut de Tauri) ; le script le lance en silencieux (`/S`), ce qui installe dans `%LOCALAPPDATA%` sans élévation. WebView2 est fourni par Windows 10 et 11.
- **macOS** : Docker ne sait pas produire d'app macOS. Build natif (`tauri build --bundles app`) si `cargo`, `node` et les Command Line Tools sont présents, sinon arrêt avec la liste de ce qui manque et comment l'installer sans admin (rustup, Node en archive utilisateur). Installation de `relief.app` dans `~/Applications/` et lien `~/.local/bin/relief`.
- **Licence MSVC (Windows)** : `cargo-xwin` télécharge le CRT MSVC et le SDK Windows sous la licence de Microsoft ; le script l'affiche et demande l'accord (ou `--accept-msvc-license`), sans jamais l'accepter tout seul.
- **Options** : `--dry-run` (affiche l'OS détecté et chaque étape, sans rien construire ni installer), `--uninstall` (retire exactement ce que l'installation a posé), `--help`.
- **PATH** : si `~/.local/bin` (ou le dossier Windows) n'est pas dans le `PATH`, le script le dit et donne la ligne à ajouter ; il ne modifie pas les fichiers du shell.
- À la fin : `relief --version` lancé depuis le dossier d'installation, et le chemin installé.

## Critères d'acceptation

- [x] Sous Linux, `./install.sh` dans un `HOME` temporaire construit dans Docker et installe : `$HOME/.local/bin/relief --version` affiche la version du workspace, et `relief <fixture>` ouvre la carte (vérifié sous Xvfb).
- [x] `./install.sh --uninstall` retire tout ce qui a été posé, et rien d'autre.
- [x] `--dry-run` sur les trois OS (forcés par `RELIEF_INSTALL_OS`) liste des chemins sous le dossier de l'utilisateur uniquement, sans `sudo`.
- [ ] Le build croisé Windows (**non vérifié** : il demande d'accepter la licence MSVC, laissé à l'utilisateur) produit un installeur NSIS `currentUser` (vérifié sur Linux ; l'installation sous Windows est notée « non vérifiée » si aucune machine Windows n'est disponible).
- [x] macOS : `--dry-run` correct ; le build natif est noté « non vérifié » s'il n'y a pas de Mac.
- [x] Page « Commencer » (FR et EN) : la commande unique en tête de la section « Installer » ; `just docs-build` passe.

## Baseline

`2268819` : cargo 654 ; web 853 ; e2e 154 passés / 1 ignoré.

## Seams

- **Script de test shell (`scripts/test-install.sh`, recette `just install-check`)** : `--dry-run` pour chaque OS forcé (étapes et chemins attendus, jamais `sudo`, jamais hors de `$HOME`), `--help`, refus propre sans Docker (`PATH` sans `docker`). Attrape la détection et le plan ; rate le vrai build.
- **Installation réelle sous Linux dans un `HOME` temporaire** (même script, étape lente, derrière `RELIEF_INSTALL_CHECK_FULL=1`) : build Docker, `relief --version`, lancement sous Xvfb sur acme-shop, puis `--uninstall` et vérification qu'il ne reste rien. Attrape le build et l'installation ; rate Windows et macOS.
- **Build croisé Windows** (même script, derrière `RELIEF_INSTALL_CHECK_WINDOWS=1` et `--accept-msvc-license`, lancé seulement avec l'accord de l'utilisateur) : l'installeur NSIS existe et déclare `currentUser`. Rate l'installation réelle sous Windows.

## Red

- Fichiers de test : `scripts/test-install.sh`, recette `install-check` dans `justfile`
- Lancer : `just install-check` (partie rapide) ; `RELIEF_INSTALL_CHECK_FULL=1 just install-check` (build Docker réel + Xvfb + `--uninstall`) ; `RELIEF_INSTALL_CHECK_WINDOWS=1 just install-check` (build croisé NSIS)
- En échec : 1 script (toutes les parties) — `install.sh` absent ou non exécutable à la racine ; le script s'arrête dès ce premier constat.
- Contrat du `--dry-run` (stdout, une ligne par élément, `RELIEF_INSTALL_OS` force l'OS ; ne contient jamais `sudo` ; n'écrit rien) :
  - `os: linux|macos|windows`, `arch: <x>`, `branch: <nom>`, `commit: <sha court>[ dirty]`
  - `step: <nom>` : linux `docker-build`, `extract-appimage`, `install-launcher`, `install-desktop`, `install-icon` ; macos `native-build`, `install-app`, `link-bin` ; windows `msvc-license`, `docker-build`, `run-installer`
  - `install: <chemin absolu>` pour chaque chemin écrit, tous sous `$HOME` : linux `$HOME/.local/share/relief`, `$HOME/.local/bin/relief`, `$HOME/.local/share/applications/relief.desktop`, `$HOME/.local/share/icons/...` ; macos `$HOME/Applications/relief.app`, `$HOME/.local/bin/relief` ; windows `$LOCALAPPDATA/relief` (le test fixe `LOCALAPPDATA=$HOME/AppData/Local`)
- Autres contrats : `--help` (exit 0) cite `--dry-run`, `--uninstall`, `--help` ; sans `docker` dans le `PATH` (hors dry-run), exit non nul, stderr cite « docker », rien écrit dans `$HOME` ; aucun appel `sudo` dans `install.sh` (hors commentaires) ; `--uninstall` ne laisse aucun fichier ni lien dans le `HOME` temporaire ; `RELIEF_INSTALL_BUILD_ONLY=1` construit sans installer (utilisé par la partie Windows) et l'installeur sort dans `target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe` ; `installMode` absent ou `currentUser` dans `tauri.conf.json`.
- Non lancé : parties `FULL` et `WINDOWS`.

## Green

- Fichiers : `install.sh`, `packaging/docker/Dockerfile` (cibles `linux` et `windows`), `packaging/docker/build.sh`
- Changement : `install.sh` (sh POSIX) détecte l'OS, supporte `--dry-run`, `--uninstall`, `--accept-msvc-license`, `--help`, `RELIEF_INSTALL_BUILD_ONLY`. Linux : build Docker (Ubuntu 22.04, Rust 1.98, Node 22.23, uid/gid de l'utilisateur, volumes `relief-build-cache` et `relief-build-work`), extraction de l'AppImage, lanceur, `.desktop`, icône. Windows : cargo-xwin + NSIS dans l'image `windows`, licence MSVC demandée sauf `--accept-msvc-license`. macOS : build natif après contrôle des prérequis. `--uninstall` retire aussi les données de la webview (`~/.local/share/dev.relief.app`, `~/.cache/{relief,dev.relief.app}`).
- Suite : `just install-check` rapide : tout passe. `RELIEF_INSTALL_CHECK_FULL=1` : build, `--version`, Xvfb, `--uninstall` passent ; un seul échec, « left after --uninstall » : `~/.cache/mesa_shader_cache/{index,marker}`. Aucun code Rust/UI touché, `just test-summary` non relancé ; `just lint` propre. Partie Windows non lancée ; non vérifiés : cargo-xwin (version 0.18.0, variable `XWIN_ACCEPT_LICENSE`, génération de l'`.ico`), installation Windows, build macOS.
- Questions ouvertes : le test FULL est faux sur un point : le cache mesa est créé par Xvfb lui-même (`HOME=x xvfb-run -a true` le crée), pas par relief, et n'appartient pas à relief ; le supprimer dans `--uninstall` violerait « rien d'autre ». Le test devrait ignorer `.cache/mesa_shader_cache` (je n'ai pas touché au test).

## Review

- Verdict : fix first
- Must fix :
  - install.sh:94-112 — `--dry-run --uninstall` supprime pour de vrai (l'uninstall passe avant le dry-run) — traiter `dry` avant, ou afficher `would remove`.
  - install.sh:106,273 et install.ps1:44 — sous Git Bash, MSYS convertit `/S` en chemin (`S:\`) — `MSYS_NO_PATHCONV=1` (ou `//S`) devant ces deux appels.
  - install.sh (add_path_hint, Windows) — le spec demande l'indication PATH aussi pour le dossier Windows ; ni install.sh ni install.ps1 ne la donnent (et `relief.exe --version`, appli GUI, n'affiche rien) — ajouter la ligne PATH ou la note.
- Consider :
  - packaging/docker/build.sh:11 — `tar -xf` sans suppression : un fichier supprimé du checkout reste dans `relief-build-work` ; volumes nommés aussi partagés entre clones — vider les sources suivies avant copie ou suffixer les volumes par un hash du chemin.
  - packaging/docker/build.sh:23 — `XWIN_ACCEPT_LICENSE=1` en dur : la licence n'est gardée que par install.sh ; la passer par `-e` depuis install.sh après accord.
  - install.sh:97,101 — l'uninstall retire `~/.local/bin/relief` même s'il n'est pas le nôtre : vérifier la cible ; les dossiers vides (`icons/hicolor/...`) restent.
  - install.sh:183 — `mktemp -d` écrit dans `/tmp`, hors du dossier utilisateur ; utiliser un dossier sous `$share`.
  - install.sh:203 — `Exec=$launcher` non quoté (HOME avec espace).
  - install.sh:106, install.ps1:44 — l'uninstaller NSIS rend la main avant la fin : « removed » prématuré.
  - install.ps1:79 — `docker info *> $null` sous `$ErrorActionPreference='Stop'` peut lever dans PowerShell 5.1 ; encadrer par try/catch.
  - scripts/test-install.sh — aucun test du message de prérequis macOS manquants.

## Answer

- `install.sh` (sh POSIX, racine) et `install.ps1` (PowerShell) : détection de l'OS (`RELIEF_INSTALL_OS` pour forcer), branche / commit / `dirty` affichés, `--dry-run`, `--uninstall`, `--accept-msvc-license`, `--help`. Aucun `sudo`, tout sous le dossier de l'utilisateur ; temporaire sous `$HOME`.
- Linux : `packaging/docker/Dockerfile` (cible `linux` : Ubuntu 22.04, Rust 1.98.0, Node 22.23.5, webkit2gtk) et `packaging/docker/build.sh` ; conteneur lancé avec l'uid/gid de l'utilisateur, checkout monté en lecture seule et copié dans le volume `relief-build-work` (sources purgées avant copie, `target/` et `node_modules/` gardés), caches dans `relief-build-cache`. L'AppImage est extraite dans `~/.local/share/relief/` (pas de FUSE), lanceur `~/.local/bin/relief`, `.desktop` et icône.
- Windows : cible `windows` (cargo-xwin 0.18.0, NSIS), installeur `currentUser` lancé en `/S` (`MSYS_NO_PATHCONV` sous Git Bash), attente de la fin de l'uninstaller ; licence MSVC présentée et demandée, passée au conteneur seulement après accord.
- macOS : build natif après contrôle de `cargo`, `node` et des Command Line Tools (message qui dit ce qui manque) ; `relief.app` dans `~/Applications/`, lien `~/.local/bin/relief`.
- `--uninstall` ne retire que ce qui a été posé (le lanceur seulement s'il est le nôtre), plus les données de la webview de relief ; il retire aussi les dossiers XDG standard restés vides.
- Vérifié : `just install-check` (59 vérifications : dry-run des trois OS, `--help`, refus sans Docker, aucun `sudo`, dry-run de `--uninstall` sans effet, lanceur étranger gardé) ; `RELIEF_INSTALL_CHECK_FULL=1 just install-check` : vrai build Docker, `relief --version` = version du workspace, lancement sous Xvfb sur acme-shop, `--uninstall` sans reste (hors cache Mesa créé par Xvfb) ; `just lint` ; `just docs-build`.
- **Non vérifié** : build croisé et installation Windows (licence MSVC à accepter par l'utilisateur, pas de machine Windows) ; `install.ps1` (pas de `pwsh` ici, relu seulement) ; build macOS (pas de Mac).
- Doc : section « Installer » de `getting-started` (FR et EN), la commande unique en tête.
- Consider laissés : `--uninstall` retire `~/.local/bin` ou `~/.cache` s'ils sont vides (inoffensif) ; un test du message de prérequis macOS.
