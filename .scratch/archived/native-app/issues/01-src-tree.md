# Arborescence par couches sous `src/`

Status: resolved
Type: task
Blocked by: aucun
UI: non
Doc: non (aucun changement visible ; README et doc développeur suivent les chemins)

Spec: `../spec.md` (Décisions : arborescence) ; ADR 0008

## À faire

- `git mv` vers l'arborescence de l'ADR 0008, sans changement de code :
  - `crates/relief-{model,diff,rules}` → `src/domain/` ; `crates/relief-{git,detect,index}` → `src/analysis/` ; `crates/relief-lang-ts` → `src/analysis/lang/` ; `crates/relief-{server,cli}` → `src/interfaces/` (temporairement, jusqu'à N07) ; `crates/relief-fixtures` → `tests/relief-fixtures/`.
  - `web/` → `src/ui/` ; `e2e/` → `tests/e2e/` ; `fixtures/` → `tests/fixtures/`.
  - `user-docs/` → `docs/user/` ; `docs/rules.md`, `workflow.md`, `docs/agents/` → `docs/dev/` ; `BRAINSTORM.md`, `maquette/` → `docs/product/`.
- Mettre à jour tout ce qui porte un chemin : membres du workspace `Cargo.toml` et dépendances `path`, chemins `rust-embed`, `justfile`, `.claude/launch.json`, `.claude/agents/tdd-*.md`, configs Playwright et des captures, scripts de génération du contrat, `tsconfig`/`angular.json` si besoin, `.gitignore` (et y ajouter `.relief/`).
- Mettre à jour les liens de `README.md`, `CLAUDE.md`, `docs/dev/rules.md` (section Structure), `docs/dev/workflow.md`, des ADR et des tickets et specs ouverts. Les tickets archivés ne changent pas.

## Baseline

`just test-summary` : cargo 386 passed, web 308 passed ; `just e2e-summary` : 58 passed ; `just lint` propre.

## Critères d'acceptation

- [x] `just test-summary`, `just lint` et `just e2e-summary` donnent les mêmes comptes que la baseline.
- [x] `just dev`, `just serve-acme` et `just docs-build` marchent.
- [x] `git log --follow` retrouve l'historique d'un fichier déplacé (par exemple `src/domain/relief-diff/src/lib.rs`).
- [x] Plus aucune référence aux anciens chemins hors de `.scratch/archived/` (`grep` sur `crates/`, `web/`, `user-docs/`, `e2e/` à la racine).

## Review

- Verdict : ship
- Must fix : aucun (chemins Cargo, rust-embed, build.rs, generate-contract, serve-acme, configs Playwright, justfile, launch.json vérifiés ; `cargo test --workspace --no-run` compile ; aucun ticket archivé touché ; section Structure de `docs/dev/rules.md` à jour ; plus de référence aux anciens chemins hors snapshots)
- Consider : `src/**/tests/snapshots/*.snap:2` — l'en-tête `source: crates/...` est périmé (métadonnée insta, sans effet) — un `cargo insta test --accept` les régénère ; `tests/relief-fixtures/src/lib.rs:81` — le commentaire dit « from the workspace root » alors que le chemin est `tests/fixtures` ; `quicknotes.md` non suivi à la racine, à ne pas inclure dans le commit.

## Answer

- Déplacement par `git mv` vers l'arborescence de l'ADR 0008 (`src/domain`, `src/analysis`, `src/analysis/lang`, `src/interfaces`, `src/ui`, `tests/{e2e,fixtures,relief-fixtures}`, `docs/{dev,product,user}`).
- Seuls changements de code : chemins. Membres du workspace listés par couche dans `Cargo.toml`, dépendances `path` recalculées, `rust-embed` et `build.rs` de `relief-server`, `workspace_fixtures()` de `relief-fixtures`, tests qui lisent `docs/contract`, `contract.ts` ou le `tsc` de l'UI, `generate-contract.mjs`, `serve-acme.mjs`, config Playwright des captures, `justfile`, `.claude/launch.json` (maquette). `.relief/` ajouté au `.gitignore`.
- Doc et tickets : chemins réécrits par script (liens relatifs recalculés depuis l'ancien emplacement de chaque fichier) dans README, CLAUDE.md, `docs/dev/`, ADR, `.claude/agents/`, tickets et specs ouverts, doc utilisateur (`cargo install --path src/interfaces/relief-cli`, et le test e2e qui le vérifie). La section Structure de `docs/dev/rules.md` est réécrite par couche. Tickets archivés et spec native-app (qui décrit le déplacement) laissés tels quels.
- Remarques de la review appliquées : en-têtes `source:` des snapshots insta et commentaire de `Fixture::load`.
- Vérifié : mêmes comptes que la baseline (cargo 386, web 308, e2e 58), `just lint`, `just docs-build`, `just contract` sans diff ; `just serve-acme` et `just dev` répondent sur `/api/meta`, l'UI et `/docs`. `git log --follow` vérifié après le commit.
