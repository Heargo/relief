# Rayon d'impact dans l'UI

Status: resolved
Type: task
Blocked by: R01, E06, T04
UI: oui
Doc: docs/user `review` (rayon d'impact)

Spec: `../spec.md` (Décisions : impact)

## À faire

- Cas d'usage `Session::impact(&ImpactRequest { range, seeds: Vec<NodeId>, direction, max_depth, follow_http })` dans `relief-app` : résout la plage, prend le snapshot head, appelle `relief_diff::impact`, ajoute `out_of_diff` et `tested`. Types de requête et de réponse dans `relief-model`, contrat régénéré (`just contract`).
- Commande Tauri `impact` (mince, ajoutée à la capability `main`) et méthode `ReliefApiService.impact`.
- À la sélection, les nœuds atteints sont surlignés (contour orange pointillé), le reste estompé, les arêtes du chemin en orange ; une boîte fermée qui contient des nœuds atteints affiche « ⚡ n ».
- Section du panneau : « Appelants » / « Dépendances », case « via HTTP » (cochée par défaut, mémorisée dans le `localStorage` de la webview), compte, sans tests, nombre de services, liste par profondeur (via HTTP, hors diff, testé/sans test).
- Calque « Rayon d'impact » et touche `i`.

## Critères d'acceptation

- [x] Test du cas d'usage `Session::impact` sur la fixture acme-shop : `SessionStore.refresh` a 8 appelants transitifs avec HTTP, 6 sans.
- [x] e2e WebdriverIO : sélection de `SessionStore.refresh` → « 8 appelants transitifs » ; décocher « via HTTP » → 6.
- [x] Test de composant : la liste groupe par profondeur (« Direct », « À 2 sauts »).
- [x] Page `review` (FR et EN) à jour, captures régénérées (`just docs-shots review`).

## Baseline

`just test-summary` (2026-11-20) : cargo 386 passed, 0 failed ; web 326 passed, 0 failed.

## Seams

- **Cas d'usage `Session::impact` de `relief-app` sur la fixture acme-shop** : attrape la résolution de plage, le snapshot head, `out_of_diff`/`tested` et les comptes (8 avec HTTP, 6 sans) ; rate le transport Tauri et l'UI.
- **Entrées/sorties du composant de la section impact du panneau** (`TEST_PROVIDERS`) : attrape le regroupement par profondeur (« Direct », « À 2 sauts »), les marqueurs via HTTP / hors diff / testé, et l'événement de la case « via HTTP » ; rate le surlignage sur la carte et la commande Tauri.
- **e2e WebdriverIO sur l'app construite et acme-shop** : sélection de `SessionStore.refresh` → « 8 appelants transitifs », décocher « via HTTP » → 6 ; attrape la commande `impact`, `ReliefApiService.impact`, le câblage panneau/carte ; rate le détail du regroupement et les cas limites du cœur.

## Red

- Fichiers de test : `src/app/relief-app/tests/impact.rs`, `src/ui/src/app/modules/review/components/impact-section/impact-section.component.spec.ts`, `tests/e2e/tests/impact.e2e.ts`
- Lancer : `cargo test -p relief-app --test impact` ; `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/review/components/impact-section/impact-section.component.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/impact.e2e.ts`
- API supposée : `relief_app::ImpactRequest { range, seeds, direction: relief_model::ImpactDirection {Callers, Dependencies}, max_depth, follow_http }`, `Session::impact -> ImpactResponse { reached: Vec<ImpactedNode { node, depth, via, kind, tested, out_of_diff }> }` ; composant `ImpactSectionComponent` (`impact-section.component`, inputs `impact`, `direction`, `followHttp`, outputs `followHttpChange`, `nodeSelect`) ; data-testid `impact-count`, `impact-group` (`data-depth`), `impact-row` (`data-http`, `data-out-of-diff`, `data-tested`), `impact-http-toggle`.
- En échec : 6 tests Rust (tous ne compilent pas : `Session::impact`, `ImpactRequest`, `ImpactDirection` absents) :
  - refresh_has_ten_transitive_callers_through_http
  - refresh_has_six_transitive_callers_without_http
  - every_reached_node_comes_with_its_path_from_the_seed
  - a_reached_node_touched_by_the_range_is_not_out_of_diff
  - without_a_range_the_opening_range_is_used
  - max_depth_one_keeps_only_the_direct_callers
- 6 tests Vitest (le fichier ne compile pas : `ImpactSectionComponent` et `ImpactResponse` absents) : regroupement par profondeur FR (« Direct », « À 2 sauts »), « Direct » en EN, comptes, marqueurs via HTTP / hors diff / testé, événement de la case « via HTTP », sélection d'une ligne.
- 1 test e2e : the impact of SessionStore.refresh is 10 callers, 6 without HTTP — `impact-count` introuvable.

## Correction du critère

Le critère « 10 avec HTTP » venait de la maquette. Le ticket T04 archivé (`.scratch/archived/lang-ts/issues/04-http-edges.md`, Décision) a fixé la valeur réelle sur acme-shop : 8 avec HTTP (6 + `useCheckoutTotals`, `CheckoutPage`), 6 sans, car `{ preHandler: requireAuth }` n'est pas modélisé. Critère, test du cas d'usage et e2e ramenés à 8 par l'orchestrateur.

## Green

- Fichiers : `src/domain/relief-model/src/{api,lib,contract,bin/write-contract}.rs`, `docs/contract/impact-response.schema.json`, `src/ui/scripts/generate-contract.mjs`, `src/ui/src/app/core/models/contract.ts`, `src/app/relief-app/src/{lib,range}.rs`, `src/interfaces/relief-desktop/{src/lib.rs,build.rs,capabilities/main.json}`, `src/ui/src/app/core/services/relief-api.service.ts`, `src/ui/src/app/modules/review/{business/impact.business.ts,helpers/impact.logic.ts,components/impact-section/*}`, `src/ui/src/app/modules/map/{components/map-canvas/*,components/map-page/*,helpers/shortcuts.logic.ts}`, `src/ui/src/styles.scss`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `Session::impact` (snapshot head, `relief_diff::impact`, `out_of_diff`), commande Tauri `impact`, `ReliefApiService.impact`. `ImpactBusiness` (case « via HTTP » dans le `localStorage`, sens, calque, chargement regroupé), `ImpactSectionComponent` avec sélecteur de sens (`impact-direction`, sortie `directionChange`), `serviceCount` hors package du seed. Carte : contour orange pointillé, reste estompé, arêtes orange tracées avec `via`, « ⚡ n » sur les boîtes fermées, type `ImpactState`, `--relief-impact` clair/sombre, touche `i`.
- Suite : cargo et web sans échec (voir `just test-summary`), les trois specs impact et `relief-desktop --test commands` passent, `just lint` propre.
- Questions ouvertes : doc utilisateur et captures laissées au coordinateur.

## Answer

- Construit : `Session::impact` (`ImpactRequest` dans `relief-app`, `ImpactDirection`/`ImpactedNode`/`ImpactResponse` dans `relief-model`, contrat régénéré), commande Tauri `impact` (capability `main`), `ReliefApiService.impact`, `ImpactBusiness` (sens, case « via HTTP » mémorisée dans le `localStorage`, calque), `ImpactSectionComponent` (sélecteur Appelants/Dépendances, compte, sans tests, services, liste par profondeur avec via HTTP/hors diff/testé), surlignage sur la carte (contour orange pointillé, reste estompé, chemin orange tracé par `via`, « ⚡ n » sur les boîtes fermées), calque « Rayon d'impact » et touche `i`, couleur `--relief-impact` en clair et en sombre.
- Décisions : critère ramené de 10 à 8 appelants avec HTTP, conformément à la décision de T04 (`preHandler` non modélisé ; suivi possible). `serviceCount` compte les packages atteints autres que celui du seed.
- Review : « fix first » (sélecteur de sens absent, commande Tauri et logique/business non testés), corrigé avec des tests ajoutés, puis « ship ».
- Vérifié : `just test-summary` cargo 395/0, web 348/0 (baseline 386/326) ; `just e2e-summary` 59 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-shots review` puis lecture des captures `review-impact` FR et EN (8 appelants, groupes Direct / À 2 sauts) ; `just docs-build`.
- Doc : section « Rayon d'impact » de `review` (FR et EN), nouvelle capture `review-impact` ; les autres captures sont régénérées (le bouton du calque apparaît dans la barre de gauche).
