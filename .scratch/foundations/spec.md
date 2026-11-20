# Spec : fondations (F)

Status: ready-for-agent
Date: 2026-11-18

## But

Un dépôt où l'on peut développer relief ticket par ticket avec `docs/dev/workflow.md` : workspace Rust, UI Angular, `just`, dépôts de fixture déterministes, harnais e2e WebdriverIO + `tauri-driver`, site de doc utilisateur. Rien de visible pour l'utilisateur final, sauf la doc.

## Décisions

- Outils : `docs/dev/rules.md` (commandes), `docs/adr/0001` à `0004`.
- Les fixtures sont des définitions versionnées sous `tests/fixtures/<nom>/` ; le dépôt git est construit à la demande dans un dossier temporaire, jamais commité.
- Format d'une fixture : `tests/fixtures/<nom>/fixture.yaml` liste les commits dans l'ordre (`id`, `message`, `branch` optionnelle, `date`) ; `tests/fixtures/<nom>/<id>/` contient les fichiers écrits par ce commit (surcouche sur le précédent) et un `_delete.txt` optionnel (un chemin par ligne). Auteur fixe `Fixture <fixture@relief.invalid>`, dates fixes : les SHA sont stables d'une machine à l'autre.
- **acme-shop** reprend le faux monorepo de la maquette : `apps/web`, `apps/api`, `packages/shared`, `packages/db`, branche `main` puis branche `feat/promo-codes` avec les 5 commits de la PR #142 (`docs/product/maquette/index.html`, constantes `TOP`, `E_SPEC`, `COMMITS`). C'est la fixture des tests e2e et des captures de doc.
