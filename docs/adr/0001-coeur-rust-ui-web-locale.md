# 0001. Cœur en Rust, UI web servie en local

Status: superseded en partie par 0006 (2026-11-19) : diffusion en app native, sans serveur HTTP ; le cœur Rust, gix, tree-sitter et SQLite restent

## Contexte

relief doit lire des dépôts de toutes tailles (jusqu'aux monorepos), parser plusieurs langages et rester rapide en indexation incrémentale. Il faut aussi une UI riche (carte zoomable, panneaux) et une diffusion simple (un seul binaire).

## Décision

- Un binaire Rust `relief` : lecture git par `gix` (binaire `git` en repli), parsing par tree-sitter, cache SQLite, serveur HTTP `axum` sur `127.0.0.1`.
- Une UI web compilée et **embarquée dans le binaire** (`rust-embed`), ouverte dans le navigateur par `relief serve`.
- Le contrat adapter/index et le JSON de l'API sont sérialisés (serde + JSON Schema) : un adapter pourra devenir un processus séparé, et la même API servira plus tard l'extension VS Code et le serveur MCP.

## Conséquences

- Deux chaînes d'outils (cargo, npm) : `just` les orchestre.
- Les types TS de l'UI sont générés depuis le JSON Schema, pas écrits à la main.
