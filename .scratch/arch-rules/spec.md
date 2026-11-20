# Spec : règles d'architecture (A)

Status: ready-for-agent
Date: 2026-11-18

## But

Dire si une PR respecte l'architecture voulue, dans la carte (`docs/product/BRAINSTORM.md` « Règles d'architecture déclaratives » ; maquette, section « Règles d'architecture »).

## Décisions

- Fichier `relief.config.yaml` à la racine du dépôt analysé, lu **à la ref head** (les règles de la PR s'appliquent à la PR).
- Règle : `id`, `description`, `from` (glob de chemins), `deny` (glob de chemins), `kinds` optionnel (défaut : `imports, calls, references, renders` ; `http` et `depends_on` exclus). `**` = n'importe quels dossiers, `*` = un segment.
- Évaluation sur chaque arête fine du graphe head : chemin du fichier source contre `from`, du fichier cible contre `deny`.
- Violation **introduite** si l'arête n'existe pas dans la base (arête `added`), **existante** sinon (dette, affichée discrètement).
- Les violations sont calculées par le cœur, exposées par `Session::review_summary` et la commande Tauri `review_summary`, et affichées dans la carte (A03). Il n'y a pas de sous-commande `relief check` : relief ne s'utilise que par l'app (décision de N09), donc pas de contrôle en CI.
- Le même fichier accueille plus tard `exclude:` (fichiers à ignorer) et des alias de modules.
