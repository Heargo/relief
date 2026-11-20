# Panneau de diff structurel

Status: resolved
Type: task
Blocked by: R01, E02
UI: oui
Doc: user-docs `review` (lire le code)

Spec: `../spec.md`

## À faire

- Pour un symbole ou un fichier changé : diff unifié (lignes ajoutées/retirées, numéros), base et head depuis `/api/code` ; pour un fichier, un bloc par symbole avec son statut.
- Fichier « format seul » : diff texte masqué, phrase « N lignes de diff texte masquées : seul le formatage change », bouton pour l'afficher quand même.
- Signature : avant/après, cassante/compatible, raison, « API publique » ou « interne ».
- Bouton « élargir » dans l'en-tête du diff.

## Critères d'acceptation

- [x] Test de composant : une signature cassante affiche avant, après et la raison littérale.
- [x] e2e : sélectionner `SessionStore.refresh` affiche `Promise<Session | null>` en ligne ajoutée et le badge « cassante ».

## Baseline

`just test-summary` : cargo 334 passed, 0 failed ; web 235 passed, 0 failed. `just e2e-summary` : 55 passed, 0 failed. Bundle initial : 753,37 kB.

## Décisions de l'orchestrateur

- **`/api/code` et la plage** : la route ignore `range` et prend toujours la plage de `relief serve`. Le panneau lit base et head pour la plage choisie dans le sélecteur (R01) : corrigé dans ce ticket. `/api/code` accepte `range` comme `/api/diff` (repli sur la plage de `relief serve`). Pour un nœud déplacé, le côté base se lit avec son id de base (`Moved.from`). La ré-indexation à chaque requête reste (performance, hors périmètre).
- **Codes de raison** : `SignatureChange.reason` (phrase française de `relief-lang-ts`) devient un code stable sérialisé (enum `SignatureReason`, avec le nom du paramètre quand il y en a un). L'UI le traduit en EN et FR (`review.reason.*`) ; la CLI (en anglais, `docs/rules.md` i18n) l'affiche en anglais. Contrat régénéré (`just contract`), tests E02/C02 et snapshots adaptés. Ça tient dans les trois seams ci-dessous (le snapshot HTTP montre le code) : pas de ticket cœur séparé.
- Hors périmètre : signatures des déclarations sans parenthèses (E02), vue d'ensemble (R03), impact (E06/R04), largeur de la carte à 1024 px.

## Seams

