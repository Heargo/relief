# Workflow de développement

On développe un ticket en commençant par les tests : **red** (tests qui échouent), **green** (le code qui les fait passer), **review**, puis une courte **vérification dans le navigateur** pour les tickets d'UI. Tu es l'orchestrateur : les subagents `tdd-red`, `tdd-green` et `tdd-review` (`.claude/agents/`) font le travail, et le fichier du ticket sert de passage de relais entre eux.

Entrée : le chemin d'un ticket, `.scratch/<feature>/issues/NN-slug.md`. Le suivant est la première ligne ouverte de `.scratch/ROADMAP.md`.

## Budget

Ça tourne sur un forfait Claude Pro, donc chaque token compte :

- Tu lis le ticket et lances des commandes git/test courtes ; les subagents lisent le code. Laisse-leur l'exploration.
- Fais passer chaque run de tests dans `tail` ou un `grep` sur les lignes de résumé (commandes dans `docs/dev/rules.md`, section Tests).
- Les briefs suivent les modèles ci-dessous, remplis. Les subagents mettent le détail dans le ticket et répondent par un bloc court.
- Pour réessayer une étape, continue le même subagent avec `SendMessage`, qui garde son contexte.
- Dans le navigateur, lis les pages en texte (`get_page_text`, `find`, `read_page`) ; capture d'écran seulement pour la mise en page, à `scale: 0.5`.
- Un ticket par run.
- Les agents `tdd-*` se chargent au démarrage d'une session. S'il en manque un (fichiers ajoutés en cours de session), lance un agent `general-purpose` avec `model: sonnet` et commence le brief par « Suis `.claude/agents/tdd-<étape>.md`. »

## 1. Charger le ticket

Lis le ticket, et la section du `spec.md` (à côté de son dossier `issues/`) qu'il cite. Annonce son titre. Mets `Status: claimed`.

Terminé quand : tu sais dire chaque comportement du ticket en une ligne, s'il a de l'UI, et s'il touche la doc utilisateur.

## 2. Baseline

1. `git status --short` est vide. Sinon, arrête-toi et demande. Exception : le ticket F01 crée le dépôt, il n'y a pas encore de baseline.
2. Travaille sur `develop`, et seulement sur `develop` : ni branche `feat/*`, ni worktree, jamais `main`. `git branch --show-current` doit répondre `develop` ; sinon, arrête-toi et demande.
3. Lance `just test-summary`. Note le résultat dans le ticket sous `## Baseline`.

Terminé quand : `## Baseline` est dans le ticket. Une baseline rouge est acceptable : elle est notée, et les étapes suivantes s'y comparent.

## 3. Choisir et valider les seams

Propose 1 à 3 seams : les interfaces publiques par lesquelles passeront les tests. Dans relief, ce sont en général :

- une **fonction ou un type public d'une crate** (`relief-diff`, `relief-model`…), testé directement, sans git ;
- un **dépôt de fixture** (`relief-fixtures` : un vrai dépôt git construit dans un dossier temporaire) pour tout ce qui lit git ou indexe ;
- la **CLI** (`assert_cmd` + snapshot `insta`), un **cas d'usage de `relief-app`** sur une fixture, ou une **commande Tauri** (`tauri::test`) ;
- côté UI, un **module de logique TS** (`*.logic.ts`, testé par Vitest), un **business** (`*.business.ts`, `TestBed`, `ReliefApiService` mocké) ou les **entrées/sorties d'un composant** Angular (`TEST_PROVIDERS`) ;
- un **test e2e WebdriverIO** sur l'app construite et une fixture, pour le parcours principal d'un ticket d'UI.

Une ligne par seam : ce qu'il attrape, ce qu'il rate.

Puis valide-les toi-même, sans demander à l'utilisateur. Les seams passent quand tout ceci tient :

