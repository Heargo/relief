# Fixture acme-shop (le faux repo de la maquette)

Status: resolved
Type: task
Blocked by: F02
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : acme-shop)

## À faire

- `fixtures/acme-shop/` : monorepo pnpm (`pnpm-workspace.yaml`, un `package.json` par package, `tsconfig.json` avec `paths` `@acme/*`) reprenant les fichiers et symboles de la maquette (`maquette/index.html` : `TOP`, code des symboles, `E_SPEC`).
- Commit `base` sur `main` : l'état avant la PR (avec `apps/web/utils/format.ts`, `billing/legacyCoupon.ts`, `refresh()` qui lève, etc.).
- Branche `feat/promo-codes` : les 5 commits de `COMMITS` dans la maquette, mêmes messages, mêmes fichiers. Le code TS doit être plausible et cohérent (les imports résolvent), pas forcément exécutable.
- Le commit `e4a2f90`-équivalent reformate `packages/shared/http/client.ts` sans changement structurel.
- La violation existante `routes-via-repos` (`listInvoices` → `invoicesTable`) est déjà sur `main`.
- Un `relief.config.yaml` à la racine avec les 3 règles de la maquette.
- Quelques tests `*.spec.ts` (pour que « testé / sans test » ait du sens) : `computeTotal`, `applyDiscount`, `requireAuth`, `chargeCustomer`, `postCheckout`, `getInvoice`, `CheckoutPage`, `CartSummary`.

## Critères d'acceptation

- [x] `just fixture acme-shop /tmp/acme` construit le dépôt ; `git -C /tmp/acme log --oneline main..feat/promo-codes` liste 5 commits avec les messages de la maquette.
- [x] Test : `git diff --stat main...feat/promo-codes` touche exactement les 15 fichiers de la maquette (dont 1 renommage `apps/web/utils/format.ts` → `packages/shared/money/format.ts`).
- [x] `npx tsc --noEmit -p` sur le dépôt construit passe (avec des déclarations minimales pour les libs externes), pour garantir que les imports sont cohérents.

## Baseline

`just test-summary` sur `develop` (350dd38) : cargo 39 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

