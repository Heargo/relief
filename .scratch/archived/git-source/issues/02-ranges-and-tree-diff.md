# Plages, diff d'arbres et log

Status: resolved
Type: task
Blocked by: G01
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : RevSpec)

## À faire

- Parse des `RevSpec` texte : `A..B`, `A...B`, une seule ref (pour `relief show`), `WORKTREE`, `INDEX`.
- `merge_base(a, b)`.
- `diff_trees(old, new) -> Vec<FileChange { status: added|deleted|modified|renamed{from, similarity}, path, old_blob, new_blob, lines_added, lines_removed }>` avec détection des renommages (seuil 50 %, comme `git -M`).
- `log(range) -> Vec<CommitInfo { id, short, message, author, date, files }>` dans l'ordre chronologique, sans les merges par défaut.

## Critères d'acceptation

- [x] Sur acme-shop, `main...feat/promo-codes` : 15 fichiers changés, dont le renommage `apps/web/utils/format.ts` → `packages/shared/money/format.ts` (snapshot `insta` de la liste).
- [x] `log` de la même plage donne les 5 commits de la maquette avec leurs fichiers.
- [x] `A..B` et `A...B` diffèrent quand `main` a avancé après la création de la branche (fixture `tiny` étendue d'un commit sur `main`).

## Baseline

`just test-summary` sur `develop` (1b58cca) : cargo 180 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. **`relief_git::RevSpec` (parse depuis le texte), fonction publique testée sans git** : attrape le découpage `A..B` / `A...B` / ref seule / `WORKTREE` / `INDEX` et les erreurs de syntaxe ; rate la résolution des refs dans un vrai dépôt.
2. **`GitSource` (`merge_base`, `diff_trees`, `log`, résolution d'une plage) sur des dépôts `relief-fixtures`** (acme-shop, `tiny` étendu d'un commit sur `main` après la branche), sorties figées par `insta` : attrape les 15 fichiers et le renommage de `main...feat/promo-codes`, les 5 commits du log avec leurs fichiers, la différence `A..B` / `A...B`, les compteurs de lignes ; rate la sortie CLI/API (tickets suivants).

## Red

- Fichiers de test : `crates/relief-git/tests/rev_spec.rs`, `crates/relief-git/tests/ranges.rs` (dev-dependency `insta = "1"` ajoutée à `crates/relief-git/Cargo.toml`)
- Lancer : `cargo test -p relief-git --test rev_spec && cargo test -p relief-git --test ranges`
- En échec : 15 tests (tous ne compilent pas : symboles manquants dans `relief_git`)
  - rev_spec (6) : `two_dots_split_into_a_plain_range`, `three_dots_split_into_a_merge_base_range`, `a_lone_ref_is_a_single_rev`, `worktree_and_index_are_virtual_revs`, `ranges_accept_shas_on_both_sides`, `malformed_specs_are_rejected` — `RevSpec` n'existe pas.
  - ranges (9) : `merge_base_of_diverged_branches_is_the_fork_point`, `merge_base_of_an_ancestor_is_the_ancestor`, `two_dots_compare_the_trees_as_they_are`, `three_dots_compare_against_the_merge_base`, `log_of_a_diverged_range_lists_only_the_branch_commits`, `diff_trees_reports_modified_deleted_and_renamed_files`, `an_unknown_ref_in_a_range_is_an_error`, `acme_shop_promo_codes_changes_fifteen_files`, `acme_shop_log_gives_the_five_commits_of_the_mockup` — `GitSource::{merge_base, diff_trees, log, resolve_range}`, `FileChange`, `FileStatus`, `ResolvedRange` n'existent pas.

### API attendue par les tests (à créer par green, dans `relief_git`)

- `enum RevSpec { Single(String), Range { from, to }, MergeBase { from, to }, Worktree, Index }` (`Debug + PartialEq`), `RevSpec::parse(&str) -> Result<_, GitError>` ; erreur pour `""`, `..`, `...`, `a..`, `..b`, `a...`, `...b`, `a....b`. `v1.0` est une ref seule.
- `struct ResolvedRange { pub old: CommitId, pub new: CommitId }` ; `GitSource::resolve_range(&RevSpec) -> Result<ResolvedRange, GitError>` : `A..B` -> old=A, new=B ; `A...B` -> old=merge_base(A,B), new=B ; ref inconnue = erreur.
- `GitSource::merge_base(&CommitId, &CommitId) -> Result<CommitId, GitError>`.
- `GitSource::diff_trees(&CommitId, &CommitId) -> Result<Vec<FileChange>, GitError>`, trié par `path`, renommages à 50 %.
- `struct FileChange { status: FileStatus, path: String, old_blob: Option<BlobId>, new_blob: Option<BlobId>, lines_added, lines_removed }` (entiers, comparés à des littéraux) ; `enum FileStatus { Added, Deleted, Modified, Renamed { from: String, similarity: <entier, pourcentage> } }` (`Debug + PartialEq + Display` sur la similarité). `path` = nouveau chemin pour un renommage.
- `GitSource::log(&ResolvedRange) -> Result<Vec<CommitInfo>, GitError>` : commits atteignables depuis `new` et pas depuis `old`, ordre chronologique, sans merges ; `CommitInfo { id: CommitId, short: String (>= 7 car., préfixe de l'id), message: String (message complet, trim_end comparé), author: String (nom, "Fixture"), date, files: Vec<FileChange> }` (files triés par `path`, avec détection de renommage).

### Fixture `tiny` : non modifiée

Étendre `tiny` d'un commit sur `main` après la branche est impossible sans toucher au code de `relief-fixtures` (`build_with_worktree` fait `checkout -B <branch>` : un `branch: main` tardif réinitialiserait `main` sur la pointe de la branche). Les tests construisent donc la variante eux-mêmes avec le binaire `git` sur un dépôt `tiny` (`tiny_diverged()` : branche `feat` créée à `edit`, un commit `src/feat.ts`, retour sur `main` qui est à `reshape`). Aucun snapshot existant n'est touché. Si on veut une vraie fixture, green devra faire apprendre à `relief-fixtures` de revenir sur une branche existante (hors périmètre ici).

### Contenu attendu des snapshots (acme-shop, `main...feat/promo-codes`), à vérifier par la review

Format du rendu (défini dans le test) : `A|D|M  path  +ajoutées -supprimées`, `R<similarité> ancien -> nouveau  +a -r`.

`acme_main_to_promo_codes_changes` : 15 lignes, triées par chemin, dont 1 renommage R100 et 1 suppression :
M apps/api/auth/session.ts +2 -2 ; A apps/api/billing/discount.ts +17 -0 ; M apps/api/billing/invoice.ts +4 -2 ; D apps/api/billing/legacyCoupon.ts +0 -6 ; M apps/api/billing/payment.ts +2 -0 ; M apps/api/routes/checkout.ts +12 -3 ; M apps/api/routes/invoices.ts +1 -1 ; M apps/web/components/CartSummary.tsx +4 -3 ; A apps/web/components/PromoCodeInput.tsx +25 -0 ; M apps/web/pages/Checkout.tsx +9 -4 ; M apps/web/pages/Invoices.tsx +1 -1 ; A packages/db/repos/discountRepo.ts +9 -0 ; A packages/db/schema/discounts.ts +7 -0 ; M packages/shared/http/client.ts +29 -29 ; `R100 apps/web/utils/format.ts -> packages/shared/money/format.ts  +0 -0` (trié à sa place de nouveau chemin, après `packages/shared/http/client.ts`). Valeurs issues de `git diff --numstat -M main...feat/promo-codes`.

`acme_promo_codes_log` : 5 blocs `== <message>` dans l'ordre db, discount, auth, move, checkout, avec les fichiers :
db : A packages/db/repos/discountRepo.ts, A packages/db/schema/discounts.ts ; discount : A apps/api/billing/discount.ts, M apps/api/billing/invoice.ts, M apps/api/routes/invoices.ts ; auth : M apps/api/auth/session.ts, M apps/api/billing/payment.ts ; move : M apps/web/pages/Invoices.tsx, M packages/shared/http/client.ts, R100 apps/web/utils/format.ts -> packages/shared/money/format.ts ; checkout : D apps/api/billing/legacyCoupon.ts, M apps/api/routes/checkout.ts, M apps/web/components/CartSummary.tsx, A apps/web/components/PromoCodeInput.tsx, M apps/web/pages/Checkout.tsx (compteurs de lignes par `git log --numstat -M`). Les tests contiennent aussi des assertions explicites (15 fichiers, renommage, message et id des 5 commits).

## Green

- Fichiers : `crates/relief-git/src/lib.rs`, `crates/relief-git/Cargo.toml` (feature gix `blob-diff`), `crates/relief-git/tests/snapshots/ranges__acme_main_to_promo_codes_changes.snap`, `crates/relief-git/tests/snapshots/ranges__acme_promo_codes_log.snap`
- Changement : `RevSpec::parse`, `ResolvedRange`, `GitSource::{resolve_range, merge_base, diff_trees, log}`, `FileChange`, `FileStatus`, `CommitInfo`, `GitError::InvalidRevSpec`. `diff_trees` s'appuie sur `gix` (renommages 50 %, compteurs de lignes via blob-diff) ; `log` fait un rev_walk avec hidden, inversé, merges exclus. Les deux snapshots insta sont acceptés après vérification contre la description de Red.
- Suite : cargo 195 passed, 0 failed (baseline 180/0) ; web 2/0 ; lint propre ; aucun fichier de test modifié.
- Questions ouvertes : aucune

## Review

- Verdict : ship
- Must fix : aucun.
- Consider :
  - `diff_tree_objects` : les erreurs de comptage de lignes sont avalées en `(0, 0)` ; les propager via `backend` (un binaire resterait à 0/0).
  - même fonction : tuple de 5 éléments rempli dans chaque bras du `match` ; construire un `FileChange` par bras ou une petite struct, `counts` en `Option<(u32, u32)>`.
  - `diff_trees` et `log` répètent `find_commit(..)?.tree()?` : extraire un helper `tree_of(&CommitId)`.
  - `resolve_range`, bras `_ =>` : le message `{spec:?} is not a range` expose du Debug Rust ; message lisible ou variante dédiée.
  - `CommitInfo.date` prend l'heure de l'auteur alors que la fonction voisine prend celle du committer : harmoniser ou documenter.
  - `similarity` : cast `(d.similarity * 100.0).round() as u32`, correct tant que gix reste dans [0, 1].

## Documentation

Ticket interne (`relief-git`, aucune commande ni écran) : la doc utilisateur ne change pas. Les plages `A..B` / `A...B` / `WORKTREE` / `INDEX` seront documentées avec les commandes CLI qui les exposent (feature `cli/`), une fois le site F05 en place.

## Answer

- Construit dans `relief-git` : `RevSpec::parse` (`A..B`, `A...B`, ref seule, `WORKTREE`, `INDEX`, erreurs `GitError::InvalidRevSpec`), `ResolvedRange` et `GitSource::resolve_range` (merge-base pour `A...B`), `merge_base`, `diff_trees` (gix, renommages à 50 %, compteurs de lignes via la feature gix `blob-diff`, trié par chemin), `log` (rev_walk avec `hidden`, ordre chronologique, sans merges) et `CommitInfo`.
- Décision : la fixture `tiny` n'est pas modifiée (le builder fait `checkout -B`, un retour sur `main` demanderait de changer `relief-fixtures`) ; la variante divergente est construite dans le test `ranges.rs` (`tiny_diverged()`).
- Vérifié : `cargo test -p relief-git --test rev_spec` (6) et `--test ranges` (9), dont les snapshots insta des 15 fichiers de `main...feat/promo-codes` (renommage R100 `apps/web/utils/format.ts` → `packages/shared/money/format.ts`) et des 5 commits du log ; suite complète cargo 195/0 (baseline 180/0), web 2/0 ; `just lint` propre ; review `ship`.