1. **API HTTP** (`Router` + `oneshot`, fixture acme-shop, snapshot `insta`) : `/api/code?node=&side=&range=` sert le code de la plage demandée (base et head, id de base d'un nœud déplacé) ; `/api/diff` porte le code de raison des signatures (`SessionStore.refresh` : retour élargi à null, cassant). Attrape : la plage ignorée, le contrat JSON. Rate : le rendu.
2. **Composant du panneau de diff** (entrées/sorties, `TEST_PROVIDERS`, vraies traductions EN/FR ; la logique pure du diff de lignes dans un `*.logic.ts` testé directement par Vitest ; `ReliefApiService` mocké pour le business) : diff unifié avec numéros, un bloc par symbole pour un fichier, « format seul » masqué avec la phrase pluralisée (1 et 2) et le bouton, signature avant/après/cassante/raison traduite/API publique ou interne, bouton « élargir ». Attrape : le rendu et les traductions. Rate : le vrai serveur.
3. **e2e Playwright** (acme-shop, `main...feat/promo-codes`) : sélectionner `SessionStore.refresh` affiche `Promise<Session | null>` en ligne ajoutée et le badge cassant. Attrape : le parcours complet. Rate : les cas limites.

## Red

- Fichiers de test :
  - Rust : `crates/relief-server/tests/api.rs` (adapté + 4 tests), `crates/relief-lang-ts/tests/signature_compare.rs`, `crates/relief-diff/tests/{signature_diff,format_only,diff_options}.rs`, `crates/relief-model/tests/contract_api.rs` (adaptés au code de raison).
  - Web : `web/src/app/modules/review/helpers/{line-diff.logic.spec.ts,diff-panel.logic.spec.ts}`, `web/src/app/modules/review/business/diff-panel.business.spec.ts`, `web/src/app/modules/review/components/diff-panel/diff-panel.component.spec.ts`, `web/src/app/modules/review/helpers/diff-layer.logic.spec.ts` (adapté).
  - e2e : `e2e/tests/diff-panel.spec.ts`.
- Lancer :
  - `cargo test -p relief-server --test api` ; `cargo test -p relief-lang-ts --test signature_compare` ; `cargo test -p relief-diff --test signature_diff` (idem `format_only`, `diff_options`) ; `cargo test -p relief-model --test contract_api`
  - `cd web && npx ng test --watch=false --include 'src/app/modules/review/**/*.spec.ts'`
  - `npm --prefix e2e exec playwright test diff-panel.spec.ts`
- Attention (web) : les modules manquants (`line-diff.logic`, `diff-panel.logic`, `diff-panel.business`, `diff-panel.component`) sont des erreurs TS2307 qui font échouer la compilation de **toute** la suite Vitest tant que green n'a pas créé les fichiers. La baseline web ne se vérifie qu'après.
- Snapshots CLI **non modifiés** (je ne les ai pas réécrits à la main) : green devra réaccepter `crates/relief-cli/tests/snapshots/diff__diff_acme_json.snap` (`"reason": {"code": "returnWidenedNull"}` / `{"code": "paramOptionalAdded"}`, 3 occurrences) et `diff__diff_acme_text.snap` (raisons en anglais : `return type widened (null possible)`, `optional parameter added`) avec `cargo insta review`, après avoir relu le diff. Le snapshot `crates/relief-server/tests/snapshots/api__api_diff_acme.snap` (3 raisons) est dans le même cas. Aujourd'hui `cargo test -p relief-cli --test diff` passe (7/7), il passera au rouge avec le code de raison, c'est attendu.

### Contrat convenu pour green

- `relief_model::SignatureReason`, enum `#[serde(tag = "code", rename_all = "camelCase")]` : JSON `{"code": "returnWidenedNull"}` ou `{"code": "paramRequiredAdded", "param": "b"}`. `SignatureVerdict.reason` et `SignatureChange.reason` deviennent `SignatureReason` (`JsonSchema` pour le contrat). Variantes (12 phrases de `compare.rs`) :
  - `ExportRemoved` (« export supprimé »), `VisibilityReduced` (« visibilité réduite »)
  - `ParamRequiredAdded { param }`, `ParamTypeChanged { param }`, `ParamBecameRequired { param }`
  - `ParamRemoved` (sans nom), `ParamOptionalAdded` (sans nom)
  - `ReturnWidenedNull`, `ReturnWidenedUndefined`, `ReturnWidened`, `ReturnNarrowed`, `ReturnChanged`
  - plus `Unspecified` pour le verdict équivalent et le repli de l'adapteur par défaut / du moteur (« signature modifiée », `String::new()` actuels). Pas testé : libre à green.
- `/api/code?node=&side=&range=` : `range` comme `/api/diff` (repli : plage de `relief serve`) ; plage inconnue → 404 `unknown_ref` ; nœud déplacé : le côté `base` se lit avec `Moved.from` quand l'id demandé est absent de la base.
- Web : `ReliefApiService.code(node, side, range: string | null)` ; `DiffPanelBusiness.show(nodeId, diff, range): Promise<void>` ; `DiffPanelComponent` (`app-diff-panel`, inputs `nodeId`, `diff`, `range`, `wide` ; output `toggleWide`) ; helpers `line-diff.logic.ts` (`lineDiff(before|null, after|null)` → `{kind, text, oldLine, newLine}[]`, supprimée avant ajoutée, dernier `\n` ignoré) et `diff-panel.logic.ts` (`fileSymbolChanges`, `baseNodeId`, `formatOnlyHiddenLines` = `linesAdded + linesRemoved` du fichier dans `diff.files`, `null` si pas « format seul » ; `reasonTranslation(reason)` → `{ key: 'review.reason.<code>', params: { param? } }`). Types `SignatureReason` à générer dans `contract.ts` (`just contract`) ; les specs utilisent `as never` pour rester compilables avant.
- `data-testid` : `diff-panel`, `diff-block` (`data-node-id`, `data-status`), `diff-line` (`data-kind`, `data-old-line`, `data-new-line`) contenant `diff-line-text`, `diff-signature` > `signature-before|after|badge` (`data-breaking`) `|reason|visibility`, `diff-format-only`, `diff-show-anyway`, `diff-expand`. Le panneau est monté dans `selected-node` de la page carte (e2e).
- Clés i18n (EN / FR), à ajouter dans les deux fichiers :
  - `review.diffPanel.expand` « expand » / « élargir » ; `breaking` « breaking » / « cassante » ; `compatible` « compatible » / « compatible » ; `publicApi` « public API » / « API publique » ; `internal` « internal » / « interne » ; `showAnyway` (libre).
  - `review.diffPanel.formatOnlyHidden_one` « {{count}} text diff line hidden: only the formatting changes » / « {{count}} ligne de diff texte masquée : seul le formatage change » ; `formatOnlyHidden` « {{count}} text diff lines hidden: … » / « {{count}} lignes de diff texte masquées : … ».
  - `review.reason.*` : `returnWidenedNull` « Return type widened (null possible) » / « Type de retour élargi (null possible) » ; `paramRequiredAdded` « Required parameter added ({{param}}) » / « Paramètre obligatoire ajouté ({{param}}) » ; `paramOptionalAdded` « Optional parameter added » (le reste est libre, mais toutes les variantes ont une clé).

- En échec :
  - `api.rs` `diff_of_the_acme_range` — `reason` est encore une chaîne française, attendu `{"code":"paramOptionalAdded"}`.
  - `api.rs` `refresh_signature_carries_a_stable_reason_code` — idem, attendu `{"code":"returnWidenedNull"}`.
  - `api.rs` `code_follows_the_requested_range` — `range` ignoré : head de `main...<discount>` contient déjà `Promise<Session | null>`.
  - `api.rs` `code_with_an_unknown_range_is_an_error` — plage ignorée, 200 au lieu de 404 `unknown_ref`.
  - `api.rs` `base_code_of_a_moved_symbol_is_read_with_its_base_id` — 404 `unknown node` (id de head absent de la base).
  - `contract_api.rs` (2 tests : `hand_written_node_and_edge_change_schemas_accept_a_real_diff`, `hand_written_schemas_reject_a_change_without_a_status`) — `SignatureChange.reason` est encore une `String` : la désérialisation de `{code}` échoue.
  - `signature_compare.rs`, `signature_diff.rs`, `format_only.rs`, `diff_options.rs` — ne compilent pas : `relief_model::SignatureReason` n'existe pas (3 tests nouveaux dans `signature_compare` : `parameter_made_required_names_the_parameter`, `return_type_widened_without_null_is_breaking`, `return_type_replaced_is_breaking`).
  - Vitest : `line-diff.logic.spec.ts` (6), `diff-panel.logic.spec.ts` (9), `diff-panel.business.spec.ts` (5), `diff-panel.component.spec.ts` (18) — modules absents (suite entière non compilable en attendant).
  - e2e `diff-panel.spec.ts` « selecting SessionStore.refresh shows the widened return type as an added line and the breaking badge » — `diff-panel` absent.

## Green

- Fichiers : `crates/relief-model/src/{diff,lib}.rs`, `crates/relief-lang-ts/src/compare.rs`, `crates/relief-diff/src/lib.rs`, `crates/relief-index/src/lib.rs`, `crates/relief-server/src/lib.rs`, snapshots `diff__diff_acme_{json,text}.snap` et `api__api_diff_acme.snap`, `docs/contract/*`, `web/src/app/core/{models/contract.ts,services/relief-api.service.ts}`, `web/src/app/modules/review/{business/diff-panel.business.ts,business/diff.business.ts,helpers/line-diff.logic.ts,helpers/diff-panel.logic.ts,components/diff-panel/*}`, `web/src/app/modules/map/components/map-page/*`, `web/public/i18n/{en,fr}.json`.
- Changement : enum `SignatureReason` (code stable, `Display` anglais pour la CLI) ; `/api/code` accepte `range` (repli sur la plage de `relief serve`, plage inconnue en 404 `unknown_ref`, base d'un nœud déplacé via `Moved.from`) ; panneau `app-diff-panel` (diff de lignes LCS, un bloc par symbole, format seul masqué, signature, élargir) monté dans `selected-node` en mode « Relire la PR ».
- Suite : cargo 341 passed / 0 failed (baseline 334), web 271 / 0 (235), e2e 56 / 0 (55). Lint propre. Bundle initial : main 756,55 kB (baseline 753,37 kB), total initial 772,24 kB ; aucune dépendance ajoutée.
- Questions ouvertes : le bouton « élargir » réutilise `toggleRightWide` de la page ; pas de coloration syntaxique dans le panneau (non demandée).

## Review

(écrit par l'orchestrateur, tdd-review n'ayant que la lecture)

- Verdict : fix first → ship après l'étape 8. Le seul Must fix est la doc utilisateur, traitée à l'étape 8 du workflow.
- Must fix : `user-docs/src/content/docs/{en,fr}/review.md` n'a pas de section « Lire le code » (panneau de diff, format seul, signature, élargir).
- Consider :
  - `/api/code` : pour un nœud absent de la base, `analyse_diff` ré-indexe tout pour chercher `Moved.from`, même pour un id inconnu (ne chercher un `Moved` que si l'id existe côté head).
  - `diff-panel.component` : le choix `_one` est dans le template ; un `formatOnlyKey` dans `diff-panel.logic.ts` serait plus testable.
  - `diff-panel.business.ts` : `side()` avale toute erreur (même un 500) pour un fichier ajouté ou supprimé ; ne masquer que le 404.
  - `DiffBlock.status: 'modified'` avec `change: null` pour un fichier sans symbole changé : un type dédié serait plus clair.
  - Bouton « élargir » : réutilise `toggleRightWide`, vérifié dans le navigateur (étape 7).
- Ajout (défaut navigateur R02) : `diff-panel.component.spec.ts` « labels the expand button "collapse" once the panel is wide, in English » et « ... "réduire" ... in French » — avec `wide` à true, `diff-expand` garde « expand » / « élargir » au lieu de « collapse » / « réduire » (clé i18n `review.diffPanel.collapse` à ajouter en EN et FR).
- Ajout (défaut navigateur R02, numéros de ligne du fichier) : `line-diff.logic.spec.ts` (3e argument `{ oldStart, newStart }` de `lineDiff`, défaut 1), `diff-panel.logic.spec.ts` (`startLine(graph | null, id)` = `span.startLine` du nœud, sinon 1), `diff-panel.component.spec.ts` « numbers the lines of a symbol with the lines of its file » (nouvelles entrées optionnelles `baseGraph` / `headGraph`, `GraphSnapshot | null` ; l'id de base d'un nœud déplacé se cherche dans `baseGraph`), `e2e/tests/diff-panel.spec.ts` (ligne ajoutée `data-new-line="15"`, retirée `data-old-line="15"`, lignes 15 de `session.ts` des deux côtés dans acme-shop). Rouge : `startLine` absent et `lineDiff` n'accepte pas de 3e argument (erreurs TS qui bloquent la compilation Vitest), entrées inconnues, e2e non lancé.

## Green (suite : défauts navigateur R02)

- Fichiers : `web/src/app/modules/review/{helpers/line-diff.logic.ts,helpers/diff-panel.logic.ts,business/diff.business.ts,components/diff-panel/*}`, `web/src/app/modules/map/components/map-page/map-page.component.html`, `web/public/i18n/{en,fr}.json`.
- Changement : `diff-expand` lit « collapse » / « réduire » quand `wide` (clé `review.diffPanel.collapse`) ; `lineDiff(a, b, { oldStart, newStart })` ; `startLine(graph, id)` ; entrées `baseGraph` / `headGraph` du panneau (id de base d'un déplacé pour la base) ; `DiffBusiness` charge toujours le graphe de base et l'expose (`baseGraph`).
- Suite : cargo 341 / 0, web 277 / 0, e2e 56 / 0, lint OK. Bundle initial : main 756,89 kB, total 772,58 kB (baseline 753,37 kB).
- Ajout (défaut navigateur R02, graphe head de la plage) : `web/src/app/modules/review/business/diff-head-graph.business.spec.ts` (3 tests) — `DiffBusiness.headGraph()` (signal en lecture seule, `GraphSnapshot | null`) vaut le snapshot de `diff.diff.head` de la plage chargée (`api.snapshot(sha de head)`, déjà accepté par `/api/snapshot?ref=`), mis à jour après `setRange`, `null` si la lecture échoue sans casser le statut `ready`. Rouge : `headGraph` absent (TS2339 / `headGraph is not a function`).

## Green (suite : graphe de head de la plage)

- Fichiers : `web/src/app/modules/review/business/diff.business.ts`, `web/src/app/modules/map/components/map-page/map-page.component.html`.
- Changement : `DiffBusiness.headGraph()` (snapshot de `diff.diff.head` après `load` et `setRange`, `null` si la lecture échoue, statut `ready`) ; la page carte le passe en `headGraph` au panneau.
- Suite : cargo 341 / 0, web 280 / 0, e2e 56 / 0, lint OK. Bundle initial : main 757,13 kB, total 772,82 kB. `fetch` enregistre une `PendingTasks` (la page n'est stable qu'une fois diff et graphes lus) : sans elle le spec des pluriels de la carte PR cassait.

## Review (corrections du navigateur)

- Verdict : ship (seul Must fix restant : la doc, étape 8).
- Consider :
  - `needsBase` (`diff-layer.logic.ts`) n'est plus appelée : code mort, supprimé dans la boucle suivante.
  - Course entre deux `setRange` dans `fetchDiff` : sans jeton, la réponse la plus lente écrit en dernier. **Traité dans ce ticket** (décision de l'orchestrateur : le panneau afficherait en silence le code d'une autre plage) : test business par red, jeton par green.
  - Un appel `/api/snapshot` de plus par plage : acceptable. `PendingTasks` : pas de fuite (`done()` dans un `finally`).
  - Seams des nouveaux tests : corrects.
- Ajout (défaut navigateur R02, course entre deux `setRange`) : `web/src/app/modules/review/business/diff-range-race.business.spec.ts` (2 tests, réponses tenues à la main) — rouge à l'assertion : après `setRange(A)` puis `setRange(B)` dont les réponses arrivent d'abord, la réponse tardive de A écrase `diff()` / `baseGraph()` / `headGraph()`, et une erreur tardive de A passe le statut à `error`. Correction attendue : un jeton dans `DiffBusiness.fetchDiff`, comme dans `DiffPanelBusiness`.

## Green (suite : course entre plages)

- Fichiers : `web/src/app/modules/review/business/diff.business.ts`, `web/src/app/modules/review/helpers/diff-layer.logic.ts`.
- Changement : jeton (`token`) dans `DiffBusiness.fetchDiff` : une réponse périmée ne publie rien (diff, base, head, statut, erreur) ; `PendingTasks.done()` reste dans le `finally`. `needsBase` supprimée (code mort, aucun test à retirer : aucun spec modifié).
- Suite : cargo 341 / 0, web 282 / 0, lint OK.

## Answer

- **Construit** : le panneau `app-diff-panel` (dans le panneau du nœud, mode « Relire la PR ») : diff unifié par LCS (`line-diff.logic.ts`) avec les numéros de ligne du fichier des deux côtés, un bloc par symbole pour un fichier, « format seul » masqué avec phrase pluralisée et bouton, signature avant/après, badge cassante/compatible, raison traduite, « API publique »/« interne », bouton « élargir »/« réduire ». `DiffPanelBusiness` lit base et head via `ReliefApiService.code(node, side, range)` ; `DiffBusiness` expose `headGraph()` (tête de la plage choisie) et ignore les réponses périmées (jeton).
- **Cœur** : `SignatureChange.reason` devient l'enum `SignatureReason` (`{"code": "returnWidenedNull"}`, avec `param` quand il y en a un), traduite par l'UI (`review.reason.*`) et affichée en anglais par `relief diff`. Contrat régénéré (`just contract`), snapshots C02 et API réacceptés (seul changement : la raison). `/api/code` accepte `range` (repli sur la plage de `relief serve`, plage inconnue → 404 `unknown_ref`), le côté base d'un nœud déplacé se lit via `Moved.from`. `needsBase` (code mort) supprimée.
- **Défauts trouvés au navigateur**, chacun couvert par red puis corrigé par green : libellé « réduire » quand le panneau est élargi ; numéros du fichier (maquette `codeHTML`, cohérence U06 : `SessionStore.refresh` aux lignes 15-19) ; `headGraph` pris à la ref d'ouverture et non à la tête de la plage ; course entre deux `setRange` (décision de l'orchestrateur, au lieu d'un Consider). Changement hors demande de green, jugé correct par la review : `DiffBusiness.fetch` enregistre une `PendingTasks` et charge base et tête en parallèle.
- **Vérifié** : cargo 341/0 (baseline 334), web 282/0 (235), e2e 56/0 (55), `just lint` propre. Navigateur (`relief-acme`, `main...feat/promo-codes`), EN et FR, 1280 et 1024 px, sans erreur de console : `SessionStore.refresh` (lignes 15-19, `Promise<Session | null>` ajoutée, cassante, raison traduite), `computeTotal` (compatible, paramètre optionnel ajouté), `isExpired` (ajouté), `applyLegacyCoupon` (supprimé), `format.ts` (déplacé, base lue à l'ancien emplacement), `client.ts` (58 lignes masquées, bouton) ; élargir 401 → 671 px puis réduire ; aller-retour de plage via le sélecteur.
- **Bundle** : main initial 757,21 kB (baseline 753,37 kB, +3,8 kB), total initial 772,90 kB, aucune dépendance ajoutée.
- **Doc** : section « Lire le code » / « Read the code » de la page `review` (FR, EN) et capture `review-diff-panel.png` (`just docs-shots review`), `just docs-build` passe.
- **Restes (Consider)** : `/api/code` ré-indexe à chaque requête, même pour un id inconnu ; choix de la clé `_one` dans le template ; `DiffPanelBusiness.side()` avale toute erreur et pas seulement le 404 ; `DiffBlock.status: 'modified'` avec `change: null` ; la comparaison des signatures ignore toujours les déclarations sans parenthèses (E02, aucun critère touché).