- Chaque comportement de l'étape 1 est atteint par au moins un seam.
- Chaque seam est une interface publique : une fonction ou un type exporté, une commande CLI, une commande Tauri, les entrées/sorties d'un composant, ou ce que voit un utilisateur dans le navigateur (e2e). Jamais un membre privé ni la structure interne du DOM d'un composant.
- Chaque seam est d'un des types ci-dessus, ou le ticket ou `spec.md` le nomme.
- À eux tous, ils ne mockent rien que le dépôt ne mocke déjà (les frontières listées dans `.claude/agents/tdd-red.md`). En particulier, git n'est jamais mocké : on passe par une fixture.
- Il y en a au plus 3. Plus, c'est que le ticket est trop gros : propose un découpage et arrête-toi.

Si une vérification échoue, corrige les seams et revalide. Ne demande à l'utilisateur que si aucun ensemble de seams ne passe, en nommant la vérification qui échoue.

Terminé quand : les seams passent toutes les vérifications et sont écrits dans le ticket sous `## Seams`, chacun avec sa ligne.

## 4. Red

Lance `tdd-red` :

> Ticket : `<chemin du ticket>`. Les seams sont dans le ticket. Baseline : `<ligne de résumé>`. Section du spec : `<titre dans spec.md, ou aucune>`.

Puis lance toi-même la commande de `## Red` à travers `tail -15` et vérifie qu'elle échoue comme décrit. Indexe les fichiers de test : `git add <fichiers de test>`.

Terminé quand : les nouveaux tests sont rouges pour la raison donnée par le rapport, et indexés.

## 5. Green

Lance `tdd-green` :

> Ticket : `<chemin du ticket>`. Les tests rouges sont indexés ; ne les modifie pas.

Puis vérifie :

- `git diff --name-only` ne liste aucun fichier de test.
- La commande de `## Red` passe (`tail -15`).
- `just lint 2>&1 | tail -5` est propre (`cargo clippy -D warnings`, `cargo fmt --check`, `ng build`).

Si une vérification échoue, ou si l'agent signale un test qu'il croit faux, continue-le une fois avec `SendMessage` et le problème exact. Un second échec remonte à l'utilisateur.

Terminé quand : toutes les vérifications passent.

## 6. Review

Lance `tdd-review` :

> Ticket : `<chemin du ticket>`. Relis `git diff HEAD`.

- **ship** : passe à l'étape 7.
- **fix first** : montre à l'utilisateur les lignes `Must fix`. Avec son accord, continue `tdd-green` avec `SendMessage` et ces lignes, relance les vérifications de l'étape 5, puis continue `tdd-review` avec `SendMessage` pour revérifier les corrections seulement.

Terminé quand : le verdict est `ship`, ou l'utilisateur a accepté les remarques restantes.

## 7. Vérification dans le navigateur (tickets d'UI seulement)

Lance `just e2e-summary` : toute la suite WebdriverIO doit passer. Puis lis les captures du parcours principal du ticket, en anglais puis en français, à 1280 px puis à 1024 px de large.

Terminé quand : le flux est correct sur les captures, ou le problème est corrigé via `tdd-green` et revérifié.

## 8. Documentation

Si le ticket change ce que voit ou tape un utilisateur (une commande, une option, un écran), mets à jour la page de `docs/user/` qu'il nomme, en français et en anglais, et relance les captures qui la concernent (`just docs-shots <page>`). Un ticket purement interne n'y touche pas : dis-le dans le ticket.

Terminé quand : `just docs-build 2>&1 | tail -3` passe, ou le ticket dit pourquoi la doc ne change pas.

## 9. Conclure

1. Montre à l'utilisateur : le titre du ticket, les fichiers modifiés (`git diff HEAD --stat`), le résultat de la suite comparé à la baseline, et les éventuelles lignes `Consider`.
2. Ajoute `## Answer` au ticket (ce qui a été construit, les décisions prises, ce qui a été vérifié et comment), mets `Status: resolved`, et `git mv` le ticket vers `.scratch/archived/<feature>/issues/` (voir `docs/dev/agents/issue-tracker.md`). Coche sa ligne dans `.scratch/ROADMAP.md`.
3. Commite sur `develop` sous la forme `<type>(<scope>): <résumé>`, terminé par « Resolve `<chemin du ticket>` (archived) ». Ne commite que les fichiers de ce ticket : laisse les modifications des autres sessions.

Rien n'est poussé sans demande de l'utilisateur. La promotion se fait par une PR `develop` → `main`.
