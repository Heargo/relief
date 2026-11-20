# `relief diff`

Status: resolved
Type: task
Blocked by: C01, E02, E04, E05, G03
UI: non
Doc: user-docs `cli`, `review`

Spec: `../spec.md`

**Jalon C** : `relief diff main...feature` dit ce qui a bougé structurellement.

## À faire

- `relief diff [range] [--staged] [--json]` : indexe base et head (cache), appelle le moteur de diff, imprime le résumé ou le JSON.
- Résumé texte : compte par statut, signatures modifiées (cassante/compatible + raison), nouveaux couplages entre modules, fichiers déplacés, fichiers « format seul ».

## Critères d'acceptation

- [ ] `relief diff main...feat/promo-codes` sur acme-shop : snapshot `insta` du texte et du JSON.
- [ ] Sans argument dans une fixture avec des modifications non commitées : le diff porte sur WORKTREE vs HEAD ; `--staged` seulement sur l'indexé.
- [ ] Page `cli` (section `diff`) et page `review` (« Relire depuis le terminal ») à jour, FR et EN.

## Baseline

`just test-summary` sur `develop` (b388a5a) : `cargo: 268 passed, 0 failed` ; `web: 2 passed, 0 failed`.

## Seams

1. **CLI `relief diff main...feat/promo-codes` sur la fixture acme-shop** (`assert_cmd` + `insta`, `--no-cache` ou `RELIEF_CACHE_DIR` temporaire) : snapshot du texte et du `--json`. Attrape le câblage complet (résolution de plage, indexation base/head, moteur, rendu, comptes par statut, signatures, couplages, déplacements, format seul). Rate les cas que acme-shop n'exerce pas.
2. **CLI sans argument et avec `--staged` sur une fixture `relief-fixtures` avec des modifications non commitées** (indexées et non indexées) : WORKTREE vs HEAD par défaut, INDEX vs HEAD avec `--staged`. Attrape le choix des côtés ; rate le détail du rendu (couvert par 1).
3. **Point d'entrée unique de `relief-diff`** (fonction publique + struct d'options, sur snapshots en mémoire ou fixture) : signatures, renommages/déplacements et format seul calculés ensemble dans un même `GraphDiff`, sans casser `diff_graphs_with_signatures` / `diff_graphs_with_renames`. Attrape la non-combinaison des deux entrées actuelles ; rate la CLI.

Validation : chaque comportement (résumé texte, JSON, WORKTREE, `--staged`, combinaison du moteur) est atteint ; trois interfaces publiques (CLI ×2, fonction de crate) ; git jamais mocké (fixtures) ; 3 seams.

## Red

- Fichiers de test : `crates/relief-cli/tests/diff.rs`, `crates/relief-diff/tests/diff_options.rs`
- Lancer : `cargo test -p relief-cli --test diff` ; `cargo test -p relief-diff --test diff_options`
- Snapshots insta (`diff_acme_text`, `diff_acme_json`) : non écrits, insta les crée au premier green (`cargo insta review`), à relire à la main.
- API attendue pour le seam 3 : `DiffOptions<'a>` (`Default`, champs publics `texts`, `signatures`, `renames`, `compare: Option<&'a dyn Fn(&str,&str)->SignatureVerdict>`) et `diff_graphs_with_options(base, head, files, &DiffOptions) -> GraphDiff`.
- En échec : 9 tests
  - `diff_options.rs` (2, ne compile pas) : `one_call_reports_signature_change_move_and_format_only_together`, `default_options_behave_like_plain_diff` — `DiffOptions` et `diff_graphs_with_options` n'existent pas.
  - `diff.rs` (7) : `diff_acme_text_summary`, `diff_acme_json_snapshot`, `diff_acme_json_compares_merge_base_to_branch_tip`, `diff_unknown_range_fails_with_usage_error` (attend code 2 et le nom de la plage en stderr), `diff_without_argument_compares_worktree_to_head`, `diff_staged_compares_index_to_head`, `diff_without_argument_text_mentions_worktree_changes` — sous-commande `diff` absente du binaire.

## Green

- Fichiers : `crates/relief-diff/src/lib.rs`, `crates/relief-cli/src/main.rs`, `crates/relief-cli/Cargo.toml` (+ `Cargo.lock`), `crates/relief-git/src/lib.rs`, snapshots `crates/relief-cli/tests/snapshots/diff__diff_acme_{text,json}.snap`
- Changement : `DiffOptions` + `diff_graphs_with_options` (les deux anciennes entrées inchangées). Sous-commande `relief diff [range] [--staged]` : plage via `RevSpec`/`resolve_range` (défaut HEAD→WORKTREE, `--staged` HEAD→INDEX), indexation des deux côtés, renommages git, textes de signatures de l'adapter TS, couplages (niveau module), attribution des commits d'arêtes, résumé texte ou JSON. `GitSource::commit_time` renvoie l'heure de HEAD pour un commit virtuel (l'indexation de WORKTREE/INDEX échouait).
- Suite : cargo 277 réussis / 0 échoué (baseline 268), web 2 / 0 ; lint propre ; aucun fichier de test modifié.
- Questions ouvertes : les lignes ajoutées/retirées par symbole valent 0 (`SymbolTexts` non fournis par la CLI) ; `show` duplique encore la construction de l'indexeur (à factoriser en review) ; doc user-docs `cli`/`review` non faite (hors étape green).

