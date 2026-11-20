# Spec : paquets d'installation (P)

Status: ready-for-agent
Date: 2026-11-20

## But

Installer relief sans compiler le dépôt à la main : un fichier à télécharger et lancer sous Linux. `cargo install` reste la voie décrite par « Commencer » tant que les paquets n'existent pas.

## Décisions

- Le bundler de Tauri (`tauri build`) produit le `.deb` et l'AppImage, sans outil de packaging tiers. Exception décidée le 2026-11-20 : un PKGBUILD (`makepkg`, l'outil natif d'Arch) reprend le contenu du `.deb` pour Arch et CachyOS.
- Linux d'abord : `.deb` et AppImage. Les e2e tournent déjà sous Linux.
- `.dmg` (macOS) et `.msi` (Windows) restent dans « Plus tard » de la roadmap : `tauri-driver` ne tourne pas sous macOS, et il n'y a pas de machine pour les tester.
- Le binaire installé s'appelle `relief` ; il ouvre `relief [path] [range]` comme en développement.
