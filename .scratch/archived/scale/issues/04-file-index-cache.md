# Garder l'index de fichier en cache

Status: resolved
Type: task
Blocked by: S02
UI: non
Doc: aucune (`docs/bench.md` remis à jour)

Spec: `../spec.md` (Décisions : budgets)

## Contexte

S02 (`docs/bench.md`) : les budgets ne sont pas tenus. À chaud, excalidraw met 1,6 s pour 702 fichiers TS (budget 0,28 s au prorata) et n8n 30 s (10,3 s) ; le diff d'une PR d'environ 50 fichiers prend 3,1 s et 65 s (budget 1 s). Le cache disque garde l'extraction (symboles) mais pas l'index de fichier dont `link` a besoin : chaque snapshot, même à chaud, reparse chaque fichier (environ 1,2 à 2,4 ms par fichier), et `analyse` indexe les deux côtés en entier.

## À faire

- Persister l'index de fichier dans le cache par blob (ou partager un seul parse entre `extract` et `link`), sans changer les résultats ; version du format de cache montée.
- `analyse` ne réindexe pas en entier le côté que la `Session` connaît déjà.
- Relancer `just bench` et mettre `docs/bench.md` à jour.

## Critères d'acceptation

- [x] `just bench` : indexation à chaud d'excalidraw sous 0,3 s, ou l'écart restant expliqué.
- [x] Tous les tests existants passent sans changement de résultat.

## Baseline

`just test-summary` (2026-11-20, après S03, b5e4662) : cargo 620 passed, 0 failed ; web 690 passed, 0 failed.

## Seams