## Review

- Verdict : ship (tdd-review, sur `git diff HEAD` et les deux snapshots nouveaux).
- Must fix : aucun.
- Consider :
  - Les raisons de signature (`compare_signatures` de `relief-lang-ts`) sont en français, dans le texte comme dans le JSON, alors que la CLI doit parler anglais (`docs/rules.md`, spec). À corriger dans un ticket de suivi (raison en anglais ou code stable traduit par l'UI), puis `cargo insta review` des deux snapshots.
  - `show` construit encore son indexeur à la main : le faire passer par `indexer()`.
  - `is_virtual()` dans `main.rs` compare le texte de l'id ; rendre public `CommitId::is_virtual` de `relief-git` et le réutiliser.
  - `GitSource::commit_time` (heure de HEAD pour un commit virtuel) n'a pas de test ciblé dans `relief-git`.
  - `linesAdded`/`linesRemoved` valent 0 par symbole (la CLI ne fournit pas `SymbolTexts`) et le snapshot JSON fige ces zéros : fournir les textes, omettre les champs ou ouvrir un suivi.
  - `diff()` (~90 lignes) mélange résolution, renommages, signatures et rendu : à découper.
  - `signature_texts` code en dur `ts|tsx|mts|cts` au lieu de demander à l'adapter.

## Documentation

Le site `user-docs/` (F05) n'existe pas encore : rien n'est écrit, le critère « pages `cli` et `review` à jour, FR et EN » reste ouvert et passe à F05. À documenter, en reprenant aussi les notes archivées de C01, G02, G03, I02, E02 à E05 :

- Page `cli`, section `diff` : `relief diff [range] [--staged] [--json]` ; sans argument WORKTREE vs HEAD (fichiers modifiés, ajoutés non ignorés, supprimés), `--staged` INDEX vs HEAD, `A...B` (depuis la base de fusion) et `A..B` ; `WORKTREE` et `INDEX` acceptés partout où un commit l'est ; relief n'écrit rien dans le dépôt ; `--json` sort le `GraphDiff` ; options globales `--repo`, `--no-cache`, `RELIEF_CACHE_DIR` ; code 2 et plage nommée pour une révision inconnue ; exemple de sortie texte (celle d'acme-shop ci-dessous).
- Page `review`, « Relire depuis le terminal » : lire le résumé (comptes par statut, liste des symboles, signatures cassantes/compatibles et leur raison, nouveaux couplages et couplages disparus entre modules, fichiers déplacés, fichiers « format seul » comptés à part) ; un symbole déplacé apparaît comme `moved`, et les imports réécrits par un déplacement ne comptent pas comme couplage ; un littéral de chaîne modifié n'est jamais du format seul ; limite : types, interfaces et const ne produisent pas de changement de signature (hors export supprimé et visibilité réduite) ; les lignes ajoutées/retirées par symbole ne sont pas encore calculées par la CLI.

## Answer

- Construit : `relief_diff::DiffOptions` (struct d'options, `Default`) et `diff_graphs_with_options`, qui calcule en un appel signatures, déplacements/renommages et format seul ; `diff_graphs_with_signatures` et `diff_graphs_with_renames` restent inchangées. Sous-commande `relief diff [range] [--staged] [--json]` : plage par `RevSpec`/`resolve_range` (défaut HEAD → WORKTREE, `--staged` HEAD → INDEX, `A...B` depuis la base de fusion, `A..B`), indexation des deux côtés via le cache (ou `--no-cache`), renommages git, textes de signatures de `TsAdapter`, couplages au niveau module, commits d'arêtes attribués, résumé texte ou `GraphDiff` en JSON. Révision inconnue : code 2, plage nommée sur stderr.
- Décision : `GitSource::commit_time` renvoie l'heure de HEAD pour un commit virtuel (WORKTREE/INDEX), sans quoi leur indexation échouait.
- Vérifié : 9 nouveaux tests (7 CLI sur acme-shop et sur une fixture à modifications non commitées, 2 sur le point d'entrée unique) ; snapshots texte et JSON relus ; `just lint` propre ; `just test-summary` 277/0 cargo (baseline 268), 2/0 web ; aucun test ne touche `~/.cache` (`--no-cache`).
- Non fait : doc `cli`/`review` (F05 absent, voir `## Documentation`) ; lignes par symbole à 0 et raisons de signature en français (voir `## Review`).
