# Sous-graphes au-delà de 2 000 nœuds

Status: resolved
Type: task
Blocked by: R01, I02, F06
UI: oui
Doc: docs/user `map` (gros dépôts)

Spec: `../spec.md`

## À faire

- `SnapshotRequest` et `DiffRequest` de `relief-app` gagnent `budget` et `expand: Vec<NodeId>` ; les commandes Tauri `snapshot` et `diff` les transmettent. Au-delà du budget, conteneurs fermés avec `childCount` et arêtes agrégées pré-calculées. Le découpage se fait dans `relief-app` à partir du snapshot complet gardé par la `Session` (aucune règle de diff propre : il appelle `relief-model` ou `relief-diff`).
- Nouveau cas d'usage `Session::search(&SearchRequest { range, query, limit })` et commande Tauri `search`.
- Mesurer le coût de l'IPC (sérialisation JSON de `invoke`) pour un gros snapshot : c'est la raison d'être du budget dans une app sans HTTP. Chiffres notés dans `## Answer`.
- UI : quand on zoome dans un conteneur non chargé, il charge son contenu (indicateur de chargement dans la boîte) ; la recherche interroge le cœur (`search`) au lieu de la liste locale.

## Critères d'acceptation

- [x] Fixture générée `wide` (10 packages × 300 fichiers) : `Session::snapshot` avec `budget: 2000` renvoie ≤ 2 000 nœuds et des comptes exacts (test du cas d'usage).
- [x] e2e WebdriverIO sur `wide` (fixture choisie par F06) : zoomer dans un package charge ses fichiers ; la recherche trouve un symbole non chargé et le cadre.

## Baseline

`just test-summary` (develop, cd4f265) : cargo 500 passed, 0 failed ; web 449 passed, 0 failed ; e2e 85 passed, 1 skipped, 0 failed.

## Seams

- **Cas d'usage de `relief-app` sur la fixture générée `wide`, et les commandes Tauri `snapshot`, `diff`, `search` (`tauri::test`)** : attrape `budget` (≤ 2 000 nœuds, conteneurs fermés avec `childCount` exacts, arêtes agrégées pré-calculées), `expand` (l'intérieur d'un conteneur à la demande), le sous-graphe d'une relecture (changés + 1 saut + ancêtres) et `Session::search` (un symbole non chargé trouvé) ; rate l'UI.
- **Module de logique TS (Vitest)** : attrape la fusion d'un contenu chargé à la demande dans le graphe affiché (conteneur fermé → ouvert, comptes, arêtes agrégées remplacées) et le choix du conteneur à charger quand on zoome ; rate le rendu.
- **e2e WebdriverIO sur `wide` (`// @fixture wide`)** : zoomer dans un package charge ses fichiers ; la recherche trouve un symbole non chargé et le cadre ; rate les cas limites.

La mesure du coût de l'IPC (sérialisation de `invoke` pour un gros snapshot) n'est pas un test : chiffres notés dans `## Answer`.

## Red

- Fichiers de test : `src/app/relief-app/tests/subgraph_budget.rs`, `src/interfaces/relief-desktop/tests/budget_commands.rs`, `src/ui/src/app/modules/map/helpers/subgraph.logic.spec.ts`, `tests/e2e/tests/subgraph-budget.e2e.ts`
- Lancer : `cargo test -p relief-app --test subgraph_budget` ; `cargo test -p relief-desktop --test budget_commands` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/subgraph.logic.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/subgraph-budget.e2e.ts`
- Contrat d'API choisi par le red (en tête de `subgraph_budget.rs`, à garder) : `budget: Option<usize>` + `expand: Vec<NodeId>` sur `SnapshotRequest`/`DiffRequest` ; `Node.child_count` (`childCount`, présent seulement sur un conteneur dont des enfants directs manquent, = nombre exact d'enfants directs du graphe complet) ; `Edge.count` (`count`, arête agrégée) ; `DiffResponse.graph: Option<GraphSnapshot>` (sous-graphe head, seulement avec budget) ; `Session::search(&SearchRequest{range,query,limit}) -> SearchResponse{hits:[SearchHit{id,kind}]}` ; commande `search {range?, query, limit}`. Budget : niveaux de l'arbre ajoutés un à un tant que le total reste dans le budget. TS : `containerToLoad(graph, focusId|null)` et `mergeExpanded(graph, containerId, loaded)` dans `map/helpers/subgraph.logic.ts`.
- Écarts avec `wide` : `wide` n'a aucune arête (fichiers sans import) et 6 012 nœuds (repo > `packages` > 10 `pkg-NN` > 300 fichiers > 1 symbole) ; les arêtes agrégées sont donc testées sur acme-shop (budget 20). Le diff budgété de `wide` se teste sur le working tree (2 fichiers modifiés par `build_with_worktree`). En explore, `wide` met plus de 3 s à s'afficher aujourd'hui (nœuds des paquets `pointer-events: none` au premier niveau : l'e2e zoome à la molette).
- En échec : 16 tests
  - subgraph_budget.rs (11, ne compile pas) — `budget`, `expand`, `child_count`, `Edge.count`, `DiffResponse.graph`, `Session::search`, `SearchRequest` n'existent pas.
  - budget_commands.rs (5) — `snapshot` renvoie 6 012 nœuds sans `childCount` (budget ignoré) ; `expand` : dépasse 2 000 ; `diff` sans `graph` ; `search` commande inconnue (2 tests).
  - subgraph.logic.spec.ts (10 tests, ne compile pas) — module `subgraph.logic` et `childCount`/`count` du contrat absents.
  - subgraph-budget.e2e.ts, « zooming into a package loads its files » — après zoom, 3 011 nœuds dans le DOM (> 2 000).
- Ne passe pas rouge : e2e « searching a symbol that is not loaded finds it and frames it » passe déjà (la recherche locale trouve le symbole ; le passage par le cœur n'est pas observable côté DOM) : garde-fou de non-régression, la logique est couverte côté Rust.
- Baseline : suite existante non relancée en entier (nouveaux fichiers seulement).

## Green

- Fichiers : `src/domain/relief-diff/src/{lib,subgraph}.rs` (nouveau), `src/domain/relief-model/src/{types,api,lib,contract,testing}.rs` + `bin/write-contract.rs`, `src/app/relief-app/src/{lib,range}.rs`, `src/interfaces/relief-desktop/{src/lib.rs,build.rs,capabilities/main.json,permissions/autogenerated/search.toml}`, `docs/contract/*` (+ `search-response.schema.json`), `src/ui/scripts/generate-contract.mjs`, `src/ui/src/app/core/{models/contract.ts,services/relief-api.service.ts}`, `src/ui/src/app/modules/map/{helpers/subgraph.logic.ts,helpers/search.logic.ts,business/subgraph.business.ts,business/repo.business.ts,business/map.business.ts,components/map-canvas/*,components/map-page/*}`, constructeurs `Node`/`Edge` des crates d'indexation, détection et `relief-lang-ts`.
- Changement : `relief_diff::budgeted` / `review_subgraph` (fonctions pures : niveaux de l'arbre ajoutés tant que le budget tient, `expand`, `childCount` exact, arêtes agrégées avec `count`) ; `Session::snapshot`/`diff` les appellent, `Session::search` et la commande `search` ajoutés, `snapshot`/`diff` transmettent `budget`/`expand`. UI : `RepoBusiness` demande le snapshot avec budget 2 000 et charge un conteneur (`expand`, `mergeExpanded`) quand l'utilisateur zoome dessus (molette en zoom avant sous le pointeur, ou vol de caméra vers lui) avec `node-loading` dans la boîte, puis cadre le conteneur ; la recherche interroge `search` (le local sert tant que le cœur n'a pas répondu) et charge ce qui contient le résultat (`reveal`).
- Suite : cargo 516 passés, 0 échoué (baseline 500, +16) ; web 476 passés, 0 échoué (baseline 449) ; e2e 87 passés, 1 ignoré, 0 échoué (baseline 85/1/0) ; `just lint` propre.
- Corrections de review : `ancestorIds` traite `@scope/name` comme une unité (jamais `pkg:@acme`) ; `RepoBusiness` fusionne `expanded` à la réponse (deux `expand` concurrents) et le remet à zéro dans `load()`.
- Questions ouvertes :
  - Tests existants modifiés à la main (sinon ils ne compilent plus, le contrat ajoute des champs requis) : `Node.child_count`/`Edge.count` dans `relief-diff/tests/impact_externals.rs`, `relief-index/tests/{detectors,entries}.rs` ; `budget: None, expand: vec![]` dans 12 fichiers de `relief-app/tests/` et `relief-desktop/tests/commands.rs`. Pas de changement de comportement ; `git diff --name-only` liste donc des fichiers de test (critère 4 non tenu, à valider).
  - Contraintes des specs existantes sur l'UI : `api.snapshot(ref)` à un argument doit rester le snapshot complet (specs du service et de `reload`), donc `refreshSnapshot` ne passe pas toujours `budget` (la spec `reload` attend `snapshot('WORKTREE')` à un argument) : il demande le graphe entier quand le graphe affiché est entier et < 2 000 nœuds, sinon budget + conteneurs ouverts ; `DiffBusiness` et `ReadingOrderBusiness` lisent toujours les snapshots base/head complets (non budgétés, hors périmètre, même coût IPC que ci-dessous).
  - Le diff budgété (`DiffResponse.graph`) n'est pas encore consommé par l'UI : en relecture d'un gros dépôt, un nœud modifié dans un conteneur fermé n'apparaît qu'après avoir zoomé dedans.
  - Le pilote WebKitWebDriver ne délivre qu'un évènement par `wheel.perform()` (25 `scroll` mis en file = 1 évènement, x1,2) : le chargement part donc dès le zoom avant sous le pointeur, sans seuil de largeur (un seuil d'ouverture 470 px ne passait pas l'e2e).
- Mesure IPC (build release, `wide`, JSON `serde_json` = ce que `invoke` sérialise, parse mesuré sous Node) : snapshot complet 6 012 nœuds = 1 866 783 octets (1,87 Mo), découpage 3,1 ms + sérialisation 9,5 ms, `JSON.parse` 2,5 ms ; snapshot budget 2 000 = 12 nœuds (repo, `packages`, 10 `pkg-NN` fermés) = 2 053 octets, sérialisation 12 µs, parse 5 µs ; un paquet ouvert (`expand`) = 312 nœuds, soit environ 97 Ko (extrapolé du complet) ; un sous-graphe plein à 2 000 nœuds ferait environ 620 Ko, environ 3 ms de sérialisation. Le transport webview et le rendu ne sont pas mesurés. Indexation de `wide` en release : 13 s (ouverture + premier snapshot) ; pas de cause locale évidente repérée sans profilage (3 000 fichiers à parser), rien optimisé (S02).

## Review

- Verdict : ship (re-vérifié : tests ajoutés pour zoomedBox, ancestorIds, resultOfHit, RepoBusiness ; expanded fusionné à la réponse et remis à zéro dans load())
- Must fix (résolu) : `src/ui/src/app/modules/map/helpers/subgraph.logic.ts:25,41` — `zoomedBox` (choix du conteneur à charger, seam TS) et `ancestorIds` (analyse des ids, fragile : produit `pkg:@acme` pour `pkg:@acme/api`) sont de la logique pure sans aucun test ; idem `resultOfHit` et `RepoBusiness.expand/reveal/refreshSnapshot` (aucun spec) — ajouter des tests dans `subgraph.logic.spec.ts` et `repo.business.spec.ts` (règle : logique `*.logic.ts` testée, business avec TestBed).
- Consider :
  - `repo.business.ts:~85` — `this.expanded = expand` écrase la liste : deux `loadContent` concurrents (marqueurs différents) perdent l'ouverture du premier, et `refreshSnapshot` la redemande fermée ; fusionner dans `this.expanded` à la réponse. `expanded` n'est pas remis à zéro si `load()` est rappelé.
  - `repo.business.ts:refreshSnapshot` — un graphe entier < 2 000 nœuds est redemandé sans budget : s'il grossit (working tree), IPC complet. Passer toujours `budget` (le cœur renvoie entier s'il tient) dès que les specs du service le permettent.
  - `relief-app/src/lib.rs:search` — classement des correspondances écrit dans la couche application et dupliqué avec `search.logic.ts` ; le déplacer dans `relief-diff` (fonction pure) et garder `Session::search` mince. Le hit pourrait porter ses ancêtres, au lieu de `ancestorIds` qui reparse l'id.
  - (1) `DiffResponse.graph` non consommé : suivi, pas bloquant (ni « À faire » UI ni critères d'acceptation ne l'exigent ; testé côté cœur). Créer le ticket de suite, avec (2) `DiffBusiness`/`ReadingOrderBusiness` encore sur les snapshots complets (le budget IPC ne vaut pas en relecture).
  - (4) pas de seuil de largeur : acceptable vu la limite du pilote WebKit, à noter comme suivi.
  - Découpage dans `relief-diff/subgraph.rs` appelé par `relief-app` : conforme à rules.md (requêtes pures dans `relief-diff`, `relief-app` n'a pas de règle propre) et au ticket (« relief-model ou relief-diff »).
  - Sécurité, i18n (`map.loading` existe en EN/FR), contrat régénéré, ids stables : RAS. Doc utilisateur exclue.

### Red, ajout après la review

- Fichiers : `src/ui/src/app/modules/map/helpers/subgraph.logic.spec.ts` (+ `zoomedBox`, `ancestorIds`), `src/ui/src/app/modules/map/helpers/search.logic.spec.ts` (+ `resultOfHit`, qui vit dans `search.logic.ts`), `src/ui/src/app/modules/map/business/repo.business.spec.ts` (nouveau).
- Lancer : `cd src/ui && npx ng test --watch=false --include 'src/app/modules/map/**/{subgraph.logic,search.logic,repo.business}.spec.ts'`
- En échec : 3 tests.
  - `ancestorIds` > scoped package, symbole : renvoie `pkg:@acme` en tête.
  - `ancestorIds` > fichier d'un package scopé : idem (`['pkg:@acme','pkg:@acme/api']`).
  - `RepoBusiness` > `expand` > deux appels qui se chevauchent : `this.expanded = expand` écrase le premier ; `refreshSnapshot` ne redemande que `[packages, pkg-00]` (pkg-01 perdu).
- Déjà verts (couvrent du code existant) : `zoomedBox` (4), `resultOfHit` (4), `RepoBusiness` load, `expand`, indicateur de chargement, `reveal`, `refreshSnapshot`.

## Answer

- Construit : `relief_diff::budgeted` et `review_subgraph` (fonctions pures : niveaux ajoutés tant que le budget tient, `expand` d'un niveau, `Node.childCount` exact sur les conteneurs incomplets, arêtes agrégées avec `Edge.count`) appelées par `Session::snapshot` et `Session::diff` (`budget`, `expand` ; `DiffResponse.graph` avec un budget) ; `Session::search` et commande `search` ; `snapshot` et `diff` transmettent `budget` et `expand`. UI : budget de 2 000 au chargement, `subgraph.logic.ts` (`containerToLoad`, `mergeExpanded`, `zoomedBox`, `ancestorIds`), chargement d'un conteneur au zoom avec indicateur, recherche par le cœur qui charge les ancêtres du résultat et le cadre.
- Mesure de l'IPC (release, `wide`, `serde_json` comme `invoke`, parse sous Node) : snapshot complet 6 012 nœuds = 1,87 Mo, sérialisation 9,5 ms, `JSON.parse` 2,5 ms ; budget 2 000 sur `wide` = 12 nœuds, 2 Ko ; un paquet ouvert ≈ 97 Ko ; un sous-graphe plein à 2 000 nœuds ≈ 620 Ko, ≈ 3 ms. Transport webview et rendu non mesurés. Indexation de `wide` : 13 s en release, 43 à 65 s en debug (à reprendre dans S02).
- Décisions : écarts de `wide` (pas d'arêtes : arêtes agrégées testées sur acme-shop ; un seul commit : diff budgété sur le working tree) ; littéral `precision: 'resolved'` corrigé dans le spec ; champs `None`/vides ajoutés mécaniquement aux tests existants (contrat étendu).
- Review : « fix first » (logique et business non testés, `ancestorIds` faux sur un package scopé, `expand` concurrents qui s'écrasent), corrigé avec tests, puis « ship ».
- Vérifié : `just test-summary` cargo 516/0, web 476/0 (baseline 500/449) ; `just e2e-summary` 87 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-build`.
- Doc : « Gros dépôts » dans `map` (FR et EN), avec la limite en relecture.
- Suivi : ticket S03 (`.scratch/scale/issues/03-review-subgraph-ui.md`) pour l'UI de relecture sur le sous-graphe, `refreshSnapshot` toujours budgété et le classement de la recherche.
