# Reformatage seul

Status: resolved
Type: task
Blocked by: E01
UI: non
Doc: user-docs `review`

Spec: `../spec.md` (Décisions : format_only)

## À faire

- Un fichier modifié pour git dont aucun nœud n'a changé (ni ajout, ni suppression, ni corps, ni signature, ni arête) → `format_only`, avec ses lignes de diff texte en information.
- Le résumé de la plage compte ces fichiers à part (« reformatage seul : 1 fichier, 80 lignes de diff texte ignorées »).

## Critères d'acceptation

- [x] Sur acme-shop : `packages/shared/http/client.ts` est `format_only` avec 29 lignes ajoutées et 29 retirées (vrais nombres de la fixture, mesurés par git numstat ; 41/39 était un exemple).
- [x] Un fichier où seul un commentaire change est aussi `format_only`.

## Baseline

`just test-summary` sur `develop` (efbe6ce) : cargo 255 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

Comportements : (a) fichier modifié pour git sans aucun nœud changé → `format_only`, avec ses lignes de diff texte (ajoutées/retirées) en information ; (b) un fichier avec un nœud changé (corps, signature, ajout, suppression, arête) n'est pas `format_only` ; (c) le résumé de la plage compte à part les fichiers `format_only` et leurs lignes ignorées ; (d) un changement de commentaire seul ou d'indentation seul ne change pas le `content_hash` ; (e) un changement de littéral de chaîne change le `content_hash` : `f("x")` ≠ `f(x)`, `"a"` ≠ `"b"` (depuis T01 la normalisation retire les guillemets, ce qui ferait passer un changement de chaîne pour un reformatage ; à corriger ici, avec incrément de `adapter_version` pour invalider le cache I02).

