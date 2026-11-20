# Churn, complexité, hotspots et carte de risque

Status: resolved
Type: task
Blocked by: X01, G02, T01
UI: oui
Doc: docs/user `explore` (hotspots), `map` (carte de risque)

Spec: `../spec.md` (Décisions : métriques)

## À faire

- Cas d'usage `Session::metrics(&MetricsRequest { ref, since_days })` et commande Tauri `metrics`, **hors du snapshot** : le churn dépend de la date du jour et le snapshot d'un commit réel, mémorisé par la `Session`, doit rester le même ; l'UI fusionne les métriques avec le snapshot. `Metrics` du modèle est le type de réponse. Le résultat se range dans `.relief/cache/` (clé : HEAD + période).
- Calcul : churn par fichier et par symbole (lignes du span touchées par les commits des 90 derniers jours, période en option), complexité cyclomatique TS (requête tree-sitter), auteur majoritaire, `tested` ; renvoyés par `Session::metrics`. La complexité vient d'une méthode du contrat `LanguageAdapter` (octets en entrée, défaut vide) ; le log git est lu par `relief-git`.
- UI : section « Hotspots » (top 6 par risque), calque « Carte de risque » (teinte selon le risque, conteneurs = max), métriques dans le panneau d'un nœud.

## Critères d'acceptation

- [x] Test de `Session::metrics` sur une fixture dédiée (`tests/fixtures/churn`, 6 commits datés) : churn et auteur majoritaire littéraux ; le snapshot du même commit est identique avant et après.
- [x] Vitest : normalisation du risque (littéraux).
- [x] e2e WebdriverIO (sur acme-shop) : le calque teinte les nœuds et la section Hotspots liste 6 symboles.

## Baseline

`just test-summary` (develop, 7f36784) : cargo 472 passed, 0 failed ; web 436 passed, 0 failed.

## Décision (orchestrateur)

La fenêtre du churn se compte à partir de la date du commit de la ref, pas de l'horloge : la clé de cache est « HEAD + période », donc le résultat ne doit dépendre que d'elles, et les tests restent déterministes sur une fixture datée.

## Seams

- **Cas d'usage `Session::metrics` sur la fixture dédiée `tests/fixtures/churn` (6 commits datés, auteurs différents), et sa commande Tauri `metrics` (`tauri::test`)** : attrape le churn par fichier et par symbole (lignes du span), la fenêtre en jours, l'auteur majoritaire, `tested`, la complexité cyclomatique TS par la méthode du contrat `LanguageAdapter`, le cache dans `.relief/cache/`, et un snapshot du même commit identique avant et après ; rate l'UI.
- **Module de logique TS (`risk.logic.ts` ou voisin, Vitest)** : attrape la normalisation du risque (complexité × churn × absence de tests, littéraux), le top 6 des hotspots, la teinte et le max des conteneurs ; rate le rendu.
- **e2e WebdriverIO sur l'app construite et acme-shop** : le calque « Carte de risque » teinte les nœuds et la section Hotspots liste 6 symboles ; rate les cas limites.

## Red

