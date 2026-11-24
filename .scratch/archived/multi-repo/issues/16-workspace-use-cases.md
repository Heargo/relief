# K16 Les cas d'usage qui refusent encore un espace de travail

Status: resolved
Type: bug
Blocked by: K08
UI: oui
Doc: docs/user `workspace` (limites)

Spec: `../spec.md` (Modèle et ids)

## Signalement (2026-11-24)

En espace de travail (un dépôt Angular, un dépôt Java), cliquer sur un nœud, même un `.ts`, affiche « Code indisponible ».

## Cause

K08 a porté `snapshot`, `diff`, `analyse`, `review_summary`, `reading_order` et `impact` sur l'union des dépôts. Les autres cas d'usage de `relief-app` passent encore par `Session::git()`, qui répond `AppError::Workspace` (« not available on a workspace yet ») :

- `code` : panneau du nœud **et panneau de diff** (le diff texte d'un espace ne s'affiche donc jamais) ;
- `edge_usages` : panneau d'une arête ;
- `search` : barre de recherche ;
- `log`, `commit_reading` : lecture par commit ;
- `metrics`, `co_change` : mode Explorer.

`rules` est hors périmètre (K14).

## Comportement attendu

- Chacun de ces cas d'usage marche en espace : un id préfixé `repo:<nom>/…` est servi par son dépôt membre, à la plage de ce dépôt (sa comparaison source → destination, de session ou du fichier), et les ids rendus sont préfixés. Un cas d'usage sans nœud (recherche, métriques, co-changement, journal) couvre l'union des dépôts.
- Pas de cas particulier par cas d'usage quand une aide commune suffit (résolution « id préfixé → dépôt membre, sa source git, sa plage, id local ») ; monodépôt strictement inchangé.
- `log` / `commit_reading` en espace : à défaut d'un ordre commun, les commits de chaque dépôt, chacun marqué de son dépôt (préciser dans `## Answer`).

## Critères d'acceptation

- [x] Cas d'usage sur `shop-space` : `code` d'un fichier et d'un symbole préfixés (base et head) ; `edge_usages` d'une arête d'un dépôt et d'une arête entre dépôts ; `search` trouve un symbole de chaque dépôt (ids préfixés) ; `log`, `commit_reading`, `metrics`, `co_change` répondent sans erreur et portent des ids préfixés.
- [x] e2e `shop-space` : cliquer un fichier montre son code ; le panneau de diff d'un fichier modifié montre son diff ; la recherche trouve un symbole de l'autre dépôt.
- [x] Doc FR/EN `workspace` : retirer toute limite devenue fausse.

## Baseline

Après `93df00a` : cargo 831/0 ; web 1160/0 ; e2e 200 passés, 1 ignoré.

## Seams

- **Cas d'usage `relief-app` sur un espace de deux dépôts de fixture (`shop-space`)** : chaque cas d'usage listé, ids préfixés en entrée et en sortie, plage propre à chaque dépôt ; monodépôt inchangé (snapshots `insta` existants). Rate l'UI.
- **e2e `shop-space`** (`// @workspace shop-space`) : code d'un nœud dans le panneau, diff d'un fichier modifié, recherche d'un symbole de l'autre dépôt. Rate les cas limites.

## Red

- Fichiers de test : `src/app/relief-app/tests/workspace_use_cases.rs`, `tests/e2e/tests/workspace-use-cases.e2e.ts`
- Lancer : `cargo test -p relief-app --test workspace_use_cases` ; `cd tests/e2e && timeout 900 xvfb-run -a npx wdio run wdio.conf.ts --spec tests/workspace-use-cases.e2e.ts`
- En échec : 11 tests Rust + 3 e2e, tous avec `AppError::Workspace("not available on a workspace yet")` (Rust) ou panneau sans `node-code` / sans `diff-panel` (e2e) :
  - the_code_of_a_file_is_read_in_its_repository_at_each_side_of_its_range — `code` refuse l'espace
  - the_code_of_an_unchanged_file_is_the_same_on_both_sides — idem
  - the_code_of_a_symbol_is_its_declaration_at_each_side — idem
  - an_unknown_node_of_a_repository_is_still_refused — `Workspace` au lieu de « unknown node »
  - the_usages_of_an_edge_inside_a_repository_are_listed_with_prefixed_files — `edge_usages` refuse l'espace
  - the_usages_of_an_edge_between_repositories_are_listed — idem
  - the_search_finds_a_symbol_of_each_repository_with_prefixed_ids — `search` refuse l'espace
  - the_log_lists_the_commits_of_each_repository — `log` refuse l'espace
  - the_commit_reading_lists_the_commits_of_each_repository_with_prefixed_files — `commit_reading` refuse l'espace
  - the_metrics_cover_the_files_of_every_repository_with_prefixed_ids — `metrics` refuse l'espace
  - the_co_change_pairs_stay_inside_a_repository_and_carry_its_prefix — `co_change` refuse l'espace
  - e2e « shows the code of a file clicked on the map » — `node-code` absent (code indisponible)
  - e2e « shows the text diff of a modified symbol, on the range of its repository » — aucune ligne `diff-line` ajoutée
  - e2e « finds a symbol of the other repository and shows its code » — `node-code` absent
