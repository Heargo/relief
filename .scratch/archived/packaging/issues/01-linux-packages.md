# Paquets `.deb` et AppImage

Status: resolved
Type: task
Blocked by: L01
UI: non
Doc: docs/user `getting-started` (installation)

Spec: `../spec.md`

## À faire

- `src/interfaces/relief-desktop/tauri.conf.json` : `bundle.active` à `true`, cibles `deb` et `appimage`, métadonnées (nom, version du workspace, description, catégorie, licence), icônes.
- Dépendance déclarée dans le `.deb` : `libwebkit2gtk-4.1-0`. L'AppImage embarque ce qu'il lui faut ; noter dans la doc ce qu'elle exige de l'hôte.
- `just package` : construit l'UI, la doc embarquée puis les paquets ; sortie dans `target/release/bundle/` ; affiche les chemins et les tailles.
- Page « Commencer » (FR et EN) : installer par le `.deb` ou l'AppImage, `cargo install` devient l'option « depuis les sources ».
- Vérification manuelle dans une machine propre ou un conteneur : installer le `.deb`, lancer `relief` sur une fixture. Les résultats vont dans `## Answer`.

## Critères d'acceptation

- [x] `just package` produit un `.deb` et un AppImage.
- [x] `dpkg-deb -I` sur le `.deb` : paquet `relief`, version du workspace, dépendance `libwebkit2gtk-4.1-0`.
- [x] L'AppImage lancée avec `relief [path]` sur la fixture acme-shop ouvre la carte (vérifié à la main sous Xvfb ou en session graphique, noté dans `## Answer`).
- [x] La doc embarquée est présente dans le paquet (lien Aide fonctionnel).
- [x] `just docs-build` passe ; la page « Commencer » est à jour en FR et EN.

## Décision (utilisateur, 2026-11-20)