- Fichiers de test : `src/app/relief-app/tests/metrics.rs`, `src/interfaces/relief-desktop/tests/commands.rs` (2 tests ajoutés), `tests/relief-fixtures/tests/build.rs` (2 tests ajoutés), `src/ui/src/app/modules/explore/helpers/risk.logic.spec.ts`, `tests/e2e/tests/risk.e2e.ts` ; fixture `tests/fixtures/churn/` (6 commits bob/carol, dernier au 2024-06-30).
- Lancer : `cargo test -p relief-fixtures --test build` ; `cargo test -p relief-app --test metrics` ; `cargo test -p relief-desktop --test commands metrics` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/explore/helpers/risk.logic.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/risk.e2e.ts`
- En échec :
  - `a_commit_author_overrides_the_fixed_author` (relief-fixtures) — le champ `author` du fixture.yaml est ignoré (auteur fixe `Fixture`) : extension de `relief-fixtures` (`author: <nom>`, email `<nom>@relief.invalid`).
  - `churn_fixture_has_six_dated_commits_by_bob_and_carol` (relief-fixtures) — idem, auteurs `Fixture` au lieu de bob/carol.
  - metrics.rs (9 tests : fenêtre 90 j, 30 j, 365 j, fenêtre relative au commit, complexité, tested, snapshot identique, cache `.relief/cache/*metrics*`, ref inconnue) — ne compile pas : `MetricsRequest`, `Session::metrics`, `Metrics.churn/owner/tested` manquants.
  - commands.rs `metrics_returns_churn_owner_and_complexity_of_a_ref_through_the_ipc`, `metrics_without_since_days_uses_90_days_and_an_unknown_ref_is_an_error` — commande `metrics` absente.
  - risk.logic.spec.ts (rawRisk, riskMap, hotspots, riskLevel) — module `risk.logic` absent.
  - risk.e2e.ts (3 tests) — `hotspots-section` jamais affichée (beforeEach), pas de `toggle-risk-layer`, `data-risk-level`, `node-metrics`.

### Hypothèses de contrat posées par les tests (à valider au green)

- `MetricsRequest { rev, since_days: Option<u32> }` (défaut 90) ; `MetricsResponse.nodes: map id -> Metrics` (JSON `nodes`, `sinceDays` camelCase) ; `Metrics` gagne `churn`, `owner`, `tested`.
- Churn = nombre de commits de la fenêtre qui touchent le fichier ou les lignes du span, le commit de création comptant. Owner = auteur majoritaire de ces commits. `tested` = fichier importé par un fichier de test. Cache : fichier dont le nom contient `metrics`.
- Fenêtre : date du commit de `rev` moins N jours (c6 = 2024-06-30 => 90 j = après 2024-04-01).
- TS : `risk.logic.ts` dans `modules/explore/helpers/` : `rawRisk`, `riskMap`, `hotspots` (top 6), `riskLevel` (0..4).
- e2e : `hotspots-section`, `hotspot-row`, `toggle-risk-layer`, `data-risk-level`, `node-metrics`.
- Écart : « 6 symboles » sur acme-shop n'est tenable que si le commit de création compte dans le churn (tout l'historique est dans la fenêtre, 2024-03) ; sinon peu de symboles ont un churn > 0. Le « top 6 » plafonne la liste à 6.

## Green

- Fichiers : `tests/relief-fixtures/src/lib.rs` ; `src/analysis/relief-git/src/lib.rs` ; `src/analysis/relief-adapter-api/src/lib.rs` ; `src/analysis/lang/relief-lang-ts/src/{lib,complexity}.rs` ; `src/domain/relief-model/src/{types,api,contract,lib}.rs` + `bin/write-contract.rs` ; `src/domain/relief-diff/src/lib.rs` ; `src/app/relief-app/src/{lib,range}.rs` ; `src/interfaces/relief-desktop/{src/lib.rs,build.rs,capabilities/main.json,permissions/autogenerated/metrics.toml}` ; `docs/contract/*` et `contract.ts` (`just contract`) ; UI : `modules/explore/{helpers/risk.logic.ts,business/risk.business.ts,components/hotspots-section}`, `layers-section`, `map-canvas`, `map-page`, `node-panel`, `relief-api.service.ts`, `styles.scss`, `i18n/{en,fr}.json`.
- Changement : `author:` par commit dans `relief-fixtures` ; `GitSource::touching_commits` (commits de la fenêtre avec lignes touchées) ; `LanguageAdapter::complexity` (défaut vide, TS : 1 + if/for/while/do/case/catch/ternaire/&&/||/??) ; `Session::metrics` (fenêtre depuis la date du commit, cache `.relief/cache/metrics-<sha>-<N>d-<adapters>.json`, hors snapshot) et commande Tauri `metrics` ; `relief_diff::tested_nodes` extrait de l'impact R04 et réutilisé ; UI : section Hotspots (top 6), calque « Carte de risque » (`data-risk-level`, variables `--relief-risk-1..4`), bloc `node-metrics` dans le panneau.
- Suite : cargo 483 réussis / 2 échoués (baseline 472/0 ; +11 attendus, les 2 échecs sont les tests `commands.rs` `metrics_*`, voir ci-dessous) ; web 444/0 (baseline 436/0) ; e2e 79 réussis, 1 ignoré, 0 échoué.
- Questions ouvertes :
  - Test rouge faux, `src/interfaces/relief-desktop/tests/commands.rs` (2 tests `metrics_*`) : `harness_on` construit le dépôt dans un dossier `acme`, donc les ids sont `pkg:acme/src::...` (le détecteur générique nomme le système d'après le dossier, pas d'après `package.json`), alors que le test lit `pkg:churn/src::...`. Les valeurs sont bonnes sous `pkg:acme` (churn 3, owner bob, tested true, total churn 2 / complexité 3). Correction possible côté test (`pkg:acme`) ou, côté prod, un changement de nommage hors ticket (le détecteur générique prendrait le `name` du `package.json` racine). Non touché.
  - Le même fichier n'est pas conforme à `cargo fmt --check` (ligne 529 trop longue) : `just lint` échoue sur cette seule différence (clippy, ng build et Prettier passent). À corriger avec le test.
  - `tested` de R04 (arête directe d'un test vers le nœud) ne donne pas le littéral du test pour un fichier : l'import du test pointe vers le symbole `total` (`pricing.test.ts -> pricing.ts::sym:total`), pas vers le fichier. Un fichier est donc `tested` quand un nœud de ce fichier est dans `tested_nodes` (même définition, pas de seconde règle) ; un symbole garde la définition R04 telle quelle.
  - Churn d'un symbole : les plages de lignes de chaque commit sont comparées au span du HEAD sans suivre les décalages de lignes ni les renommages (approximation correcte sur la fixture, où rien ne bouge) ; version de l'adapter TS non montée (la complexité est hors du cache par blob), mais les versions des adapters entrent dans le nom du fichier de cache des métriques.

## Review

- Verdict : ship
- Must fix : aucun (doc utilisateur hors périmètre, écrite en parallèle)
- Consider :
  - src/analysis/relief-git/src/lib.rs:~728 (`touching_commits`) vs `commit_time` (l.329) — filtre sur l'heure d'auteur, ancre de la fenêtre sur l'heure du committer : après un rebase/amend/cherry-pick, le commit de tête (auteur ancien) peut sortir de sa propre fenêtre — utiliser l'heure d'auteur des deux côtés (ou la même fonction).
  - src/app/relief-app/src/lib.rs:~505 (`compute_metrics`) — churn par nœud = O(nœuds × commits × fichiers), plus la marche de tout l'historique (`continue` au lieu d'arrêter) : indexer les commits par chemin une fois (HashMap path -> Vec<(auteur, plages)>).
  - Même endroit, churn d'un symbole : plages de chaque commit comparées au span du HEAD sans suivre les décalages. Acceptable pour classer des hotspots (le churn d'un fichier reste exact), mais trompeur pour un symbole déplacé ou sous une insertion ancienne ; à dire dans la doc `explore`.
  - `tested` d'un fichier = un de ses nœuds est dans `tested_nodes` : cohérent avec R04 et correct sur la fixture ; un fichier dont un seul symbole est testé est dit testé (à documenter).
  - Clé de cache `metrics-<sha>-<N>d-<adapters>` : correcte (le résultat ne dépend que de la ref, de N et des adapters) ; les detectors n'y figurent pas. Complexité hors cache par blob : OK, calculée une fois par fichier et mise en cache dans le résultat.
  - src/analysis/lang/relief-lang-ts/src/lib.rs:202 — `complexity` ne filtre pas l'extension malgré la doc du trait ("vide si le chemin n'est pas géré") ; complexity.rs sans test pour `&&`, `||`, `??`, `while`, `do`, `case`, `catch` (comptage par ligne : deux points de décision sur la même ligne de deux symboles distincts se confondent).
  - Pas de test Vitest du composant hotspots-section ni du business.

## Answer

- Construit : `author:` par commit dans `relief-fixtures` et fixture `churn` (6 commits datés, bob et carol) ; `GitSource::touching_commits` (commits d'une fenêtre avec lignes touchées) ; `LanguageAdapter::complexity` (défaut vide ; TS : 1 + `if`/boucles/`case`/`catch`/ternaire/`&&`/`||`/`??`) ; `Session::metrics(&MetricsRequest { rev, since_days })` hors snapshot (fenêtre depuis la date du commit, défaut 90 jours ; churn par fichier et par symbole, auteur majoritaire, `tested` dérivé de `relief_diff::tested_nodes` extrait de R04, complexité) avec cache `.relief/cache/metrics-<sha>-<N>d-<adapters>.json` ; commande Tauri `metrics`. UI : `risk.logic.ts` (`rawRisk`, `riskMap`, `hotspots`, `riskLevel`), section « Hotspots » (top 6) en exploration, calque « Carte de risque » (4 teintes `--relief-risk-1..4`, conteneur = max), métriques dans le panneau d'un nœud.
- Décisions : fenêtre depuis la date du commit de la ref (déterministe, cohérente avec la clé de cache) ; le commit de création compte dans le churn ; un fichier est testé quand un de ses nœuds l'est (même définition que R04) ; ids du test Tauri corrigés (`pkg:acme`, dossier du harnais).
- Vérifié : `just test-summary` cargo 485/0, web 444/0 (baseline 472/436) ; `just e2e-summary` 79 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-shots` et lecture de `explore-hotspots` (6 symboles ; première capture coupée par la hauteur de la fenêtre, corrigée en faisant défiler la section) ; `just docs-build` ; review « ship ».
- Doc : « Hotspots : où regarder en premier » dans `explore`, « Carte de risque » dans `map` (FR et EN), avec l'approximation du churn d'un symbole et la règle « fichier testé ».
- Suivis (Consider) : même heure (auteur ou committer) pour l'ancre et le filtre de la fenêtre ; indexer les commits par chemin dans `compute_metrics` ; filtrer l'extension dans `complexity` et tester `&&`, `||`, `??`, `while`, `do`, `case`, `catch` ; tests Vitest de `hotspots-section` et `RiskBusiness`.
