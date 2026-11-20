# Calque de diff sur la carte

Status: resolved
Type: task
Blocked by: U03, C03, E04, E05
UI: oui
Doc: user-docs `review` (lire le calque)

Spec: `../spec.md` (Décisions : calque, arêtes, plage)

## À faire

- Bascule « Relire la PR » / « Explorer le repo » (le second arrive avec X01 ; en attendant, la carte sans diff).
- Sélecteur de plage dans la barre du haut ; l'URL garde la plage (`?range=`).
- Chargement de `/api/diff` ; couleurs, intensités, anciens emplacements, badges, arêtes nouvelles/retirées, légende ; carte et stats de la PR en haut de la barre de gauche (fichiers, +/−, compte par statut).
- Calques : diff, arêtes inchangées.

## Critères d'acceptation

- [x] Vitest : statut affiché d'un conteneur à partir de ses descendants (littéraux).
- [x] e2e sur `main...feat/promo-codes` : `discount.ts` est marqué ajouté, `legacyCoupon.ts` supprimé, `packages/shared/money/format.ts` déplacé, `client.ts` « format seul » ; l'arête `apps/web → packages/db` est nouvelle.
- [x] e2e : changer de plage dans le sélecteur recharge le diff et met à jour l'URL.

## Baseline

`develop` à 553fa69, arbre propre. `just test-summary` : cargo 334 passed, 0 failed ; web 187 passed, 0 failed. `just e2e-summary` : e2e 45 passed, 0 failed.

## Seams

1. **Logique du calque** (`*.logic.ts` + Vitest, littéraux `GraphDiff` / nœuds) : statut affiché d'un conteneur à partir de ses descendants, intensité selon la taille, badges (API cassée / API / sig. interne / format seul), statut d'arête, stats de la PR (fichiers, +/−, compte par statut). Attrape les règles de calcul ; rate le rendu et le chargement.
2. **Business du diff** (`*.business.ts`, `TestBed`, `ReliefApiService` mocké) : charge `/api/diff` pour la plage de l'URL, changer de plage recharge le diff et met à jour `?range=`, bascule « Relire la PR » (sans diff : la carte seule), calques diff / arêtes inchangées. Attrape l'état et l'enchaînement des appels ; rate le DOM et le vrai cœur.
3. **e2e Playwright** sur acme-shop, `main...feat/promo-codes` : `discount.ts` ajouté, `legacyCoupon.ts` supprimé, `packages/shared/money/format.ts` déplacé, `client.ts` « format seul », arête `apps/web → packages/db` nouvelle, carte/stats de la PR, changer de plage recharge le diff et met à jour l'URL. Attrape le parcours réel ; rate les nuances de couleur (vérifiées dans le navigateur).

## Red

- Fichiers de test : `web/src/app/modules/review/helpers/diff-layer.logic.spec.ts`, `web/src/app/modules/review/business/diff.business.spec.ts`, `e2e/tests/diff-layer.spec.ts`
- Lancer :
  - logique : `cd web && npx ng test --watch=false --include src/app/modules/review/helpers/diff-layer.logic.spec.ts 2>&1 | tail -30`
  - business : `cd web && npx ng test --watch=false --include src/app/modules/review/business/diff.business.spec.ts 2>&1 | tail -30`
  - e2e : `cd e2e && npm --prefix . exec playwright test diff-layer.spec.ts 2>&1 | tail -30`
- En échec : logique (22 tests) et business (9 tests) ne compilent pas : `./diff-layer.logic` et `DiffBusiness` n'existent pas ; l'échec de compilation bloque aussi tout `ng test` tant que ces fichiers n'existent pas. e2e, 8 tests :
  - fichiers marqués ajouté / supprimé / déplacé / format seul — pas d'attribut `data-diff-status` sur les nœuds
  - arête apps/web → packages/db nouvelle — pas de `data-status` sur `map-edge`
  - masquer les arêtes inchangées ne garde que les modifiées — l'arête web → db disparaît faute de notion d'arête modifiée
  - carte de la PR (15 fichiers, symboles 9/1/11/1, 3 signatures) — pas de `pr-stats`
  - bascule « Relire la PR » — pas de `data-diff-status`, pas de `review-toggle`
  - calque de diff masquable — pas de `toggle-diff-layer`
  - changer de plage (`feat/promo-codes...main`, diff vide) — pas de `range-select` / `pr-stats`
  - ouvrir `/?range=feat/promo-codes...main` — pas de `pr-stats`
- Choix de conception figés par les tests (à valider en green) : intensité 1 (≤5 lignes), 2 (≤20), 3 (au-delà) ; badges `breaking-api | api | internal-signature | format-only` ; « format seul » = fichier de `diff.files` sans nœud modifié ni renommage ; stats `{files, linesAdded, linesRemoved, symbols{added,removed,modified,moved}, signatures, filesMoved, formatOnlyFiles}` (lignes sommées depuis `diff.files`) ; `ReliefApiService.diff(range: string | null)` à créer.
- e2e : seconde plage `feat/promo-codes...main` (branches de `/api/meta`) ; viewport 3200x2000 pour que tous les fichiers du niveau 2 soient dessinés ; `e2e/web-server.ts` et `serve-acme.mjs` non touchés (déjà `--no-cache`).

