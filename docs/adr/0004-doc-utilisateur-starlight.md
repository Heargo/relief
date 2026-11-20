# 0004. Doc utilisateur : Starlight, FR + EN, captures générées

Status: accepted (2026-11-18) ; amendé par 0006 (2026-11-19) : la doc est embarquée dans l'app au lieu d'être servie par `relief serve`, et ses captures passent par WebdriverIO

## Décision

- `docs/user/` est un site Starlight (Astro), français à la racine et anglais sous `en/`, comme rpg-manager-front.
- Il est servi par `relief serve` sous `/docs` (lien « Aide » de l'UI) et publiable seul (site statique).
- Les captures viennent de WebdriverIO (app native) sur la fixture acme-shop (`just docs-shots`), jamais à la main, pour rester à jour avec l'UI.
- La doc développeur reste dans le dépôt : `docs/dev/rules.md`, `docs/adr/`, le contrat JSON généré (`docs/contract/`) et `cargo doc`.

## Conséquences

Chaque ticket qui change ce que voit ou tape l'utilisateur met à jour sa page dans les deux langues (étape 8 de `docs/dev/workflow.md`).
