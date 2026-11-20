# Tracé de flux depuis un point d'entrée

Status: resolved
Type: task
Blocked by: X01, E06, R04
UI: oui
Doc: docs/user `explore` (suivre un flux)

Spec: `../spec.md`

## À faire

- Clic sur un point d'entrée : sélection + impact (commande `impact` de R04, direction `dependencies` ; aucun nouveau cas d'usage) en direction « dépendances » (surlignage, estompage, liste par profondeur), jusqu'aux externes (base de données, services).

## Critères d'acceptation

- [x] e2e WebdriverIO : `POST /checkout` → la liste contient `chargeCustomer`, `computeTotal` et atteint `stripe-sdk` (« Stripe API » et « PostgreSQL » dans la maquette, voir « Décision »).

## Baseline

`just test-summary` (develop, 02dc098) : cargo 467 passed, 0 failed ; web 434 passed, 0 failed.

## Seams

- **Business (`TestBed`, `ReliefApiService` mocké) qui déclenche le tracé** : attrape qu'un clic sur un point d'entrée sélectionne le nœud et appelle `impact` en direction `dependencies` (via HTTP selon la case), et que la section affiche le sens « Dépendances » ; rate les données réelles.
- **e2e WebdriverIO sur l'app construite et acme-shop, mode exploration** : `POST /checkout` → la liste contient `chargeCustomer`, `computeTotal`, `Stripe API` et `PostgreSQL` ; rate les cas limites.

