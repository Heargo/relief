# Disposition « moins de croisements »

Status: resolved
Type: task
Blocked by: U03
UI: oui
Doc: user-docs `map` (disposition)

Spec: `../spec.md` (Décisions : disposition)

## À faire

- `crossings.logic.ts` : nombre de croisements des arêtes agrégées (segments centre à centre) pour un niveau d'ouverture donné.
- `layout-optimize.logic.ts` : recherche locale sur l'ordre des enfants de chaque conteneur (échanges de paires gardés s'ils réduisent la somme des croisements aux niveaux modules, fichiers, symboles), au plus 4 tours, budget de temps (abandon propre au-delà de 300 ms, avec le meilleur ordre trouvé).
- Section « Disposition » : « Moins de croisements » (défaut) / « Grille brute », totaux des deux, nombre de croisements à l'écran ; bascule animée ; choix mémorisé.

## Critères d'acceptation

- [x] Vitest : sur le graphe d'acme-shop (snapshot JSON en fixture de test), l'ordre optimisé a moins de croisements que l'alphabétique (la maquette passe de 197 à 60 ; test : au moins 50 % de moins).
- [x] Vitest : deux exécutions donnent le même ordre (déterministe).
- [x] e2e : la bascule change la disposition et le choix survit au rechargement.

## Baseline

`just test-summary` (develop, e8fe494) : cargo 329 passed, 0 failed ; web 99 passed, 0 failed.

## Seams