- **Bibliothèque `relief-fixtures` (construction d'acme-shop dans un dossier temporaire), interrogée avec le vrai binaire `git`** (`crates/relief-fixtures/tests/acme_shop.rs`) : attrape les 5 commits et leurs messages sur `main..feat/promo-codes`, les 15 fichiers exacts de `git diff --stat main...feat/promo-codes` dont le renommage `apps/web/utils/format.ts` → `packages/shared/money/format.ts`, le commit qui ne fait que reformater `packages/shared/http/client.ts`, la violation `listInvoices` → `invoicesTable` déjà sur `main`, `relief.config.yaml` avec les 3 règles, la présence des `*.spec.ts` listés, le déterminisme (SHA stables) ; rate la cohérence TypeScript.
- **CLI `relief-fixtures build acme-shop <dir>`** (ce qu'appelle `just fixture`, `assert_cmd`) : attrape que le nom `acme-shop` est connu de la commande ; rate le contenu détaillé.
- **`tsc --noEmit -p` (le `tsc` de `web/node_modules`) sur le dépôt construit, aux deux bouts (`main` et `feat/promo-codes`)** : attrape les imports qui ne résolvent pas et les incohérences de types ; rate tout ce qui n'est pas TypeScript.

## Red

- Fichiers de test : `crates/relief-fixtures/tests/acme_shop.rs` (nouveau), `crates/relief-fixtures/tests/cli.rs` (un test ajouté)
- Lancer : `cargo test -p relief-fixtures --test acme_shop` et `cargo test -p relief-fixtures --test cli`
- Le `fixture.yaml` des commits est supposé avoir un commit d'id `base` (sha lisible par `BuiltRepo::sha("base")`) ; les autres ids sont libres. `tsc` est cherché à `web/node_modules/.bin/tsc` via `CARGO_MANIFEST_DIR`, `tsconfig.json` à la racine du dépôt construit.
- En échec : 13 tests, tous parce que `fixtures/acme-shop/fixture.yaml` n'existe pas (`Fixture::load("acme-shop")` → NotFound ; côté CLI, `relief-fixtures build acme-shop` échoue) :
  - acme_shop::feature_branch_has_the_five_commits_of_the_mockup — 5 messages de commit
  - acme_shop::main_holds_only_the_base_commit — main = un seul commit `base`
  - acme_shop::pull_request_touches_exactly_the_fifteen_files_of_the_mockup — 15 fichiers dont 1 renommage
  - acme_shop::prettier_commit_only_reformats_the_http_client — client.ts ne change que par les espaces
  - acme_shop::list_invoices_violation_is_already_on_main — listInvoices/invoicesTable sur main
  - acme_shop::base_state_matches_the_state_before_the_pull_request — format.ts, legacyCoupon.ts, refresh() qui lève
  - acme_shop::relief_config_declares_the_three_rules_of_the_mockup — 3 règles
  - acme_shop::workspace_has_one_package_json_per_package_and_alias_paths — workspace pnpm, `@acme/*`
  - acme_shop::spec_files_cover_the_listed_symbols — 8 symboles testés
  - acme_shop::building_twice_gives_identical_shas — déterminisme, 6 commits sur la branche
  - acme_shop::typescript_compiles_on_main — tsc --noEmit
  - acme_shop::typescript_compiles_on_feat_promo_codes — tsc --noEmit
  - cli::build_subcommand_knows_acme_shop — `build acme-shop` doit réussir et donner 5 commits

## Green

- Fichiers : `fixtures/acme-shop/fixture.yaml`, `fixtures/acme-shop/{base,db,discount,auth,move,checkout}/` (overlays par commit, `_delete.txt` dans `move` et `checkout`)
- Changement : fixture acme-shop en 6 commits (`base` sur main, puis 5 commits sur `feat/promo-codes` avec les messages de la maquette). Monorepo pnpm, `tsconfig.json` (`paths` `@acme/*`, `strictNullChecks` désactivé car `middleware.ts`/`renewals.ts` non modifiés utilisent `refresh()` sans test de null), déclarations minimales des libs externes dans `types/external.d.ts`, `relief.config.yaml` à 3 règles, 7 fichiers de spec. Le spec d'`applyDiscount` est un `it.todo` dans `invoice.spec.ts` (aucun spec ne peut changer dans la PR).
- Suite : cargo 52 passed, 0 failed (baseline 39) ; web 2 passed, 0 failed (identique)
- Questions ouvertes : aucune

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `fixtures/acme-shop/base/apps/api/billing/invoice.spec.ts` : `applyDiscount` n'a qu'un `it.todo` (la maquette le marque testé). Contournement voulu : les 15 fichiers de la PR sont figés, aucun spec ne peut y changer. Écart connu : les tickets de diff ne doivent pas attendre `applyDiscount` testé.
  - `fixtures/acme-shop/move/packages/shared/http/client.ts` : le commit « prettier » passe l'indentation de 2 à 4 espaces (+29/−29, espaces seulement). Peu réaliste comme sortie de prettier ; un `tabWidth: 4` dans une config prettier serait plus crédible. Cosmétique.
  - `fixtures/acme-shop/base/tsconfig.json` : `strictNullChecks: false`, pour que `middleware.ts` et `renewals.ts` (non modifiés par la PR) compilent après le passage de `refresh()` à `null`. Écart assumé avec `strict`.

## Doc

Ticket interne (fixture de test) : la doc utilisateur ne change pas.

## Answer

- Construit : `fixtures/acme-shop/` (`fixture.yaml` + un overlay par commit : `base`, `db`, `discount`, `auth`, `move`, `checkout`, suppressions via `_delete.txt`). `base` sur `main` (avec `apps/web/utils/format.ts`, `billing/legacyCoupon.ts`, `refresh()` qui lève, violation `listInvoices` → `invoicesTable`), puis les 5 commits de la maquette sur `feat/promo-codes`, mêmes messages. Monorepo pnpm, `tsconfig.json` avec `paths` `@acme/*`, `types/external.d.ts` pour les libs externes, `relief.config.yaml` avec les 3 règles, specs des symboles listés.
- Décisions : voir les trois lignes Consider (spec `applyDiscount` en `it.todo`, reformatage de `client.ts` par indentation, `strictNullChecks` désactivé).
- Vérifié : `crates/relief-fixtures/tests/acme_shop.rs` (12 tests : commits, 15 fichiers dont le renommage, commit de reformatage, violation sur main, config, workspace, specs, déterminisme des SHA, `tsc --noEmit` sur `main` et `feat/promo-codes`) et `cli.rs` (`build acme-shop`). `just fixture acme-shop <dir>` lancé à la main : 5 commits, 15 fichiers. Suite : cargo 52 passed (baseline 39), web 2 passed ; `just lint` propre.
