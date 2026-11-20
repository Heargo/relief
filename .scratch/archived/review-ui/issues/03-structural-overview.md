# Vue d'ensemble : changements structurels et signaux

Status: resolved
Type: task
Blocked by: R01, E06
UI: oui
Doc: user-docs `review` (vue d'ensemble)

Spec: `../spec.md` (Décisions : vue d'ensemble)

## À faire

- Panneau de droite sans sélection : groupes « Signatures modifiées » (avec appelants directs et transitifs), « Violations de règles introduites » (rempli par A02), « Fichiers ajoutés, supprimés, déplacés », « Hors du diff, appelle une signature cassante » (avec testé / sans test). Chaque ligne sélectionne et cadre son nœud.
- Barre de gauche, section « Signaux » : violations introduites, signatures cassantes (« N appelants transitifs · M sans tests »), nouveaux couplages entre modules, couplages retirés, fichiers ignorés (format seul).
- Données : un endpoint `/api/review/summary?range=` qui renvoie tout ça calculé par le cœur.

## Critères d'acceptation

- [x] Test API (`oneshot`) : snapshot du résumé sur acme-shop.
- [x] e2e : la vue d'ensemble liste `requireAuth` et `renewSubscriptions` sous « Hors du diff » ; clic sur `renewSubscriptions` le sélectionne.

## Baseline

`just test-summary` : cargo 360 passed, 0 failed ; web 282 passed, 0 failed. `just e2e-summary` : 56 passed, 0 failed. Bundle initial : 757 kB.

## Seams

1. **API HTTP** `GET /api/review/summary?range=` (`Router` + `oneshot` + snapshot `insta` sur acme-shop, `main...feat/promo-codes`), types dans `relief-model` et contrat (`just contract`). Attrape : le calcul par le cœur (signatures modifiées avec appelants directs/transitifs, hors du diff avec testé/sans test via `relief_diff::impact`/`out_of_diff`, fichiers ajoutés/supprimés/déplacés/format seul avec leurs chemins, couplages ajoutés/retirés, violations vides tant que A02 n'existe pas), les erreurs de plage. Rate : le rendu.
2. **Composants Angular** (entrées/sorties, `TEST_PROVIDERS`, `ReliefApiService` mocké si un business charge le résumé) : le panneau « Changements structurels » sans sélection (groupes, badges testé/sans test, une ligne émet la sélection de son nœud) et la section « Signaux » de la barre de gauche (compteurs, pluriels EN/FR aux comptes 1 et 2). Un `*.logic.ts` pur peut porter la mise en forme. Attrape : textes, pluriels, émission de sélection. Rate : le cadrage réel sur la carte.
3. **e2e Playwright** sur acme-shop : la vue d'ensemble liste `requireAuth` et `renewSubscriptions` sous « Hors du diff » ; clic sur `renewSubscriptions` le sélectionne. Attrape : le parcours complet serveur → UI. Rate : le détail des chiffres.

Hors périmètre : la vue d'impact à la sélection (R04), les violations réelles (A02 ; le groupe reste vide), T04.

## Red

- Fichiers de test : `crates/relief-server/tests/review_summary.rs`, `web/src/app/modules/review/components/structural-overview/structural-overview.component.spec.ts`, `web/src/app/modules/review/components/signals-section/signals-section.component.spec.ts`, `e2e/tests/structural-overview.spec.ts`
- Lancer : `cargo test -p relief-server --test review_summary` ; `cd web && npx ng test --watch=false --include 'src/app/modules/review/components/s*/*.spec.ts'` ; `cd e2e && npx playwright test structural-overview.spec.ts`
- Contrat attendu (à créer, camelCase) : `ReviewSummary { signatures[{node,breaking,internal,directCallers,transitiveCallers,untestedCallers}], violations[], addedFiles[], removedFiles[], movedFiles[{from,to}], formatOnlyFiles[{path,linesAdded,linesRemoved}], outOfDiff[{node,calls,tested}], couplingsAdded[{from,to}], couplingsRemoved[{from,to}] }` (couplages au niveau module = dossiers). Composants : `StructuralOverviewComponent` et `SignalsSectionComponent` (input `summary`, output `nodeSelect`, `data-testid` : `overview-group[data-group]`, `overview-row[data-node-id|data-path]`, `tested-badge[data-tested]`, `signal-row[data-kind]`, `signals-count`). Textes EN/FR littéraux dans les specs. Le snapshot insta `review_summary_acme` est à créer au vert puis relire.
- En échec : 7 tests Rust (`summary_json_snapshot`, `refresh_is_a_breaking_signature_with_its_callers_counted`, `out_of_diff_lists_require_auth_tested_and_renew_subscriptions_untested`, `couplings_between_modules_are_three_new_and_one_gone`, `file_groups_carry_paths_and_violations_are_empty`, `range_errors_are_json_errors`, `range_defaults_to_the_one_the_server_was_opened_with`) — la route `/api/review/summary` répond 404 ; 2 specs Vitest (7 tests overview, 9 signals) — composants et type `ReviewSummary` inexistants (erreur de compilation TS2307) ; 2 e2e (`the overview lists the callers out of the diff and a click selects one`, `the signals section flags the breaking signature and the new couplings`) — pas de groupe `overview-group` ni de `signal-row` dans l'UI.


### Correction Red

- Après la review : les groupes de fichiers portent l'id de nœud. `addedFiles`/`removedFiles` : `{path, node}` ; `formatOnlyFiles` : `{path, node, linesAdded, linesRemoved}` ; `movedFiles` : `{from, to, node}` (node côté head). Les lignes de fichier émettent ce `node` tel quel ; plus d'entrée `graph`.
- Fixture `formatOnlyFiles` du spec Signaux : ajout de `node: CLIENT` (contrat ci-dessus).
- `review-summary.logic.spec.ts` (écrit par green) : cas typé sans cast, `signalCount` = 5 (1 cassante + 1 compatible ignorée + 1 violation + 1 couplage ajouté + 1 retiré + 1 format seul). Vert d'emblée.
- Défaut vu au navigateur : `structural-overview.component.spec.ts`, pluriel des appelants d'une signature (EN « 1 direct caller · 1 transitive » / « 3 direct callers · 6 transitive », FR « 1 appelant direct · 1 transitif » / « 3 appelants directs · 6 transitifs »), selon la maquette `overviewHTML`.

## Green

- Cœur : `relief_diff::review_summary` (`impact` sans http, `out_of_diff` limité aux appelants directs d'une signature cassante, comme la maquette `d===1`), couplages entre modules, `file_groups`/`file_node`. Types `ReviewSummary`, `FileRef`, `MovedFile`, `FormatOnlyFile`, `RuleViolation` (provisoire pour A02) dans `relief-model` ; contrat `docs/contract/review-summary.schema.json` et `contract.ts` régénérés.
- Serveur : `GET /api/review/summary?range=` (plage par défaut celle du serveur, erreurs JSON `invalid_range`/`unknown_ref`). `/api/impact` reste en 501 (R04).
- UI : `ReviewSummaryBusiness`, `StructuralOverviewComponent` (panneau de droite sans sélection), `SignalsSectionComponent` (barre de gauche), `review-summary.logic.ts`, câblés dans `map-page` ; un clic appelle `map.selectResult`. i18n EN/FR par `plural`.
- Corrections : id de nœud des fichiers porté par le cœur (`fileNodeId` et l'heuristique supprimés) ; pluriels des appelants directs/transitifs.
- Suite : cargo 367 / 0 ; web 308 / 0 ; e2e 58 / 0 ; lint propre ; bundle initial 783,5 kB (757 avant, +27 kB sans dépendance).

## Review

- Verdict initial : fix first.
- Must fix :
  - Heuristique `fileNodeId` qui devinait l'id d'un fichier depuis son chemin : remplacée par l'id de nœud porté par le cœur. Résolu.
  - Doc user-docs `review` : traitée à l'étape 8.
- Re-review des corrections : ship.
- Consider :
  - `out_of_diff` dédupliqué par nœud : un appelant de deux signatures cassantes n'en montre qu'une.
  - `review_summary` gagnerait à extraire `signature_summaries` ; `FileGroups` est un tuple de 4, une struct nommée serait plus lisible (laissé).
  - `review-summary.logic.spec.ts` faible (cast, `signalCount` peu couvert) : appliqué, cas typé complet ajouté.
  - Snapshot plausible, trié, sans chemin absolu. `RuleViolation` sans `rename_all`, provisoire pour A02.

## Answer

- Construit : `relief_diff::review_summary` calcule, depuis le graphe, les signatures modifiées (appelants directs et transitifs, sans test), « hors du diff » (appelants directs d'une signature cassante, via `impact`/`out_of_diff` d'E06, avec testé/sans test), les fichiers ajoutés/supprimés/déplacés/format seul avec chemin et id de nœud, et les couplages entre modules ajoutés/retirés. Exposé par `GET /api/review/summary?range=` (contrat régénéré). UI : panneau « Changements structurels » sans sélection et section « Signaux » de la barre de gauche ; un clic sélectionne et cadre le nœud.
- Décisions : données calculées côté serveur dans une route dédiée (pas d'extension de `/api/diff`) ; `/api/impact` reste en 501 (R04) ; le groupe « Violations introduites » reste vide/absent jusqu'à A02 (`RuleViolation` provisoire) ; `FormatOnlySummary` n'est pas modifié, le résumé porte ses propres chemins et ids.
- Vérifié : cargo 367/0 (baseline 360), web 308/0 (282), e2e 58/0 (56), `just lint` propre. Navigateur (`relief-acme`, `main...feat/promo-codes`) en EN et FR, à 1280 et 1024 px : chiffres identiques à `/api/review/summary` (refresh 3 directs/6 transitifs/2 sans tests, computeTotal 3/4, useCheckoutTotals 1/1, 4 ajoutés, 1 supprimé, 1 déplacé, 1 format seul, 3 couplages ajoutés, 1 retiré, Signaux 6), pluriels au compte 1 corrects, clic sur `renewSubscriptions`/`requireAuth` sélectionne, aucune erreur console. Un défaut de pluriel trouvé au navigateur a été couvert par un test puis corrigé.
- Bundle initial 783,5 kB (757 avant, +27 kB, sans dépendance).
- Doc : `user-docs` `review` FR/EN, sections « Vue d'ensemble » et « Signaux », captures `review-overview` et `review-signals`.
