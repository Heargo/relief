# e2e : choisir la fixture par spec

Status: resolved
Type: task
Blocked by: N09
UI: non
Doc: aucune

Spec: `../spec.md`, `docs/adr/0006-app-native-tauri.md`

## À faire

- `tests/e2e/wdio.base.ts` construit aujourd'hui acme-shop une fois et lance l'app dessus. Permettre à une spec de demander une autre fixture de `tests/fixtures/` (`tiny`, `wide`, `churn`, `py-shop`…) : une session de l'app par spec existe déjà, la spec indique son dépôt (annotation de fichier ou variable d'environnement lue par le harnais).
- Les fixtures sont construites par `relief-fixtures build <nom> <dossier>`, une seule fois par run et par nom, dans un dossier temporaire supprimé à la fin.
- Helper `resetReliefData()` : vide le `.relief/state/` (et `cache/` si demandé) du dépôt de la spec, pour que l'état d'une relecture ne fuie pas d'une spec à l'autre.
- La fixture générée `wide` (10 packages × 300 fichiers) est ajoutée à `relief-fixtures`, construite par le harnais seulement quand une spec la demande.
- Une spec sans demande garde acme-shop : les specs existantes ne changent pas.

## Critères d'acceptation

- [x] Une spec de démonstration lance l'app sur `tiny` et lit son nom de dépôt dans la barre du haut ; une autre sur acme-shop passe dans le même run.
- [x] Après `resetReliefData()`, `.relief/state/` du dépôt est vide.
- [x] `just e2e-summary` : aucun test existant ne change de résultat.
- [x] `docs/dev/rules.md` décrit comment une spec choisit sa fixture.

## Baseline

`just test-summary` (develop, c5e7650) : cargo 485 passed, 0 failed ; web 444 passed, 0 failed ; `just e2e-summary` : 79 passed, 1 skipped, 0 failed.

## Seams

- **Specs e2e WebdriverIO de démonstration** : une spec demande `tiny` et lit son nom de dépôt dans la barre du haut, une autre reste sur acme-shop dans le même run ; `resetReliefData()` vide `.relief/state/` du dépôt de la spec ; attrape le choix de fixture par spec et la construction une fois par nom ; rate la fixture `wide`.
- **`relief-fixtures` (test du crate)** : la fixture générée `wide` (10 packages × 300 fichiers) est construite par `relief-fixtures build wide <dossier>` en un vrai dépôt git ; rate le harnais e2e.

`clearReviewState()` existe déjà (R05) : `resetReliefData()` le généralise ; les specs existantes peuvent garder l'ancien nom tant que leur résultat ne change pas.

## Red

- Fichiers de test : `tests/relief-fixtures/tests/wide.rs`, `tests/e2e/tests/fixture-tiny.e2e.ts`, `tests/e2e/tests/fixture-default.e2e.ts` (garde-fou, passe déjà), `tests/e2e/tests/reset-relief-data.e2e.ts` (travaille sur un dossier temporaire propre, sans annotation)
- Convention retenue pour le green : une spec demande sa fixture par un commentaire en première ligne du fichier, `// @fixture <nom>` (absent = acme-shop avec la plage `main...feat/promo-codes`). Le harnais (`wdio.base.ts`) lit ces annotations dans `onPrepare`, construit chaque nom une seule fois dans `<tmp>/<nom>` (le dossier porte le nom du dépôt affiché), et dans `beforeSession` (par spec) fixe `args` de `tauri:options` à `[repo]` (plage seulement pour acme-shop) et `process.env.RELIEF_E2E_REPO` au dépôt de la spec. `resetReliefData({ cache?: boolean })` est exporté par `tests/e2e/helpers/review-state.ts` : vide `.relief/state/` de `RELIEF_E2E_REPO` (dossier absent ou vide accepté), et `.relief/cache/` seulement avec `{ cache: true }`.
- Lancer : `cd tests/relief-fixtures && cargo test --test wide` ; `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/fixture-tiny.e2e.ts --spec tests/fixture-default.e2e.ts --spec tests/reset-relief-data.e2e.ts`
- En échec : 4 tests
  - build_wide_creates_a_git_repo_of_ten_packages_with_three_hundred_files — `tests/fixtures/wide/fixture.yaml` n'existe pas (fixture `wide` inconnue)
  - wide_is_committed_on_main — idem
  - fixture-tiny : « opens on the tiny fixture chosen by the file annotation » — le nom du dépôt est `acme-shop`, l'annotation est ignorée
  - reset-relief-data.e2e.ts (3 tests) — le fichier ne se charge pas : `resetReliefData` n'est pas exporté par `helpers/review-state.ts`
