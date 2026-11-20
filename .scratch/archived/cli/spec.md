# Spec : CLI et serveur (C)

Status: ready-for-agent
Date: 2026-11-18

## But

La porte d'entrée de relief : une CLI qui marche dans n'importe quel dépôt git, et `relief serve` qui ouvre la carte dans le navigateur (`docs/product/BRAINSTORM.md`, tableau des commandes).

## Décisions

- `clap` ; sous-commandes `show`, `diff`, `serve`, `check` (A02). Options globales : `--repo <chemin>` (défaut : dossier courant), `--no-cache`, `--json`, `-q/-v`.
- `relief show [ref]` (défaut HEAD) : résumé texte (systèmes, fichiers, symboles, langages, avertissements) ou snapshot complet en `--json`.
- `relief diff [range]` : sans argument WORKTREE vs HEAD, `--staged` INDEX vs HEAD, `A...B`, `A..B`. Sortie texte : résumé structurel (changements, signatures, couplages, format seul) ; `--json` : le `GraphDiff`.
- `relief serve [range]` : axum sur `127.0.0.1` (port 7878 par défaut, `--port`, `--no-open`), UI et doc embarquées (`rust-embed`), API JSON sous `/api`. Le serveur ne sert que des fichiers embarqués et des données du dépôt ouvert ; aucun chemin reçu n'est utilisé pour lire le disque.
- Codes de sortie : 0 succès, 1 problème trouvé (`check`), 2 erreur d'usage ou dépôt invalide.
- Messages en anglais.