## Green

- Fichiers : `web/src/app/modules/review/helpers/diff-layer.logic.ts`, `web/src/app/modules/review/business/diff.business.ts`, `web/src/app/core/services/relief-api.service.ts`, `web/src/app/modules/map/business/map.business.ts`, `web/src/app/modules/map/components/map-canvas/*` et `map-page/*`, `web/src/styles.scss`, `web/public/i18n/{en,fr}.json`
- Changement : `ReliefApiService.diff`, `DiffBusiness` (plage dans `?range=`, bascule, calque), logique du calque (+ `withBaseOnly` : nœuds/arêtes retirés repris du snapshot de base). La carte peint statut, intensité, badges, anciens emplacements, arêtes ajoutées/retirées, légende ; carte de la PR, bascule « Relire la PR », sélecteur de plage, calque de diff dans l'UI. Marge de rendu de 120 px autour de l'écran (sinon `utils/format.ts` hors champ dans l'e2e).
- Suite : cargo 334/0 (baseline 334/0), web 218/0 (baseline 187/0), e2e 53/0 (baseline 45/0) ; bundle initial prod 753,37 kB (722,55 avant).
- Questions ouvertes : le snapshot affiché reste celui de la plage du serveur quand on change de plage (la carte garde la tête d'origine, seul le diff change) ; « Relire la PR » coupé garde les nœuds retirés sur la carte (seules les marques disparaissent) ; marge de rendu de 120 px ajoutée dans `map.business.ts` (hors périmètre strict).

### Green, correction (boucle 1)

- Défaut couvert par tdd-red (`diff-review-off.business.spec.ts`, e2e « switching off Relire la PR ») : bascule « Relire la PR » coupée, la carte montrait encore les nœuds retirés et les anciens emplacements. `DiffBusiness.graphWithBase(head)` renvoie maintenant la tête seule quand `reviewMode()` est faux ; les nœuds de base reviennent quand on le réactive.
- Hors périmètre couvert après coup (`map-render.business.spec.ts`) : marge de rendu de 120 px dans `MapBusiness.visibleNodes`, `MapBusiness.show(graph, keepView)`.
- Calque de diff seul coupé (`toggle-diff-layer`) : les nœuds retirés restent dessinés, sans marques. C'est conforme à la maquette : en mode PR, `L.diff` coupé retire couleurs, badges et +/−, et seules les arêtes « déplacé » disparaissent (`renderEdges`). Les nœuds et arêtes retirés ne sont masqués qu'en mode exploration. À juger par la review.
- Suite : cargo 334/0, web 226/0, e2e 53/0 (rapport de green), `just lint` propre, aucun test dans le diff. Bundle initial 753,39 kB (722,55 avant).

## Review

- Verdict : fix first, sur la doc seulement (code : ship).
- Must fix :
  - `user-docs` `review` FR et EN pas à jour (« Choisir une plage » dit encore « À venir »). Traité à l'étape 8 : bascule « Relire la PR », sélecteur de plage (`?range=`), couleurs, badges, anciens emplacements, légende, carte de la PR, calques.
- Consider :
  - La marge de rendu de 120 px et `show(graph, keepView)` sortent du périmètre, mais sont justifiés et couverts (`map-render.business.spec.ts`). Acceptés. La marge s'applique au rendu de toutes les cartes ; le commit le mentionne.
  - Calque de diff coupé : les nœuds retirés restent dessinés sans marque, comme dans la maquette (`L.diff`). Accepté, à vérifier dans le navigateur.
  - `aggregateEdgeStatus` n'est qu'un alias de `containerStatus` ; la clé d'arête `from\0to\0kind` est construite trois fois (extraire un `edgeKey`).
  - `find` linéaires dans `nodeStatus`, `nodeBadges`, `edgeStatus` (quadratique sur un gros diff), et `formatOnlyFiles` recalculé par fichier : indexer par id si le dépôt grossit.
  - `map-page.component.ts` : `.then` imbriqués, passer en `async/await`. `map-canvas.component.ts` `mark()` : l'ordre (`className` réécrit avant) est implicite.
- Aucun secret. Les tokens clair et sombre sont ceux de la maquette. Les fichiers i18n EN/FR sont symétriques. Aucune raison de signature n'est affichée. Bundle 722,55 → 753,39 kB.

### Corrections (navigateur)

- Format seul : `formatOnlyFiles` exclut aussi les fichiers dont une arête modifiée part du fichier ou d'un de ses symboles ; `prStats().formatOnlyFiles` vient de `formatOnly.files`. BLOQUÉ : `diff-layer.logic.spec.ts` (prStats, RESPONSE avec `formatOnly.files: 1`) attend encore 0, en contradiction avec `diff-layer-format.logic.spec.ts` (attend 1).
- Pluriels : clé `_one` choisie en TS (`plural()` de la page), clés `_one` ajoutées en EN et FR.
- Barre du haut à 1024 px : recherche et sélecteur de plage deviennent flexibles (`flex: 0 1`, largeur min).

### Correction d'un test (red)

Le test « sums files and lines… » de `diff-layer.logic.spec.ts` construisait `formatOnly: { files: 1 }` et attendait `prStats().formatOnlyFiles === 0`. Il contredit `diff-layer-format.logic.spec.ts`, qui exige que ce compte vienne de `formatOnly.files`. Cette règle vient du défaut constaté dans le navigateur : l'UI affichait « 2 format seul » alors que l'API renvoyait `formatOnly.files: 1`, parce que `Invoices.tsx` (import déplacé) était compté. L'ancienne attente est donc fausse et a été alignée sur `formatOnly.files`.

### Review (re-review des corrections)

- Verdict : ship. Must fix : aucun (la doc est traitée à l'étape 8).
- Consider :
  - Inclure les arêtes `removed` dans l'exclusion du format seul est juste, puisqu'un import retiré est un vrai changement. Mais le badge vient de l'heuristique locale `formatOnlyFiles`, et le compteur de `formatOnly.files` (API) : les deux peuvent diverger. Suite proposée : un ticket cœur qui expose les chemins des fichiers format seul dans `FormatOnlySummary`. Sur acme-shop, les deux donnent 1.
  - `nodeBadges` recalcule `formatOnlyFiles` pour chaque fichier (O(n²)).
  - `edgeTitle` pourrait réutiliser `plural`.
  - L'alias `aggregateEdgeStatus` est toujours là.

## Navigateur

`relief-acme` sur `main...feat/promo-codes`, lu en texte. FR puis EN, à 1280 puis 1024 px.
- Console (`onlyErrors`) : aucune erreur.
- Carte de la PR, contre l'API : 15 fichiers, +122/−51, 9 ajoutés / 11 modifiés / 1 supprimé / 1 déplacé, 3 signatures, 1 fichier déplacé, 1 format seul. Après correction, c'est conforme à `formatOnly.files: 1` et à `renames` (1).
- Légende EN et FR. Calques diff et arêtes inchangées.
- « Relire la PR » coupé : aucune marque, aucun `old-location`, pas de carte de la PR.
- Changer de plage met à jour `?range=`.
- Captures à 0,5 : couleurs du diff lisibles en clair et en sombre.
- Défauts trouvés, couverts (red) puis corrigés (green) :
  - « 2 format seul » comptait `Invoices.tsx` (import déplacé) ;
  - pluriels EN et FR (« 1 files moved », « 1 supprimés ») ;
  - barre du haut qui débordait à 1024 px (lien Aide à x=1046).
- Notés, non corrigés :
  - `?range=` encodé en `%2F` dans l'URL ;
  - le sélecteur n'offre que des paires de branches, sans « working tree vs HEAD » ni « staged » (spec, hors critères du ticket) ;
  - débordement du panneau droit et largeur de la carte à 1024 px (défaut connu, hors périmètre).

## Answer

Le calque de diff est sur la carte.
- **Chargement.** `DiffBusiness` charge `/api/diff` pour la plage de l'URL (sinon celle du serveur) et tient `?range=`. Il porte aussi la bascule « Relire la PR » (coupée : la tête seule, sans diff) et le calque de diff.
- **Calculs.** `diff-layer.logic.ts` calcule les statuts (conteneurs à partir des descendants, fichiers déplacés à partir de `renames`), l'intensité (1 jusqu'à 5 lignes, 2 jusqu'à 20, 3 au-delà), les badges (API cassée / API / sig. interne / format seul), les statuts d'arête et les stats de la PR.
- **Nœuds retirés.** Les nœuds retirés et les anciens emplacements viennent du snapshot de base, fusionné à la tête.
- **Interface.** La carte de la PR est en haut de la barre de gauche. Le sélecteur de plage et la bascule sont dans la barre du haut. La légende est sur la carte. Les couleurs sont des variables `--relief-add/mod/del/mov`, en clair et en sombre. Les textes EN/FR choisissent leur pluriel en TS (`plural`).

Décisions :
- **Format seul.** Le compte de la carte vient de `formatOnly.files` (API). Le badge exclut tout fichier qui a un nœud ou une arête sortante modifiés. Dette cœur : `FormatOnlySummary` n'a pas de chemins. Ticket cœur proposé : exposer les chemins des fichiers format seul, pour que badge et compte ne puissent pas diverger.
- **Hors périmètre, accepté par la review.** Une marge de rendu de 120 px dans `MapBusiness.visibleNodes`, et `show(graph, keepView)` (changer de plage garde la vue).
- **Raisons de signature.** Aucune raison venue du cœur n'est affichée : la dette E02 n'est pas touchée.

Vérifié :
- cargo 334/0, web 235/0 (baseline 187), e2e 55/0 (baseline 45), `just lint` propre ;
- navigateur : voir `## Navigateur` ;
- bundle initial 722,55 → 753,37 kB ;
- doc `review` FR/EN avec deux captures (`just docs-shots review`), et `just docs-build` qui passe.

`e2e/web-server.ts` n'a pas été touché : `serve-acme.mjs` passe déjà `--no-cache`.