1. **API publique de `relief-diff`** (fonctions `diff_graphs*` et types `FileChange` / résumé, snapshots `GraphBuilder`, stats de lignes en paramètres, sans git) : attrape (a), (b), (c) avec des nombres exacts ; rate le calcul réel du hash et des stats git.
2. **API publique de `relief-lang-ts`** (l'adapter appelé sur deux sources TS, comparaison des `content_hash` des symboles) : attrape (d) et (e), et l'incrément de `adapter_version` ; rate l'agrégation par fichier.
3. **Dépôt de fixture acme-shop** (`relief-fixtures`, comme `crates/relief-diff/tests/acme_moves.rs`) : de bout en bout sur le commit « prettier », `packages/shared/http/client.ts` est `format_only` avec les vrais nombres de lignes en littéral ; rate les cas synthétiques (commentaire seul, littéral de chaîne) couverts par 1 et 2.

## Red

- Fichiers de test : `crates/relief-diff/tests/format_only.rs`, `crates/relief-diff/tests/acme_format_only.rs`, `crates/relief-lang-ts/tests/content_hash.rs`
- API attendue pour green (`relief_diff`, fonctions pures sur un `GraphDiff`, qui ne change pas de forme ; `diff.files` reste les `FileChange` passés en paramètres) : `format_only_files(&GraphDiff) -> Vec<relief_model::FileChange>` (fichiers de `diff.files` sans nœud changé ni arête changée dedans, dans l'ordre de `diff.files`) ; `format_only_summary(&GraphDiff) -> FormatOnlySummary { files: usize, lines_added: u32, lines_removed: u32 }` (`Debug + PartialEq`). Côté `relief-lang-ts` : `TsAdapter::version()` vaut 2 ; une chaîne littérale garde ses guillemets/sa valeur dans le hash (`f("x")` ≠ `f(x)`), sans que le style de guillemets compte.
- Lancer : `cargo test -p relief-diff --test format_only && cargo test -p relief-diff --test acme_format_only && cargo test -p relief-lang-ts --test content_hash`
- Nombres de la fixture (prettier, `auth` -> `move`) : `client.ts` = 29 lignes ajoutées, 29 retirées (git numstat).
- En échec : 9 tests
  - format_only.rs (4) : `files_with_no_changed_node_are_format_only_with_their_text_lines`, `a_changed_body_signature_added_removed_symbol_or_edge_is_not_format_only`, `the_summary_counts_format_only_files_and_their_ignored_lines_apart`, `a_range_without_format_only_file_has_an_empty_summary` — ne compilent pas : `format_only_files`, `format_only_summary`, `FormatOnlySummary` n'existent pas.
  - acme_format_only.rs (3) : `prettier_only_client_ts_is_format_only_with_29_added_and_29_removed`, `the_files_that_really_changed_in_that_commit_are_not_format_only`, `the_summary_of_the_commit_counts_one_file_and_58_ignored_lines` — même raison (symboles absents).
  - content_hash.rs (2 en échec sur 6) : `a_string_literal_is_not_an_identifier` — `f("x")` et `f(x)` ont le même hash ; `the_adapter_version_is_bumped_to_invalidate_the_cache` — `version()` vaut 1, attendu 2.
- Tests déjà verts, gardes de non-régression à garder verts : `content_hash.rs` : `a_comment_only_change_keeps_the_hash`, `an_indentation_only_change_keeps_the_hash`, `another_string_literal_changes_the_hash`, `the_quote_style_alone_keeps_the_hash`.

## Green

- Fichiers : `crates/relief-diff/src/lib.rs`, `crates/relief-lang-ts/src/lib.rs`
- Changement : `format_only_files` / `format_only_summary` / `FormatOnlySummary` dans relief-diff (fichiers de `diff.files` sans nœud changé, sans source de déplacement `Moved.from`, sans arête partant d'eux). Dans relief-lang-ts, les guillemets de chaîne sont normalisés en `"` au lieu d'être retirés (le littéral reste distinct d'un identifiant, le style de guillemets ne compte pas) et `TsAdapter::version()` vaut 2.
- Suite : cargo 268 passed, 0 failed ; web 2 passed, 0 failed (baseline 255/0 et 2/0) ; lint propre ; aucun snapshot modifié, aucun fichier de test modifié.
- Questions ouvertes : aucune

## Review

- Verdict : ship (tdd-review, premier passage).
- Must fix : aucun.
- Consider (non appliqués, laissés aux tickets suivants) :
  - Un renommage pur de fichier sans nœud changé est compté `format_only` (0 ligne) ; aucun test ne fixe ce choix. À trancher avec C02/R01.
  - `format_only_files` / `format_only_summary` ne sont appelées que par les tests : le câblage dans la sortie de `relief diff` (C02) et l'API/carte (R01) reste à faire.
  - `acme_format_only.rs` : le test « really changed » ne vérifie que `Invoices.tsx` ; le test de résumé (1 fichier, 29/29) couvre l'ensemble exact.
  - La construction du diff acme duplique celle de `acme_moves.rs` ; un helper de test commun serait plus propre.
- Vérifié : guillemets normalisés en `"` (`f("x")` ≠ `f(x)`, `"a"` ≠ `"b"`, `'a'` = `"a"`, gabarits distincts) ; `TsAdapter::version()` = 2, clé de cache `(blob, adapter, adapter_version)` donc les entrées v1 sont ignorées ; un fichier source d'un `Moved.from` ou point de départ d'une arête changée n'est pas `format_only` (le cas `Moved.from` n'a pas de test dédié).

## Documentation

Le ticket est sans UI ni commande nouvelle : `format_only_summary` n'est pas encore exposé. Le site `user-docs/` (F05) n'existe pas encore. À documenter dans la page `review` quand C02/R01 exposeront le résumé : un fichier « reformatage seul » est un fichier modifié pour git dont aucun symbole ni arête n'a changé (indentation, commentaires, style de guillemets) ; il est compté à part (« reformatage seul : N fichiers, M lignes de diff texte ignorées ») ; un changement de littéral de chaîne n'est jamais un reformatage.

## Answer

- Construit : dans `relief-diff`, `format_only_files(&GraphDiff)` (fichiers de `diff.files` sans nœud changé, sans source de déplacement, sans arête changée qui en part) et `format_only_summary(&GraphDiff) -> FormatOnlySummary { files, lines_added, lines_removed }`. `diff_graphs` / `diff_graphs_with_renames` inchangées.
- Hash : depuis T01, la normalisation de `relief-lang-ts` retirait les guillemets, si bien que `f("x")` et `f(x)` avaient le même `content_hash` et qu'un changement de littéral aurait pu passer pour un reformatage. Les guillemets sont désormais normalisés en `"` (le style ne compte pas, la présence oui) ; `TsAdapter::version()` passe à 2 pour invalider le cache I02.
- Vérifié : `crates/relief-diff/tests/format_only.rs` (4), `crates/relief-diff/tests/acme_format_only.rs` (3, commit prettier de `client.ts` : 29/29), `crates/relief-lang-ts/tests/content_hash.rs` (6) ; `just test-summary` : cargo 268 passed / 0 failed (baseline 255), web 2/0 ; `just lint` propre. Pas d'UI, donc pas de vérification navigateur.