Si `Stripe API` ou `PostgreSQL` ne sont pas atteints sur les données réelles, le signaler (les externes viennent du snapshot) plutôt que d'ajuster.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/components/map-page/map-page-flow-trace.component.spec.ts`, `tests/e2e/tests/flow-trace.e2e.ts`
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/map/components/map-page/map-page-flow-trace.component.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/flow-trace.e2e.ts`
- En échec : 3 tests (2 composant, 1 e2e)
  - `selects the entry point and asks for its dependencies` — le clic appelle `impact` en `callers`, pas `dependencies`.
  - `shows the dependencies direction and the reached nodes by depth` — le bouton pressé est `callers`.
  - e2e `POST /checkout lists chargeCustomer and computeTotal and reaches Stripe API and PostgreSQL` — `dependencies` n'est pas pressé après le clic sur le point d'entrée.
- Sonde sur `Session::impact` (jetable, supprimée), acme-shop `main...feat/promo-codes`, seed `postCheckout`, `dependencies`, profondeur 8, avec et sans HTTP : 17 nœuds atteints (profondeurs 1 à 4, dont `computeTotal` et `chargeCustomer` à 1), **aucun externe** : ni `stripe-sdk` ni `drizzle-orm`. Cause : les arêtes vers les externes sont des `imports` de fichier (`payment.ts -> pkg:external/stripe-sdk`, `userRepo.ts -> pkg:external/drizzle-orm`) ; la marche part d'un symbole et ne remonte pas aux imports de son fichier. `drizzle-orm` n'est de toute façon pas atteignable (`userRepo.ts` n'est pas dans le flux de `postCheckout`).
- Libellé affiché d'un externe dans la liste : `stripe-sdk` (`labelOf` retire `pkg:external/`).
- L'e2e (aligné sur la fixture) attend donc `chargeCustomer`, `computeTotal` et `stripe-sdk` ; il restera rouge tant que la marche n'atteint pas les externes importés par les fichiers du flux. `PostgreSQL` et `Stripe API` retirés.

### Red côté cœur (décision : la marche `dependencies` atteint les externes importés par les fichiers des nœuds atteints)

- Fichiers de test : `src/domain/relief-diff/tests/impact_externals.rs`, `src/app/relief-app/tests/impact_externals.rs`
- Lancer : `cargo test -p relief-diff --test impact_externals` ; `cargo test -p relief-app --test impact_externals`
- Profondeur retenue : profondeur du symbole dont le fichier importe l'externe + 1 (la graine compte 0) : un externe importé par le fichier de la graine est à 1, un externe importé par le fichier d'un symbole à 1 est à 2. `max_depth` s'applique. `callers` inchangé.
- En échec : 4 tests
  - `dependencies_reach_the_externals_imported_by_the_seed_file_at_depth_one` — `pkg:external/y` absent.
  - `dependencies_reach_the_externals_imported_by_the_file_of_a_reached_symbol` — `pkg:external/x` absent (attendu à 2).
  - `the_depth_limit_still_applies_to_externals` — `y` absent à `max_depth` 1.
  - `post_checkout_reaches_stripe_sdk_through_its_dependencies` (relief-app) — `pkg:external/stripe-sdk` absent.
- Passe déjà (garde-fou) : `callers_never_reach_externals`. Les tests R04 existants (8 et 6 appelants, `impact_graph`, `impact_acme`) passent et restent valables.

## Décision (orchestrateur)

Les externes de la fixture sont `pkg:external/stripe-sdk` et `pkg:external/drizzle-orm` ; « Stripe API » et « PostgreSQL » viennent de la maquette. Le critère suit la fixture : `POST /checkout` atteint `chargeCustomer`, `computeTotal` et `stripe-sdk` (`drizzle-orm` n'est pas dans le flux de `postCheckout`). Pour atteindre les externes, la marche `dependencies` de `relief_diff::impact` suit les imports des fichiers des nœuds atteints vers les externes (profondeur du symbole + 1) ; ce n'est pas un nouveau cas d'usage ; `callers` ne change pas (R04 : 8 et 6).

## Green

- Fichiers : `src/domain/relief-diff/src/lib.rs`, `src/ui/src/app/modules/map/components/map-page/map-page.component.ts`, `src/ui/src/app/modules/map/components/map-page/map-page.component.html`
- Changement : `impact` en direction `dependencies` ajoute les externes importés (`imports` fichier -> `pkg:external/*`) par le fichier de chaque symbole visité, graine comprise, à la profondeur du symbole + 1 (`max_depth` respecté, `callers` inchangé). Côté UI, un clic sur un point d'entrée passe l'impact en `dependencies` puis sélectionne le nœud (`traceEntryPoint`).
- Suite : cargo 472 passed, 0 failed ; web 436 passed, 0 failed (baseline 467 / 434, +5 et +2 = tests rouges) ; e2e 76 passed, 1 skipped, 0 failed.
- Questions ouvertes : `just lint` échoue seulement sur le formatage des fichiers de test rouges (`cargo fmt --check` sur `src/domain/relief-diff/tests/impact_externals.rs`, Prettier sur `map-page-flow-trace.component.spec.ts`), que je n'ai pas le droit de modifier ; à reformater côté red.

## Review

- Verdict : ship
- Must fix : aucun (`callers` inchangé : le bloc externes est gardé par `Direction::Dependencies`, test `callers_never_reach_externals` ; `max_depth` s'applique aux externes : un symbole à la profondeur max a `path.len() > max_depth` et n'est pas traité, test `the_depth_limit_still_applies_to_externals` ; déduplication par `visited` et BFS donc plus petite profondeur)
- Consider :
  - src/domain/relief-diff/tests/impact_externals.rs — aucun test pour un externe importé par deux fichiers (une unique entrée, à la plus petite profondeur) ; retirer le `visited.insert` ne ferait rien échouer. Ajouter un cas.
  - src/domain/relief-diff/src/lib.rs:590-621 — `impact` grossit (index des imports par fichier, remontée des parents, `v.clone()` par symbole) ; extraire une fonction `external_imports_by_symbol` et indexer par fichier plutôt que cloner par symbole.
  - .scratch/explore/issues/02-flow-trace.md:17 — le critère coché cite encore `Stripe API` et `PostgreSQL`, alors que la décision retient `stripe-sdk` ; l'aligner.

## Answer

- Construit : la marche `dependencies` de `relief_diff::impact` atteint aussi les externes importés par le fichier de chaque symbole visité (graine comprise), à la profondeur du symbole + 1, dans la limite de `max_depth` ; `callers` inchangé (R04 : 8 et 6). UI : en exploration, un clic sur un point d'entrée passe l'impact en « Dépendances » et sélectionne le nœud (surlignage, estompage, liste par profondeur).
- Décision : critère sur les externes réels de la fixture (`stripe-sdk`), pas les libellés de la maquette.
- Vérifié : cargo 472/0, web 436/0 (baseline 467/434) ; e2e 76 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-build` ; review « ship ».
- Doc : section « Suivre un flux » de `explore` (FR et EN) ; pas de nouvelle capture.
- Suivis (Consider) : test d'un externe importé par deux fichiers (une entrée, plus petite profondeur) ; extraire et indexer par fichier la collecte des imports externes dans `impact`.
