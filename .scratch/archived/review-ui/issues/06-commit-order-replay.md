# Ordre par commit et rejeu sur la carte

Status: resolved
Type: task
Blocked by: R05
UI: oui
Doc: docs/user `review` (rejouer commit par commit)

Spec: `../spec.md` (Décisions : ordre par commit)

## À faire

- Option « Commit » de l'ordre de lecture : commits de la plage (SHA court, message, x/y vus, nombre de fichiers sans changement structurel), avec leurs fichiers en dessous.
- Clic sur un commit : la carte ne colore que les changements de ce commit (nœuds et arêtes, d'après `EdgeChange.commit` et les fichiers du commit) et se cadre sur ses fichiers ; re-clic ou « voir tous les commits » enlève le filtre ; `n`/`p` passent de commit en commit.
- Un fichier touché par plusieurs commits apparaît sous chacun ; dans ce cas le diff du panneau est celui du commit sélectionné (commande `diff` avec la plage `<parent>..<commit>` ; vérifier que `RangeSpec::parse` accepte un commit isolé en deux points).

## Critères d'acceptation

- [x] e2e WebdriverIO : mode Commit, clic sur « refactor(auth): refresh() renvoie null… » → seuls `session.ts` et `payment.ts` sont colorés ; « voir tous les commits » rétablit tout.
- [x] Test de `Session::diff` sur un commit isolé d'acme-shop (snapshot `insta`).
- [x] Le « vu » par commit réutilise l'état de R05 (aucun nouveau fichier d'état).

## Baseline

`just test-summary` (develop, 5d6bdd3) : cargo 423 passed, 0 failed ; web 369 passed, 0 failed.

## Seams