1. **Modules de logique TS** `crossings.logic.ts` et `layout-optimize.logic.ts` (Vitest, sur un snapshot JSON d'acme-shop en fixture de test) : attrape la métrique de croisements, la réduction d'au moins 50 % contre l'ordre alphabétique, le déterminisme, la limite de 4 tours et l'abandon propre au-delà du budget (horloge injectée, pas d'horloge réelle). Rate le rendu et l'animation.
2. **`MapBusiness`** (`TestBed.inject`, `ReliefApiService` mocké) : attrape le mode de disposition (défaut « Moins de croisements »), les totaux des deux modes, le nombre de croisements à l'écran et la mémorisation du choix. Rate le DOM et l'animation.
3. **e2e Playwright** contre `relief serve` sur acme-shop : attrape ce que voit l'utilisateur (la section « Disposition », la bascule change la disposition, le choix survit au rechargement). Rate les valeurs exactes de la métrique.

## Red

- Fichiers de test : `web/src/app/modules/map/helpers/crossings.logic.spec.ts`, `web/src/app/modules/map/helpers/layout-optimize.logic.spec.ts`, `web/src/app/modules/map/helpers/layout.logic.spec.ts` (2 tests ajoutés), `web/src/app/modules/map/business/map-layout.business.spec.ts`, `e2e/tests/layout.spec.ts` ; fixture `web/src/testing/fixtures/acme-shop.snapshot.json` (réponse `/api/snapshot` du vrai `relief serve main...feat/promo-codes` sur acme-shop, 120 nœuds, 177 arêtes).
- Lancer : depuis `web/`, `npx ng test --watch=false --include 'src/app/modules/map/**/<fichier>.spec.ts'` (un fichier) ; e2e : depuis `e2e/`, `npx playwright test layout.spec.ts` (nécessite `just build` pour que le binaire embarque l'UI).
- Note : tant que les symboles manquent, `ng test` ne compile pas (erreur TS2307/TS2554/TS2339 dans ces specs), donc toute la suite web est rouge à la compilation jusqu'au green.
- Référence : ordre alphabétique (enfants triés par id) = 301 (niveau 1) + 434 (niveau 2) + 182 (niveau 3) = 917 croisements ; une recherche locale de référence (échanges de paires, 4 tours) atteint 126 (-86 %), donc le critère de -50 % (≤ 458) est atteignable.
- API à créer (définie par les tests) :
  - `helpers/crossings.logic.ts` : `Segment {a:{x,y}; b:{x,y}}` ; `countSegmentCrossings(segments): number` (croisements propres, extrémité partagée non comptée) ; `crossingsAtLevel(layout: MapLayout, graph: GraphSnapshot, level: 0..3): number` (boîtes du niveau L = nœuds dont le parent est ouvert au niveau L — repo toujours ouvert, conteneur ouvert si `levelOfKind(kind) <= L` — et qui ne sont pas eux-mêmes ouverts ou sont des feuilles ; arêtes agrégées par `aggregateEdges`, segments centre à centre) ; `layoutCrossings(layout, graph)` = somme des niveaux 1, 2, 3.
  - `helpers/layout-optimize.logic.ts` : `type ChildOrder = Map<string | null, string[]>` (clé `null` = enfants du repo) ; `alphabeticalOrder(graph): ChildOrder` (tri par id, comparaison code unit) ; `optimizeOrder(graph, { budgetMs = 300, now = () => performance.now() }?): { order: ChildOrder; rounds: number; aborted: boolean }` (au plus 4 tours ; `now` lu au départ puis à chaque échange testé ; `aborted` vrai dès que `now() - départ >= budgetMs`, ordre rendu = meilleur trouvé, jamais pire que l'alphabétique ; déterministe).
  - `helpers/layout.logic.ts` : `layoutGraph(graph, order?: ChildOrder)` ; sans `order`, comportement actuel ; avec `order`, les enfants de chaque conteneur suivent l'ordre (le tri stable par rang des racines reste appliqué).
  - `MapBusiness` : `layoutMode()` (`'fewer-crossings'` par défaut | `'raw-grid'` = grille avec enfants triés par id), `setLayoutMode(mode)` (animé ; `localStorage` clé `relief.layout`, valeur inconnue = défaut), `crossingTotals(): {optimized, raw}` (sommes niveaux 1..3, indépendantes du mode), `visibleCrossings(): number` (croisements des arêtes dessinées).
  - UI (data-testid) : `layout-section` (dans le panneau gauche, titre « Disposition » / « Layout »), boutons `layout-fewer-crossings` (« Moins de croisements » / « Fewer crossings ») et `layout-raw-grid` (« Grille brute » / « Raw grid »), `aria-pressed` sur l'actif ; `crossings-optimized`, `crossings-raw`, `crossings-visible` avec `data-count`. Clés i18n dans `en.json` et `fr.json`.
- En échec : 31 tests, tous par symbole manquant (compilation) ou testid absent.
  - `crossings.logic.spec.ts` (10 tests : 5 `countSegmentCrossings`, 4 `crossingsAtLevel`, 1 `layoutCrossings`) — module `./crossings.logic` inexistant.
  - `layout-optimize.logic.spec.ts` (11 tests : 3 `alphabeticalOrder`, 1 `layoutGraph` avec ordre, 7 `optimizeOrder` dont ≥ 50 % de moins, déterminisme, ≤ 4 tours, abandon au budget avec horloge injectée) — module `./layout-optimize.logic` inexistant, `layoutGraph` n'accepte pas d'ordre.
  - `layout.logic.spec.ts` (2 tests : ordre explicite respecté, ordre du snapshot sans `order`) — `layoutGraph` n'accepte pas de 2e argument (TS2554).
  - `map-layout.business.spec.ts` (6 tests : défaut, totaux 917 / ≥ 50 %, bascule déplace les nœuds, 1 croisement à l'écran en grille brute au niveau 0, mémorisation, valeur inconnue) — `layoutMode`, `setLayoutMode`, `crossingTotals`, `visibleCrossings` absents de `MapBusiness`.
  - `e2e/tests/layout.spec.ts` (2 tests : section et totaux ; bascule + survie au rechargement) — `layout-section` / `layout-raw-grid` introuvables (timeout).

## Green

- Fichiers : `web/src/app/modules/map/helpers/{crossings,layout-optimize,layout-mode}.logic.ts` (nouveaux), `helpers/layout.logic.ts`, `business/map.business.ts`, `components/map-page/map-page.component.{html,scss}`, `web/public/i18n/{en,fr}.json`
- Changement : métrique de croisements (segments centre à centre, boîtes par niveau), recherche locale d'échanges de paires (4 tours, budget 300 ms, horloge injectée, ~140 ms sur acme-shop), `layoutGraph(graph, order?)`, mode de disposition mémorisé (`relief.layout`) dans `MapBusiness` avec bascule animée (layout et caméra interpolés), section « Disposition » dans le panneau gauche. « Moins de croisements » = le meilleur de l'ordre cherché et de l'ordre du snapshot.
- Suite (après corrections des tests et de la régression e2e) : cargo 329/0 (= baseline) ; web 126/0 ; e2e 34/0 ; lint propre ; bundle initial 707,73 kB (avant 691 kB), sans nouvelle dépendance. Les trois questions sur les tests rouges ont été résolues par tdd-red (ci-dessous).

### Corrections après green

1. `layout-optimize.logic.spec.ts` « only reorders » : le test comparait `null` à `'null'` (clé du repo), insatisfiable ; les clés sont maintenant normalisées (`k ?? ''`) des deux côtés. Intention inchangée.
2. `layout.logic.spec.ts` « ordre explicite » : un module à 2 fichiers est une grille de 2 colonnes (`ceil(sqrt(2))`), une seule rangée ; le test attend maintenant même `y` et `x` croissant dans l'ordre donné. L'ordre est toujours vérifié.
3. `map-layout.business.spec.ts` « croisements à l'écran » : la valeur 1 venait de ma référence, qui rangeait aussi les fichiers en vrac du repo ; le vrai layout les garde dans l'ordre du snapshot. Valeur recalculée avec le code (`crossingsAtLevel` au niveau 0 sur acme, ordre alphabétique) : 2, conforme à la définition centre à centre. Les niveaux 1 à 3 (301, 434, 182 = 917) sont inchangés.
- `alphabeticalOrder(null)` : le test attend les 5 racines conteneurs (sans les fichiers en vrac) et le code les rend ; cohérent, rien à changer.

### Corrections après green : validation de l'orchestrateur

- « only reorders » : le test comparait la clé `null` avec la chaîne `'null'`, ce qui ne pouvait jamais passer. C'est un bug du test, l'intention ne change pas.
- « ordre explicite » : la grille de U02 (`cols = ceil(sqrt(n))` pour tout conteneur qui n'est pas un fichier, une seule colonne pour les symboles d'un fichier) est la même que celle de la maquette (`maquette/index.html`, l. 583 : `n.kind==='file' ? 1 : Math.ceil(Math.sqrt(n.children.length))`). Deux fichiers forment donc une rangée de 2 colonnes, et c'est voulu. Le ticket ne change que l'ordre des enfants, pas la grille.
- « croisements à l'écran » = 2 : le ticket définit la métrique sur les segments centre à centre. `crossingsAtLevel` applique cette règle (vérifiée sur de petits cas dans `crossings.logic.spec.ts`), et elle donne 2 au niveau 0 sur acme en grille brute. La valeur 1 venait de la simulation de tdd-red, qui rangeait différemment les fichiers en vrac. 2 est conforme à la règle du ticket.

## Review

- Verdict (première passe) : fix first
- Must fix :
  - `user-docs/src/content/docs/map.md` et `en/map.md` : ajouter la section « Disposition » (les deux modes, les totaux, le compteur à l'écran, la mémorisation du choix). C'est l'étape 8 du workflow ; je la traite à cette étape, puis tdd-review revérifie.
- Consider :
  - `map-layout.business.spec.ts:97` : le littéral 2 est tiré de la sortie du code, mais la règle centre à centre est testée sur de petits cas, donc la correction tient. Un décompte à la main le confirmerait.
  - Les corrections `layout-optimize.logic.spec.ts:74` (bug `null`/`'null'`) et `layout.logic.spec.ts` (grille de 2 colonnes, comme dans la maquette) sont légitimes.
  - `map.business.ts` (`buildLayouts`) : `layoutCrossings` est calculé quatre fois ; mémoriser les totaux.
  - `layout.logic.ts:55-68` : `Sized = Placed` est un alias inutile ; le refactor de `size`/`shelfPack` est plus large que le ticket.
  - `layout.logic.ts` (`sortedBy`) : `indexOf` dans le tri donne du O(n²) ; une table de rangs aiderait si le budget de 300 ms se resserre (~140 ms mesurés sur acme).
  - ADR 0002 respecté, déterminisme assuré par l'horloge injectée, i18n EN et FR alignés. L'abandon au budget dépend de l'horloge réelle en production, ce qui est inhérent à un budget de temps.

### Correctif e2e U02 (`map.spec.ts` touche 2)

- Cause : l'optimiseur avait placé `pkg:@acme/shared` en première boîte de tête ; un saut de niveau depuis la vue d'ensemble se cadre sur la première boîte, donc `session.ts` (dans api) sortait du cadre.
- Correction : `layout-optimize.logic.ts` ne déplace jamais la première boîte de tête (l'ordre alphabétique la garde en premier). Tests web 126/0, e2e 34/34, lint propre.

### Revérification (après la doc et la correction de la régression e2e)

- Verdict final : **ship**. Aucune Must fix restante : la doc « Disposition » / « Layout » est ajoutée en FR et en EN, les captures sont régénérées, `docs-build` passe.
- Consider :
  - La doc est juste et alignée entre FR et EN. Le chiffre « 917 → 115 » est confirmé dans le navigateur sur acme-shop (totaux affichés par la section) et 917 est la référence du snapshot de test.
  - `layout-optimize.logic.ts:68-69` : l'optimiseur garde la première boîte de tête en place, parce que la caméra de U02 cadre cette boîte lors d'un saut de niveau. Ce couplage est acceptable. Une ancre indépendante de l'ordre, choisie par la caméra, serait plus saine : à proposer comme ticket de suivi.
  - Prioritaire, `layout-optimize.logic.ts:69` : `list[0]` de la racine n'est pas forcément la boîte affichée en premier, car `layoutInput` trie ensuite par rang de `kind`. Le cas ne se produit pas dans acme-shop. Je le couvre par un test unitaire (tdd-red), puis le fais corriger (tdd-green) : un aller-retour, correctif local.

### Ajout après review

- `layout-optimize.logic.spec.ts` « keeps the same first top-level box as the alphabetical order » : graphe de 4 packages (`pkg:b` à `pkg:e`) et d'un module `pkg:a` ; `pkg:a` est premier par id mais `pkg:b` est affiché en premier (rang). L'optimiseur échange `pkg:b` et `pkg:e` (la boucle ne protège que `list[0]` = `pkg:a`) : `roots[0]` passe de `pkg:b` à `pkg:e`. Échoue aujourd'hui (`expected 'pkg:e' to be 'pkg:b'`). Le code doit protéger la première boîte affichée (après tri par rang), pas `list[0]`.
- Ancre corrigée : l'optimiseur rejette tout échange qui change la première boîte affichée (après tri par rang), pas seulement `list[0]`. Web 127/0, e2e 34/0, lint propre.

## Answer

Ce qui a été construit :
- `crossings.logic.ts` : compte les croisements des arêtes agrégées, en traçant chaque segment d'un centre de boîte à l'autre, par niveau (`crossingsAtLevel`), au total sur les niveaux 1 à 3 (`layoutCrossings`) et pour les arêtes dessinées (`crossingsOfEdges`).
- `layout-optimize.logic.ts` : recherche locale par échanges de paires dans l'ordre des enfants de chaque conteneur. Au plus 4 tours, budget de 300 ms avec une horloge injectée, abandon propre qui garde le meilleur ordre trouvé. Le résultat est déterministe.
- `layoutGraph(graph, order?)`. Dans `MapBusiness` : `layoutMode`, `setLayoutMode` (bascule animée, choix mémorisé sous la clé `relief.layout`), `crossingTotals` et `visibleCrossings`. La section « Disposition » est dans la barre de gauche, avec les clés i18n EN et FR.

Décisions :
- Aucune dépendance de layout ajoutée. Le bundle initial passe de 691 à 707,76 kB.
- La boîte de tête affichée en premier, après le tri par rang de `kind`, ne bouge jamais. La caméra de U02 la cadre lors d'un saut de niveau : sans cette règle, `e2e/tests/map.spec.ts:35` régressait. Un test unitaire couvre le cas où cette boîte n'est pas la première dans l'ordre alphabétique.
- Les tests « ordre explicite » sont regroupés dans `layout-optimize.logic.spec.ts`. Trois tests rouges ont été corrigés après le green, avec leur justification sous `## Red`.
- Suivi proposé : ancrer le saut de niveau de la caméra sur un nœud qui ne dépende pas de l'ordre.

Vérifié :
- Suites : cargo 329/0 (= baseline), web 127/0 (baseline 99/0), e2e 34/0, `just lint` propre.
- Sur le snapshot d'acme-shop, niveaux 1 à 3 : 917 croisements en ordre alphabétique, 115 en ordre optimisé (-87 %).
- Navigateur, relief-acme : EN puis FR, 1280 puis 1024. Croisements à l'écran, de la grille brute à « Moins de croisements » : niveau 0, 2 → 1 ; niveau 1, 320 → 53 ; niveau 2, 639 → 138 ; niveau 3, 1435 → 288. Le choix survit au rechargement et la console n'a pas d'erreur.
- Doc : section « Disposition » / « Layout » de `map.md` en FR et en EN, captures `map.png` régénérées, `docs-build` passe.
