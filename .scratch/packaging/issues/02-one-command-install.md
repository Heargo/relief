# P02 Construire et installer relief en une commande, sans droits admin

Status: ready-for-agent
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
- **Options** : `--dry-run` (affiche l'OS détecté et chaque étape, sans rien construire ni installer), `--uninstall` (retire exactement ce que l'installation a posé), `--help`.
- **PATH** : si `~/.local/bin` (ou le dossier Windows) n'est pas dans le `PATH`, le script le dit et donne la ligne à ajouter ; il ne modifie pas les fichiers du shell.
- À la fin : `relief --version` lancé depuis le dossier d'installation, et le chemin installé.

## Critères d'acceptation

- [ ] Sous Linux, `./install.sh` dans un `HOME` temporaire construit dans Docker et installe : `$HOME/.local/bin/relief --version` affiche la version du workspace, et `relief <fixture>` ouvre la carte (vérifié sous Xvfb).
- [ ] `./install.sh --uninstall` retire tout ce qui a été posé, et rien d'autre.
- [ ] `--dry-run` sur les trois OS (forcés par `RELIEF_INSTALL_OS`) liste des chemins sous le dossier de l'utilisateur uniquement, sans `sudo`.
- [ ] Le build croisé Windows produit un installeur NSIS `currentUser` (vérifié sur Linux ; l'installation sous Windows est notée « non vérifiée » si aucune machine Windows n'est disponible).
- [ ] macOS : `--dry-run` correct ; le build natif est noté « non vérifié » s'il n'y a pas de Mac.
- [ ] Page « Commencer » (FR et EN) : la commande unique en tête de la section « Installer » ; `just docs-build` passe.

## Seams (proposés)

- **Script de test shell (`scripts/test-install.sh`, recette `just install-check`)** : `--dry-run` pour chaque OS forcé (étapes et chemins attendus, jamais `sudo`, jamais hors de `$HOME`), `--help`, refus propre sans Docker (`PATH` sans `docker`). Attrape la détection et le plan ; rate le vrai build.
- **Installation réelle sous Linux dans un `HOME` temporaire** (même script, étape lente, derrière `RELIEF_INSTALL_CHECK_FULL=1`) : build Docker, `relief --version`, lancement sous Xvfb sur acme-shop, puis `--uninstall` et vérification qu'il ne reste rien. Attrape le build et l'installation ; rate Windows et macOS.
- **Build croisé Windows** (même script, derrière `RELIEF_INSTALL_CHECK_WINDOWS=1`) : l'installeur NSIS existe et déclare `currentUser`. Rate l'installation réelle sous Windows.
