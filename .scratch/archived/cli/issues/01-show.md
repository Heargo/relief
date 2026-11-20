# `relief show`

Status: resolved
Type: task
Blocked by: I01
UI: non
Doc: user-docs `cli`

Spec: `../spec.md`

**Jalon A** : `relief show` marche sur n'importe quel dépôt git.

## À faire

- Squelette clap avec les options globales ; `relief show [ref]` texte et `--json`.
- Erreurs lisibles : hors d'un dépôt, ref inconnue, dépôt vide.

## Critères d'acceptation

- [x] `assert_cmd` sur `tiny` : sortie texte en snapshot `insta`, `--json` valide contre `docs/contract/snapshot.schema.json` (quand M02 existe ; sinon parse serde).
- [x] Hors d'un dépôt : code 2 et message « not a git repository ».
- [ ] Page `cli` de la doc : section `show` (FR, EN). Reportée : `user-docs/` n'existe pas (F05), voir `## Documentation`.

## Baseline

`just test-summary` (develop, 5c2f9ce) : cargo: 85 passed, 0 failed ; web: 2 passed, 0 failed.

## Seams

1. **CLI `relief show` sur la fixture `tiny`** (`assert_cmd` sur le vrai binaire, dépôt construit par `relief-fixtures`, `--repo <dossier>` et dossier courant) : sortie texte en snapshot `insta` (HEAD par défaut et ref explicite), `--json` parsé en `GraphSnapshot` (serde ; `docs/contract/snapshot.schema.json` n'existe pas encore, M02). Attrape le squelette clap, les options globales, le résumé texte et le JSON ; rate la validation par JSON Schema (M02).
2. **CLI `relief show` sur des dépôts invalides** (`assert_cmd` : dossier temporaire non git, dépôt git vide construit dans un dossier temporaire, ref inconnue sur `tiny`) : code de sortie 2 et message anglais lisible sur stderr (« not a git repository », ref inconnue nommée, dépôt vide). Attrape les erreurs d'usage ; rate les erreurs d'E/S rares (permissions, objets corrompus).

## Red

- Fichiers de test : `crates/relief-cli/tests/show.rs` ; dev-dependencies ajoutées à `crates/relief-cli/Cargo.toml` (insta avec `filters`, predicates, relief-fixtures, relief-model, serde_json, tempfile).
- Lancer : `cargo test -p relief-cli --test show`
- Snapshots insta : `show_head` et `show_init` (texte de `show`, SHA de 40 hex filtrés en `[sha]`) n'existent pas ; green les produit puis les relit et les accepte (`cargo insta review`). Contenu attendu à la main : HEAD de `tiny` = 2 fichiers (`src/a.ts`, `src/c.ts`) ; `init` = 2 fichiers (`a.ts`, `b.ts`). Aucun test n'affirme de symboles : ils viendront avec T01 (relief-lang-ts).
- En échec : 8 tests, tous parce que le binaire n'a ni sous-commande `show` ni option globale `--repo`/`--json` (clap : « unexpected argument '--repo' », code 2)
  - show_prints_text_summary_of_head_with_repo_option — `--repo`/`show` absents (puis snapshot `show_head` à accepter)
  - show_defaults_to_current_directory_and_head — `show` absent
  - show_explicit_ref_prints_text_summary_of_that_commit — `show <ref>` absent (puis snapshot `show_init`)
  - show_json_outputs_head_snapshot — `--json show` absent ; attend commit = SHA de `reshape`, 2 fichiers (a.ts, c.ts, pas b.ts)
  - show_json_with_explicit_ref_outputs_that_commit — attend commit = SHA de `init`, a.ts et b.ts, pas c.ts
  - show_outside_a_git_repository_exits_2 — stderr ne contient pas « not a git repository »
  - show_unknown_ref_exits_2_and_names_the_ref — stderr ne nomme pas `no-such-ref`
  - show_empty_repository_exits_2_with_readable_message — stderr ne contient pas « empty »

## Green

- Fichiers : crates/relief-cli/src/main.rs, crates/relief-cli/Cargo.toml, Cargo.lock, crates/relief-cli/tests/snapshots/show__show_head.snap, show__show_init.snap
- Changement : squelette clap (`--repo`, `--json` globaux, `show [rev]`) ; `show` résout la ref, indexe via `Indexer` et affiche un résumé texte (commit, date, fichiers, symboles, arêtes) ou le `GraphSnapshot` en JSON. Erreurs en code 2 : not a git repository, ref inconnue nommée, dépôt vide. Snapshots relus et acceptés (symboles 0, T01 non fait).
- Suite : cargo 93 réussis, 0 échoué ; web 2 réussis, 0 échoué (baseline 85/0 ; 2/0)
- Questions ouvertes : section `show` de la page `cli` de la doc non écrite (étape doc)
- Options globales ajoutées (sans effet pour l'instant) : `--no-cache`, `-q/--quiet`, `-v/--verbose` (quiet et verbose exclusifs).

## Review

- Premier passage : **fix first**.
  - Must fix 1 : options globales `--no-cache`, `-q/-v` absentes. Appliqué par tdd-green (`global = true`, sans effet pour l'instant, quiet/verbose exclusifs).
  - Must fix 2 : section `show` de la page `cli`. Reportée à F05, voir `## Documentation`.
- Second passage : **ship**, aucun Must fix.
- Consider (ouverts) :
  - Le résumé texte n'affiche ni systèmes, ni langages, ni avertissements, que la spec demande. À ajouter quand detect/lang les exposent.
  - La détection du dépôt vide est indirecte (`UnknownRev` + `repo_id()` en erreur). Un `GitSource::is_empty()` serait plus lisible.
  - Le nom du dépôt est déduit du dossier, avec le repli `"repo"`.
  - L'assertion `contains("empty")` du test est large.
  - Aucun test sur `--no-cache -v show` (code 0) ni sur `-q -v` (refus clap, code 2).
  - Aucun symbole avant T01 : les snapshots montrent `symbols 0`.

## Documentation

`user-docs/` (F05) n'existe pas encore, donc rien n'a été écrit ici. Quand F05 créera la page `cli`, elle devra contenir une section `show` en FR et en EN, avec :

- `relief show [ref]` (HEAD par défaut) ;
- les options globales `--repo <chemin>`, `--json` (le `GraphSnapshot` complet), `--no-cache` et `-q/-v` ;
- un exemple de sortie texte (commit, date, files, symbols, edges) ;
- les codes de sortie : 0 en cas de succès, 2 pour une erreur d'usage ou un dépôt invalide ;
- les messages d'erreur : « not a git repository », ref inconnue nommée, « repository is empty ».

## Answer

- Construit : `relief` a un squelette clap avec les options globales `--repo`, `--json`, `--no-cache`, `-q/-v`, et la sous-commande `show [rev]`. Elle ouvre le dépôt par `GitSource`, résout la ref (HEAD par défaut), indexe par `Indexer`, puis affiche un résumé texte ou le `GraphSnapshot` en JSON. Les erreurs sont en anglais, avec le code 2 : hors d'un dépôt, ref inconnue, dépôt vide.
- Décisions :
  - Les tests n'affirment rien sur les symboles, car aucun Language Adapter n'existe avant T01.
  - Le `--json` est parsé par serde, puisque le schéma n'existe pas avant M02.
  - `--no-cache`, `-q` et `-v` sont acceptés mais sans effet pour l'instant.
- Vérifié :
  - `cargo test -p relief-cli --test show` : 8/8.
  - `just lint` est propre.
  - `just test-summary` : cargo 93 passed / web 2 passed, contre une baseline de 85 / 2.
  - À la main, sur acme-shop : `--no-cache -v show` donne le code 0 avec files 43 ; `--repo /tmp` donne le code 2 avec « not a git repository » ; `-q -v` est refusé.