- Hypothèses à confirmer au green : `log` en espace ignore `rev` et rend les 4 commits (2 par dépôt) sans champ de dépôt ; l'usage d'une arête inter-dépôts (`web OrderList.ts` → `api types.ts`) liste le binding `Order` dans `OrderList.ts`.

## Green

- Fichiers : `src/app/relief-app/src/union.rs`, `src/app/relief-app/src/lib.rs`, `src/domain/relief-model/src/api.rs`, `docs/contract/{log,commit-reading}-response.schema.json`, `src/ui/src/app/core/models/contract.ts`, `src/ui/src/app/modules/review/{helpers/commit-replay.logic.ts,components/reading-order-section/*.html,components/range-picker/*.html}`, docs `workspace.md` FR/EN ; nouveaux tests `src/app/relief-app/tests/workspace_history_repo.rs`, `reading-order-section-repo.component.spec.ts`
- Changement : aide commune `Session::locate` (id préfixé -> dépôt membre, sa `GitSource`, sa plage, id local) ; `code`, `edge_usages`, `commit_reading`, `metrics`, `co_change`, `log` réutilisent leur corps monodépôt extrait (`*_in`/`*_of`) par dépôt membre ; `search` classe le snapshot union. `LogEntry.repo` et `CommitReadingEntry.repo` (`Option`, omis en monodépôt) remplis en espace, affichés en tag devant le commit (lecture par commit, sélecteur de plage). `log` en espace ignore `rev`, liste web puis api. Doc FR/EN mise à jour.
- Suite : cargo 844/0 (baseline 831/0), web 1162/0 (baseline 1160/0) ; e2e `workspace-use-cases` 3/3, `workspace-map` 4/4, `multi-repo-journey` 5/5, `commit-replay` 5/5 ; lint propre.
- Questions ouvertes : arête inter-dépôts par contournement (l'arête ne porte pas le nom importé : on cherche les symboles du fichier d'entrée de l'autre dépôt), faux positif possible si un autre module exporte un nom identique.

## Review

Verdict : ship. Considers appliqués : `limit` du journal par dépôt (le second dépôt ne disparaît plus), commentaires remis en place, `cross_repo_wanted` extrait, doc sur la lecture de `metrics`/`co_change` à la source de chaque dépôt. Limite gardée : les usages d'une arête entre dépôts prennent les symboles du fichier d'entrée de l'autre dépôt (l'arête ne porte pas le nom importé), d'où un faux positif possible si un même nom vient d'un autre module.

## Answer

- `Session::locate` (union.rs) : un id préfixé `repo:<nom>/…` → son dépôt membre, sa source git, sa plage (comparaison de session comprise), son id local ; un id non préfixé ou un dépôt inconnu est refusé (`UnknownNode`).
- `code`, `edge_usages`, `commit_reading`, `metrics`, `co_change`, `log` réutilisent leur corps monodépôt extrait (`*_in`/`*_of`) par dépôt, ids et chemins préfixés ; `search` classe le snapshot union. Monodépôt inchangé.
- `LogEntry.repo` et `CommitReadingEntry.repo` (omis en monodépôt), affichés devant le commit dans la lecture par commit et le sélecteur de plage ; en espace, `log` lit chaque dépôt à sa source, `limit` par dépôt.
- Vérifié : cargo 844/0, web 1162/0, e2e 203 passés / 1 ignoré, lint propre, docs-build.
- Doc : `workspace` FR/EN.
