# relief

Carte zoomable d'un dépôt git (système → modules → fichiers → symboles) avec le diff superposé, pour relire des PR et comprendre un repo inconnu. Cœur Rust, app native Tauri (binaire `relief`) qui embarque l'UI Angular. Le cadrage est dans [docs/product/BRAINSTORM.md](docs/product/BRAINSTORM.md), l'UX validée dans [docs/product/maquette/index.html](docs/product/maquette/index.html). Structure, couches, tests et commandes sont dans [docs/dev/rules.md](docs/dev/rules.md) : lis-le avant de toucher au code.

## Branches

Travaille sur `develop` ou une branche `feat/*` fusionnée dans `develop`. Promotion par une PR `develop` → `main`. Ne pousse jamais directement sur `main`. Ne commite jamais de fichier `.env` ni de secret.

## Développer un ticket

Suis [docs/dev/workflow.md](docs/dev/workflow.md) : red, green, puis review, chacun dans son subagent (`.claude/agents/tdd-*.md`), avec le fichier du ticket comme passage de relais, puis une vérification dans le navigateur pour les tickets d'UI et la mise à jour de la doc utilisateur. L'ordre des tickets est `.scratch/ROADMAP.md`.

## Agent skills

### Issue tracker

Issues et specs en markdown local, sous `.scratch/<feature>/`. Les tickets résolus partent dans `.scratch/archived/<feature>/` dans le commit qui les résout. See `docs/dev/agents/issue-tracker.md`.

### Triage labels

Les cinq étiquettes par défaut (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), en ligne `Status:` dans chaque issue. See `docs/dev/agents/triage-labels.md`.

### Domain docs

Single-context : `GLOSSARY.md` et `docs/adr/` à la racine. See `docs/dev/agents/domain.md`.