- Formats : `.deb` (Debian, Ubuntu) et AppImage (toutes distributions) par le bundler de Tauri, plus un paquet natif pour Arch/CachyOS : un PKGBUILD dans `packaging/arch/`. Pas de `.rpm` pour l'instant.
- Le PKGBUILD reprend le contenu du `.deb` construit par `just package` (schéma des paquets `-bin` d'Arch) : `makepkg` ne télécharge ni crates ni paquets npm, et le paquet s'installe avec `pacman -U` (sudo, tapé par l'utilisateur).
- Téléchargement autorisé : linuxdeploy et ses plugins par le bundler AppImage de Tauri (`~/.cache/tauri`). Pas de conteneur : le `.deb` est vérifié en lisant son contenu (`ar`, `tar`), sans `dpkg-deb` (la machine est sous CachyOS).

## Baseline

`just test-summary` (develop, 4fff9b7) : cargo 569 passed, 0 failed ; web 476 passed, 0 failed.

## Seams

- **Script de vérification des paquets (`just package-check`, par exemple `scripts/check-packages.sh`)** lancé après `just package` : attrape un `.deb` dont le `control` dit paquet `relief`, version du workspace et dépendance `libwebkit2gtk-4.1-0` (lu par `ar` et `tar`), la doc embarquée présente dans le binaire du paquet, une AppImage exécutable, et un PKGBUILD qui produit un `relief-*.pkg.tar.zst` contenant `usr/bin/relief` ; rate le lancement graphique, vérifié à la main sous Xvfb (AppImage sur acme-shop) et noté dans `## Answer`.

## Red

- Fichiers de test : `scripts/check-packages.sh`, recette `package-check` dans `justfile`
- Lancer : `just package-check`
- En échec : 3 vérifications sur 4 échouent aujourd'hui (le script sort en 1), chacune avec son message :
  - `.deb` — aucun `.deb` dans `target/release/bundle/deb` ; Package/Version/Depends et doc embarquée (chaîne `/docs/getting-started/index.html` cherchée par `grep -a` dans `usr/bin/relief` extrait du `.deb`) ne sont vérifiés qu'une fois le `.deb` produit
  - AppImage — aucune AppImage exécutable dans `target/release/bundle/appimage`
  - PKGBUILD — `packaging/arch/PKGBUILD` absent ; une fois présent, le script copie le dossier dans un répertoire temporaire et lance `makepkg -f` avec `RELIEF_BUNDLE_DIR` pointant sur `target/release/bundle` (le PKGBUILD doit y chercher le `.deb`), puis exige `usr/bin/relief` dans `relief-*.pkg.tar.zst`

## Green

- Fichiers : `src/interfaces/relief-desktop/tauri.conf.json`, `justfile` (recette `package`), `packaging/arch/PKGBUILD`
- Changement : `bundle.active` à true, cibles `deb` et `appimage`, métadonnées, dépendance `libwebkit2gtk-4.1-0`. `just package` construit l'UI, copie la doc embarquée, lance `tauri build` et affiche les tailles. Le PKGBUILD extrait le `.deb` de `$RELIEF_BUNDLE_DIR/deb` et déclare `webkit2gtk-4.1` et `gtk3`. La chaîne de détection de la doc est correcte et inchangée.
- Suite : cargo 569 passed, 0 failed ; web 476 passed, 0 failed (identique à la baseline). `just package` produit le `.deb` (10 Mo) et l'AppImage (115 Mo). AppImage sous Xvfb sur acme-shop : le processus vit après 12 s, la carte s'affiche (capture lue), seuls des avertissements MESA/DRI3 sont écrits.
- Questions ouvertes : `just package-check` échoue encore avec le script indexé, à cause de deux bugs du script (laissé intact). (1) Le `.deb` de Tauri a des entrées sans préfixe `./` (`control`, `usr/bin/relief`) alors que le script extrait `./control` et `./usr/bin/relief` : les 4 vérifications `.deb` échouent. (2) `tar -tf pkg | grep -qx` sous `pipefail` échoue par SIGPIPE, d'où un faux échec du PKGBUILD. Une copie corrigée de ces deux points passe 6/6 (Package, Version, Depends, doc, AppImage, PKGBUILD), donc les paquets sont conformes. À corriger côté red.

## Answer

- Construit : `tauri.conf.json` (`bundle.active`, cibles `deb` et `appimage`, catégorie DeveloperTool, licence MIT du workspace, descriptions, dépendance `libwebkit2gtk-4.1-0` du `.deb`) ; `just package` (UI, doc embarquée, `tauri build` avec `NO_STRIP=true` car le `strip` de linuxdeploy échoue sur les binaires récents, puis chemins et tailles) ; `packaging/arch/PKGBUILD` (paquet natif Arch/CachyOS qui reprend `relief_<version>_amd64.deb`, dépend de `webkit2gtk-4.1` et `gtk3`, `makedepends=('binutils')`, sans URL : le dépôt n'a pas de remote) ; `scripts/check-packages.sh` et `just package-check`.
- Paquets produits : `relief_0.1.0_amd64.deb` (10 Mo), `relief_0.1.0_amd64.AppImage` (115 Mo), `relief-0.1.0-1-x86_64.pkg.tar.zst` (par `makepkg`).
- Vérifié : `just package-check` (6 sur 6) : `.deb` lu par `ar`/`tar` (`Package: relief`, `Version: 0.1.0`, `Depends` avec `libwebkit2gtk-4.1-0`), doc embarquée dans le binaire du `.deb` (lien Aide), AppImage exécutable, PKGBUILD qui produit un paquet avec `usr/bin/relief`. AppImage lancée sous Xvfb sur acme-shop (`APPIMAGE_EXTRACT_AND_RUN=1`) : processus vivant après 12 s, capture montrant la carte. `just test-summary` cargo 569/0, web 476/0 (inchangé) ; `just lint` ; `just docs-build`.
- **Non vérifié** : l'installation du `.deb` sur une Debian ou une Ubuntu propre (pas de conteneur, choix de l'utilisateur ; pas de `dpkg-deb` sous CachyOS) ; `sudo pacman -U` du paquet Arch (sudo, laissé à l'utilisateur).
- Décisions : formats `.deb`, AppImage et PKGBUILD (pas de `.rpm`), spec amendé ; seul téléchargement : linuxdeploy et ses plugins par le bundler Tauri. L'orchestrateur a corrigé deux défauts du script (entrées du `.deb` sans `./`, faux échec SIGPIPE) et retiré une URL inventée du PKGBUILD.
- Review : « fix first » (exigence glibc absente de la doc, `## Answer` manquant), corrigé ; remarques appliquées (commentaire `NO_STRIP`, `.deb` choisi par sa version, `binutils`, formulation « construits par »).
- Doc : section « Installer » de `getting-started` (FR et EN) : `.deb`, paquet Arch, AppImage et ce qu'elle exige de l'hôte, glibc au moins aussi récente que celle de la machine de build (2.44 ici).
- Suivis : `pkgver` du PKGBUILD et version de `tauri.conf.json` vérifiés contre le workspace par le script ; fonction `extract` commune dans le script ; `.rpm` si besoin ; build sur une glibc plus ancienne pour élargir la compatibilité.