- **`relief-index` sur un dépôt de fixture** (snapshot d'un commit, cache disque par blob) : attrape qu'un second snapshot à chaud ne reparse aucun fichier (compteur de parse ou d'extraction exposé par l'index, ou cache qui porte l'index de fichier), que le résultat est identique à froid et à chaud, et qu'un cache d'un format plus ancien est ignoré (version montée) ; rate les chiffres de temps.
- **Cas d'usage de `relief-app` sur une fixture** (`Session` puis `analyse` d'une plage) : attrape que le côté déjà connu de la `Session` n'est pas réindexé en entier (seuls les blobs changés sont reparsés) et que le diff est identique à celui d'une `Session` neuve ; rate les chiffres de temps.
- **`just bench`** (mesure, pas un test) : chiffres à chaud et de diff sur excalidraw et n8n, reportés dans `docs/bench.md`.

## Red

- Fichiers de test : `src/analysis/relief-index/tests/file_index_cache.rs`, `src/app/relief-app/tests/incremental_analyse.rs` (dev-dependencies ajoutées à `relief-index` : `relief-detect`, `relief-lang-ts`, `rusqlite`)
- Lancer : `cargo test -p relief-index --test file_index_cache` et `cargo test -p relief-app --test incremental_analyse`
- Interface à créer pour le green (compteur de parse, la plus petite qui l'observe) : `relief_lang_ts::TsAdapter` devient `Clone`, les clones partagent un compteur (`Arc<AtomicUsize>`), et `TsAdapter::parses() -> usize` compte les parses tree-sitter faits par n'importe laquelle de ses méthodes (`index_file` y passe). Le test garde un clone, en donne un autre à `Indexer`/`Session`.
- Attendus chiffrés : un second snapshot à chaud (nouvel `Indexer`, même dossier de cache) fait `parses() == 0` et `meta.parsed_files == 0` ; un cache `user_version = 4` est ignoré (reparse) puis la version du fichier passe à `> 4` ; après modification d'un seul fichier TS du working tree, `Session::diff` sans plage (HEAD connu en mémoire, sans cache disque) ne fait que 1 parse (le blob changé, partagé entre `extract` et `link`) ; le diff est égal à celui d'une `Session` neuve.
- En échec : 6 tests (aujourd'hui erreur de compilation : `TsAdapter::parses` n'existe pas)
  - a_cold_snapshot_parses_files — `parses()` manquant ; à chaud doit compter > 0
  - a_warm_snapshot_parses_no_file — `parses()` manquant ; `link` reparse chaque fichier à chaud
  - cold_and_warm_snapshots_have_the_same_graph — `parses()` manquant (garde-fou de non-régression une fois le compteur là)
  - a_cache_of_the_previous_format_is_ignored_and_upgraded — `parses()` manquant ; la version du cache reste 4
  - analysing_after_one_change_reparses_only_the_changed_blob — `parses()` manquant ; le côté working tree est réindexé en entier
  - the_incremental_diff_equals_the_diff_of_a_new_session — `parses()` manquant (garde-fou d'égalité des diffs)

## Green

- Fichiers : `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/relief-index/src/{lib,cache}.rs`, `src/analysis/lang/relief-lang-ts/src/{lib,refs,http,usages,complexity}.rs`, `docs/bench.md`
- Changement : le cache (format 5) garde l'index de fichier sérialisé à côté de l'extraction (`LanguageAdapter::extract_indexed` / `link_indexed`, `LinkContext::indexes`), donc `link` ne reparse plus ; `Indexer` garde en mémoire les blobs déjà extraits (une `Session` ne reparse que les blobs changés) ; `TsAdapter` est `Clone` avec compteur `parses()` et mémorise les textes de signature par contenu. Bench : excalidraw à chaud 1,6 s -> 0,13 s, diff 3,2 s -> 1,02 s ; n8n à chaud 30 s -> 5,0 s, diff 65 s -> 13,4 s (reste du diff expliqué dans `docs/bench.md`).
- Suite : cargo 459 passés, 1 échoué (`tests/relief-integration/tests/layers.rs::index_depends_on_no_language_crate_nor_detect`, le run s'arrête à ce crate ; le reste du workspace passe en `cargo test --workspace`) ; web 690/0. Baseline 620/0 + 690/0. Lint propre.
- Questions ouvertes : `layers.rs` (index_depends_on_no_language_crate_nor_detect) compte toutes les dépendances, dev comprises, et échoue à cause des dev-dependencies `relief-detect` et `relief-lang-ts` ajoutées à `relief-index` par le red (que `rules.md` tolère) ; il doit utiliser `relief_normal_deps` : un fichier de test existant à ajuster (je n'y ai pas touché). Le diff d'excalidraw reste à 1,02 s (budget 1 s).

## Answer

- Cache par blob en format 5 : il garde l'index de fichier sérialisé à côté de l'extraction (`LanguageAdapter::extract_indexed` / `link_indexed`, `LinkContext::indexes`), donc `link` ne reparse plus à chaud. Un cache de format 4 est ignoré puis remplacé.
- `Indexer` garde en mémoire les blobs déjà extraits : une `Session` ne reparse que les blobs changés d'une plage. `TsAdapter` est `Clone` avec un compteur partagé `parses()` (observé par les tests), et mémorise les signatures par contenu.
- Le test `file_index_cache.rs` vit dans `tests/relief-integration/` : `relief-index` n'a pas `relief-detect` ni `relief-lang-ts` en dev-dependencies (test des couches strict).
- `just bench` (`docs/bench.md` à jour) : excalidraw à chaud 1,6 s → 0,13 s (critère < 0,3 s tenu), diff 3,2 s → 1,02 s (budget 1 s, écart expliqué : `link` résout encore tous les imports des deux côtés, ce que vise S11) ; n8n à chaud 30 s → 5,0 s (budget 10,3 s tenu), diff 65 s → 13,4 s. Nombres de nœuds inchangés.
- Vérifié : cargo 626 / 0, web 690 / 0 (baseline 620 / 690), `just lint` propre. Review : ship.
- `Consider` non appliqués : mémoire de l'`Indexer` et mémo des signatures non bornés (RAM sur n8n si la `Session` parcourt beaucoup de commits) ; clé de contenu en `DefaultHasher` 64 bits plutôt que le sha du blob ; `resolve_import` désérialise tout l'index d'un fichier pour lire `instances` ; détour `indexes` → `adapter_indexes`.