- `fixture-default` passe déjà (spec sans demande, reste sur acme-shop) ; la baseline e2e est inchangée.
- Note : `wide` est une fixture « générée » (3000 fichiers, 10 packages × 300 `.ts` sous `packages/<pkg>/`) : le green doit décider comment `relief-fixtures build wide` la produit (pas de 3000 fichiers commités). Aucun test e2e ne la construit (lent) ; seul le test du crate la couvre.

## Green

- Fichiers : `tests/fixtures/wide/fixture.yaml`, `tests/relief-fixtures/src/lib.rs`, `tests/e2e/wdio.base.ts`, `tests/e2e/helpers/review-state.ts`, `docs/dev/rules.md`
- Changement : `wide` déclare `generate:` dans son `fixture.yaml` (fichiers écrits au build, rien de commité). Le harnais lit `// @fixture <nom>`, ne construit que les fixtures demandées (acme-shop seulement si une spec n'a pas d'annotation), une fois par nom dans `<tmp>/<nom>` ; `beforeSession` fixe `args` et `RELIEF_E2E_REPO` par spec. `resetReliefData({ cache? })` ajouté, `clearReviewState` y délègue ; règle documentée dans `docs/dev/rules.md`.
- Suite : cargo 487 / 0 ; web 444 / 0 ; e2e 83 passed, 1 skipped, 0 failed sur 2 des 3 runs (baseline 79 + 4 nouveaux) ; lint propre.
- Questions ouvertes : un run e2e sur trois a échoué (cause non capturée, `tail -1` seulement), les deux suivants sont verts : à surveiller (flaky ?).

## Answer

- Construit : une spec choisit sa fixture par `// @fixture <nom>` en première ligne (absent = acme-shop sur `main...feat/promo-codes`) ; `wdio.base.ts` lit les annotations dans `onPrepare`, construit chaque fixture demandée une seule fois dans `<tmp>/<nom>` (acme-shop seulement si une spec en a besoin), supprimé à la fin ; `beforeSession` fixe les arguments de l'app et `RELIEF_E2E_REPO` par spec. `resetReliefData({ cache? })` vide `.relief/state/` (et `cache/` sur demande), `clearReviewState` y délègue. Fixture générée `wide` (`generate:` dans `fixture.yaml`, 10 packages × 300 fichiers écrits au build, rien de commité). `docs/dev/rules.md` décrit le choix de fixture.
- Review : « fix first » : `reset-relief-data.e2e.ts` vidait le `.relief/cache` d'une app vivante (course avec `index.sqlite`) ; réécrite sur un dossier temporaire propre au test.
- Instabilité e2e trouvée : `node-panel.e2e.ts` (antérieure) cliquait sur une boîte de la carte pendant l'animation de cadrage. Nouveau helper `settledAt(selector)` dans `helpers/ui.ts` (attend que l'élément ne bouge plus) avant ces clics. Vérifié : la spec 5 fois sur 5, la suite complète 4 fois sur 4.
- Vérifié : cargo 487/0, web 444/0 ; e2e 83 passés, 1 ignoré (préexistant), 0 échec, stable sur 4 runs ; `just lint`.
- Suivis : utiliser `settledAt` dans les autres specs qui cliquent sur la carte ; `wide.rs` construit deux fois la fixture (une construction partagée suffirait) ; `npx tsc --noEmit` signale des erreurs de typage dans `commit-replay`, `explore` et `reading-order` (specs e2e), non vues par `just lint`.
