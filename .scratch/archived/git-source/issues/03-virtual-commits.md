# Commits virtuels : working tree et index

Status: resolved
Type: task
Blocked by: G02
UI: non
Doc: user-docs `cli`

Spec: `../spec.md` (Décisions)

Le cas d'usage : relire ce que l'IA vient d'écrire avant de committer.

## À faire

- `WORKTREE` : l'arbre de HEAD + les fichiers modifiés, ajoutés (non suivis, non ignorés par `.gitignore`) et supprimés du working tree.
- `INDEX` : l'arbre de l'index.
- Les deux s'utilisent partout où un commit est accepté (`list_tree`, `read_blob`, `diff_trees`) ; les blobs du working tree ont un id calculé comme git (`hash-object`) pour que le cache par blob marche.

## Critères d'acceptation

- [x] Fixture avec une modification non indexée, une indexée et un fichier non suivi : `diff_trees(HEAD, WORKTREE)` voit les trois, `diff_trees(HEAD, INDEX)` seulement l'indexée.
- [x] Un fichier ignoré par `.gitignore` n'apparaît jamais.
- [x] Le dépôt n'est pas modifié (index inchangé, aucun objet écrit dans `.git/objects`).

## Baseline

`just test-summary` sur `develop` (cfaca6e) : cargo 195 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

- **API publique de `relief-git` sur un dépôt `relief-fixtures`** (`RevSpec` `WORKTREE`/`INDEX` passé à `list_tree`, `read_blob`, `diff_trees`, dans `crates/relief-git/tests/virtual_commits.rs`) : attrape le contenu des arbres virtuels (modif non indexée, indexée, non suivi, supprimé, ignoré exclu), l'id des blobs calculé comme `git hash-object`, et l'absence d'écriture dans le dépôt (index et `.git/objects` comparés avant/après) ; rate l'usage par la CLI/le serveur (`relief diff` sans argument, ticket ultérieur) et les performances sur gros working tree.

## Red

- Fichiers de test : `crates/relief-git/tests/virtual_commits.rs` (aucune extension de `relief-fixtures` : `build_with_worktree` + `git` suffisent). Convention d'API supposée : `GitSource::resolve("WORKTREE" | "INDEX")` renvoie un `CommitId` virtuel accepté par `list_tree`, `read_blob` (via le `BlobId` listé) et `diff_trees`.
- Lancer : `cargo test -p relief-git --test virtual_commits`
- En échec : 10 tests, tous avec `UnknownRev("WORKTREE"/"INDEX")` à `resolve` (commits virtuels non supportés) :
  - diff_head_worktree_sees_unstaged_staged_untracked_and_deleted — attend M a.ts, M c.ts, D gone.ts, A new.ts
  - diff_head_index_sees_only_the_staged_change — attend M c.ts seul
  - ignored_files_never_appear — `debug.log`, `dist/` absents
  - list_tree_worktree_is_head_plus_edits — HEAD + new.ts, sans gone.ts
  - list_tree_index_is_the_staged_tree — arbre de l'index
  - worktree_blob_ids_match_git_hash_object — ids = `git hash-object`
  - index_blob_ids_are_the_staged_ones — ids = `git rev-parse :path`
  - read_blob_returns_worktree_and_index_content — contenu des blobs absents de l'odb
  - diff_trees_reports_worktree_blobs_and_line_counts — new_blob/old_blob, +1 -0, Deleted
  - virtual_commits_leave_the_repository_untouched — `.git/index` et `.git/objects` inchangés

## Green

- Fichiers : `crates/relief-git/src/lib.rs`, `crates/relief-git/Cargo.toml` (feature gix `excludes`)
- Changement : `CommitId` devient un enum (objet, `WORKTREE`, `INDEX`) ; `resolve` les accepte. `list_tree` construit l'arbre de l'index (lecture seule) ou du working tree (HEAD + index + non suivis non ignorés via la pile d'excludes gix, ids calculés comme `hash-object`, jamais écrits). `read_blob` retombe sur le fichier disque si le blob n'est pas dans l'odb. `diff_trees` avec un côté virtuel compare les listes d'entrées (comptes de lignes par imara-diff, pas de détection de renommage).
- Suite : cargo 205 réussis, 0 échoué (baseline 195/0) ; web 2/0 (inchangé).
- Questions ouvertes : renommages non détectés sur les diffs virtuels ; tous les fichiers du working tree sont hachés à chaque `list_tree(WORKTREE)` (perf sur gros dépôt hors périmètre du ticket).

## Review

- Verdict : ship
- Must fix : aucun.
- Consider :
  - Aucune page `user-docs` touchée : défendable tant que la CLI n'expose pas `WORKTREE`/`INDEX` ; la doc se fera avec C02 (`relief diff`).
  - `resolve("HEAD")` échoue sur un dépôt sans commit, donc `WORKTREE` aussi : cas limite à décider.
  - `worktree_entries` (`lib.rs`) est longue ; à scinder (`collect_untracked`, `hash_worktree_file`), et le chaînage `Ok`/`Err` suivi/non suivi serait plus clair avec un enum.
  - Tests non couverts : mode exécutable/symlink, `.gitignore` imbriqué, `lines_added`/`lines_removed` d'un fichier modifié.
  - `read_blob` : le cache `worktree_blobs` est rempli par effet de bord de `list_tree` ; un `BlobId` d'un autre `GitSource` n'est pas lisible. À documenter.
  - Renommages non détectés sur les diffs virtuels et hachage complet à chaque appel : déjà en questions ouvertes.

## Documentation

Le site `user-docs/` (F05) n'existe pas encore, et ce ticket n'expose rien à l'utilisateur (API interne de `relief-git`). À documenter dans la page `cli` quand C02 livrera `relief diff` : sans argument = WORKTREE vs HEAD (fichiers modifiés, ajoutés non ignorés, supprimés), `--staged` = INDEX vs HEAD, les révisions virtuelles `WORKTREE` et `INDEX` acceptées partout où un commit l'est, et la garantie que relief n'écrit rien dans le dépôt.

## Answer

- Construit : `CommitId` devient un enum (objet, `WORKTREE`, `INDEX`) ; `GitSource::resolve` accepte les deux noms virtuels. `list_tree(INDEX)` lit l'index sans l'écrire ; `list_tree(WORKTREE)` = HEAD + index + non suivis non ignorés (pile d'excludes gix, feature `excludes`) − supprimés, avec des ids calculés comme `git hash-object` sans écriture dans `.git`. `read_blob` retombe sur le fichier disque pour les blobs absents de l'odb ; `diff_trees` avec un côté virtuel compare les listes d'entrées (lignes comptées par imara-diff).
- Décisions : pas de détection de renommage sur les diffs virtuels (A + D) ; perf sur gros working tree hors périmètre.
- Vérifié : `cargo test -p relief-git --test virtual_commits` 10/10 (dont index et `.git/objects` inchangés, ids = `hash-object`/`rev-parse :path`) ; `just test-summary` cargo 205/0 (baseline 195/0), web 2/0 ; `just lint` propre. Pas d'UI : pas de vérification navigateur.