- **Cas d'usage de `relief-app` sur la fixture acme-shop** : `Session::diff` sur un commit isolé `<parent>..<commit>` (snapshot `insta`, et `RangeSpec::parse` en deux points) et l'ordre par commit exposé à l'UI (granularité `commit` de `Session::reading_order`, ou cas d'usage voisin, avec SHA court, message, fichiers structurels et nombre des autres, via `relief_diff::reading_by_commit`) ; rate le rendu et le filtre de la carte.
- **Module de logique TS (`reading-order.logic.ts` ou un `commit-replay.logic.ts` voisin, Vitest)** : attrape le filtre de la carte sur un commit (nœuds et arêtes d'après `EdgeChange.commit` et les fichiers du commit), « x/y vus » par commit calculé sur l'état « vu » de R05 sans nouvel état, `n`/`p` de commit en commit, un fichier listé sous plusieurs commits ; rate le rendu et la persistance.
- **e2e WebdriverIO sur l'app construite et acme-shop** : mode Commit, clic sur « refactor(auth): refresh() renvoie null… » → seuls `session.ts` et `payment.ts` colorés ; « voir tous les commits » rétablit tout ; rate les cas limites de la logique.

## Red

- Fichiers de test : `src/app/relief-app/tests/commit_reading.rs`, `src/app/relief-app/tests/commit_diff.rs` (+ `src/app/relief-app/tests/snapshots/commit_diff__auth_commit_diff.snap`, relu à la main : `session.ts` et `payment.ts`, 2 arêtes ajoutées au commit `auth`), `src/ui/src/app/modules/review/helpers/commit-replay.logic.spec.ts`, `tests/e2e/tests/commit-replay.e2e.ts`
- Lancer : `cargo test -p relief-app --test commit_reading` ; `cargo test -p relief-app --test commit_diff` ; `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/review/helpers/commit-replay.logic.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/commit-replay.e2e.ts` (après `just build`)
- API attendue (à créer par green) :
  - Rust : `relief_app::{CommitReadingRequest { range: Option<RangeSpec> }}`, `Session::commit_reading(&req) -> Result<CommitReadingResponse { commits: Vec<CommitReadingEntry { commit, short (7 car.), message, files: Vec<ReadingItem>, other_files: usize }> }, AppError>`, du plus ancien au plus récent (via `relief_diff::reading_by_commit` ; le message vient de git). Dev-dependency `insta = { version = "1", features = ["json"] }` à ajouter à `relief-app` (Cargo.toml non modifié par red).
  - TS : `commit-replay.logic.ts` exportant `CommitEntry`, `commitScope`, `isNodeInScope`, `isEdgeInScope`, `commitProgress`, `commitsOfFile`, `commitDiffRange`, `stepCommit`.
  - UI (data-testid) : `reading-mode-commit`, `commit-row` (`data-commit`, `data-seen-count`, `data-total-count`, `data-selected`), `commit-show-all` ; hors filtre, `map-node` sans `data-diff-status` ou `unchanged`.
- Écart : aucun avec les données d'acme-shop (le commit auth touche bien `session.ts` et `payment.ts`, 0 autre fichier ; le test e2e suppose l'attribut `data-diff-status` aussi à `unchanged`/absent hors filtre). La commande Tauri (`commit_reading`) n'a pas de test (hors seams), le test existant `reading_order ... "commit"` → `bad_request` reste valable.
- En échec : 8 fichiers/blocs, détail :
  - `commit_reading` (5 tests : cinq commits avec sha et message, commit auth = session+payment et 0 autre, fichiers format-only du commit move comptés, plage d'un seul commit, `diff` sur `parent..commit`) — ne compile pas : `CommitReadingRequest` et `Session::commit_reading` n'existent pas.
  - `commit_diff::diff_of_the_auth_commit_alone` — ne compile pas : `insta` absent des dev-dependencies de relief-app (le snapshot passe une fois la dépendance ajoutée, `diff` acceptant déjà `A..B`).
  - `commit-replay.logic.spec.ts` (15 tests : filtre nœuds/conteneurs/arêtes, x/y vus par commit, fichier sous plusieurs commits, plage `parent..commit`, `n`/`p`) — module `./commit-replay.logic` introuvable.
  - `commit-replay.e2e.ts` (5 tests : liste des 5 commits, filtre auth puis « voir tous », re-clic, `n`/`p`, « vu » par commit) — le hook `beforeEach` échoue : bouton `reading-mode-commit` introuvable.

## Green

- Fichiers : `src/app/relief-app/{Cargo.toml,src/lib.rs,src/range.rs}`, `src/domain/relief-model/src/{api,lib,contract}.rs` + `bin/write-contract.rs`, `src/interfaces/relief-desktop/{build.rs,capabilities/main.json,src/lib.rs,permissions/autogenerated/commit_reading.toml}`, `docs/contract/commit-reading-response.schema.json`, `src/ui/{scripts/generate-contract.mjs,public/i18n/{en,fr}.json}`, `src/ui/src/app/core/{models/contract.ts,services/relief-api.service.ts}`, `src/ui/src/app/modules/review/{helpers/commit-replay.logic.ts,business/reading-order.business.ts,components/reading-order-section/*}`, `src/ui/src/app/modules/map/{business/map.business.ts,components/map-page/*}`
- Changement : `Session::commit_reading` (diff de chaque commit contre le précédent, via `reading_by_commit`) et commande Tauri `commit_reading` (permission dans `build.rs` et la capability) ; `insta` en dev-dependency. UI : mode « Commit », `commit-replay.logic.ts`, filtre de la carte (seuls les fichiers du commit colorés, `MapBusiness.setCommitFiles`), cadrage sur les fichiers du commit (`MapBusiness.frameNodes`, retour à la vue précédente sur « voir tous » / re-clic), `n`/`p` de commit en commit, panneau de diff sur `parent..commit`.
- Suite : `just lint` propre ; cargo 431 réussis / 0 échoué (baseline 423), web 384 / 0 (baseline 369) ; e2e : `commit-replay.e2e.ts` passe en entier, 13 fichiers sur 14 passent.
- Questions ouvertes :
  - `just e2e-summary` ne va pas au bout : `docs-build` échoue, l'image `docs/user/src/assets/screens/fr/review-commits.png` référencée par la doc n'existe pas (capture à produire). J'ai donc construit le binaire à la main puis lancé wdio : seuls échouent les 3 tests du lien Aide (`docs.e2e`), parce que la doc n'est pas embarquée.
  - Tests `tauri::test` à faire écrire pour `commit_reading` (`src/interfaces/relief-desktop/tests/commands.rs` : 5 commits sur `main...feat/promo-codes`, `range` invalide en `bad_request`).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - src/ui/src/app/modules/review/business/reading-order.business.ts (`load(range, base = '')`) : si le diff de la plage n'est pas encore chargé, `base` vaut `''` et `commitDiffRange` produit `..<sha>` pour le premier commit ; ignorer la sélection tant que `base` est vide, ou le passer en paramètre obligatoire.
  - src/app/relief-app/src/lib.rs (`commit_reading`) : une analyse complète par commit (N analyses) ; acceptable pour 5 commits, à surveiller sur de longues plages.
  - src/ui/src/app/modules/map/components/map-page/map-page.component.ts : `panelView` objet ad hoc avec une fonction `has` ; un type nommé serait plus lisible.
  - Le ticket reste `Status: claimed` : à passer en résolu et archiver dans `.scratch/archived/` au commit. `quicknotes.md` non suivi, hors ticket : ne pas l'inclure.

## Answer

- Construit : `Session::commit_reading` (diff de chaque commit contre le précédent, `relief_diff::reading_by_commit`, SHA court et message de git) et commande Tauri `commit_reading` ; mode « Commit » de l'ordre de lecture (commits du plus ancien au plus récent, x/y vus, fichiers sans changement structurel comptés, fichiers du commit sélectionné en dessous) ; `commit-replay.logic.ts` ; filtre de la carte sur les fichiers du commit, cadrage sur ces fichiers et retour à la vue précédente par « Voir tous les commits » ou re-clic ; `n`/`p` de commit en commit ; panneau de diff sur `parent..commit`. `insta` en dev-dependency de `relief-app`.
- Décisions : le « vu » par commit réutilise l'état de R05 ; une plage malformée renvoie `invalid_range` (code existant) ; les e2e comptent les fichiers colorés une fois la carte stable, pour ne pas dépendre de l'animation ni du cadrage.
- Vérifié : `just test-summary` cargo 431/0, web 384/0 (baseline 423/369) ; `just e2e-summary` 66 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-shots review` et lecture de `review-commits` (seuls `session.ts` et `payment.ts` colorés, carte cadrée) ; `just docs-build` ; review « ship ».
- Doc : section « Rejouer commit par commit » de `review` (FR et EN), mode Commit ajouté à « Ordre de lecture ».
- Suivis (Consider) : ignorer la sélection d'un commit tant que la base de la plage n'est pas chargée (`..<sha>`) ; `commit_reading` analyse chaque commit, à mesurer avec S02 ; typer `panelView`.
