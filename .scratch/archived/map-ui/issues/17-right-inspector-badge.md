# U17 Panneau droit : un inspecteur avec un badge Nœud / Arête

Status: resolved
Type: task
Blocked by: U16
UI: oui
Doc: user-docs `map` (panneau d'un nœud, d'une arête), captures

Spec: `../spec.md` (« Retours du 2026-11-20 ») ; référence visuelle : `docs/product/maquette/v2.html`, sujet 3, panneau droit

## Constat

Le panneau droit montre un nœud, une arête ou la vue d'ensemble, sans dire lequel. Le panneau d'une arête n'a qu'un titre et la liste des liens.

## À faire

- **En-tête collant de l'inspecteur** : un badge, puis un sous-titre, puis ✕ (désélectionne) :
  - `Nœud` (accent, icône de boîte) + le kind (fichier, module, symbole…) ;
  - `Arête` (couleur d'impact, icône de lien) + le type (imports, calls, http…) ;
  - `Vue d'ensemble` (neutre) quand rien n'est sélectionné, avec en dessous la vue d'ensemble actuelle de la PR, ou en Explorer une invite « Clique un nœud ou une arête ».
- **Arête** : les deux extrémités en boutons (clic = sélectionner ce nœud), puis des pastilles type, précision (résolue / heuristique), nombre de liens agrégés, « ajoutée par la PR » si c'est le cas ; puis la liste des liens existante et les règles.
- **Nœud** : en plus de l'existant (panneau du nœud, règles, impact, diff), deux listes « Dépend de » et « Utilisé par » des arêtes du nœud (au niveau affiché), chaque ligne sélectionne l'arête.
- `data-testid` : `inspector-badge` avec `data-kind="node|edge|none"`.

## Critères d'acceptation

- [ ] Composant (TestBed) : le badge suit la sélection (none, node, edge) ; ✕ vide la sélection ; un clic sur une extrémité d'arête sélectionne le nœud.
- [ ] e2e : cliquer un nœud puis une de ses arêtes dans « Dépend de » montre le badge Arête et ses extrémités ; Échap revient à Vue d'ensemble. Tests `edge-panel`, `node-panel` existants verts.
- [ ] Captures EN et FR des trois états.

## Seams

1. **Logique** (Vitest) : arêtes entrantes et sortantes d'un nœud au niveau affiché (helper pur).
2. **Composant** (TestBed) : en-tête et contenu de l'inspecteur.
3. **e2e** sur acme-shop.

## Baseline

Après U16 (2026-11-20) : cargo 578/0 ; web 590/0 ; e2e 116 passed, 1 skipped, 0 failed.

## Red

- Fichiers de test :
  - `src/ui/src/app/modules/map/helpers/node-edges.logic.spec.ts` (nouveau, helper `nodeEdges(edges: AggregatedEdge[], id)` → `{ dependsOn, usedBy }`, dans `helpers/node-edges.logic.ts`)
  - `src/ui/src/app/modules/map/helpers/shortcuts.logic.spec.ts` (`escapeStep` reçoit `selectedEdge?: boolean`, un `deselect` avant le `level-up`)
  - `src/ui/src/app/modules/map/business/map-edges.business.spec.ts` (sélection nœud/arête exclusives ; `escape()` désélectionne l'arête)
  - `src/ui/src/app/modules/map/components/map-page/map-page-inspector.component.spec.ts` (nouveau, via `MapPageComponent`)
  - `tests/e2e/tests/inspector-badge.e2e.ts` (nouveau)
- `data-testid` attendus : `inspector-badge` (`data-kind` none|node|edge ; texte Overview/Node/Edge, Vue d'ensemble/Nœud/Arête), `inspector-subtitle` (kind du nœud ou type de l'arête), `inspector-close`, `inspector-from` / `inspector-to` (boutons, `data-node-id`), `inspector-chip` (`data-chip` = kind|precision|count|added ; textes « calls », « resolved » / « heuristic » pour `syntactic`, « 5 links » / « 1 link », « added by the PR »), `node-edges-depends-on` / `node-edges-used-by` contenant des `node-edge-row` (`data-from`, `data-to`). Invite Explorer : texte « Click a node or an edge ». Les `edge-panel`, `edge-link`, `selected-node` existants restent.
- Sélectionner une arête vide la sélection de nœud et inversement (`selectEdge` / `selectResult`).
- e2e existants relus : `edges`, `rules` (`edge-panel`, `edge-link`, `selected-node` conservés), `navigation`, `structural-overview`, `panel-controls` (l'audit de style couvrira les nouveaux boutons), `focus-layers`, `reload-worktree` (Échap sans arête) : aucune attente à migrer tant que ces testids et le texte « existait déjà sur main » restent dans le panneau d'arête. À surveiller en green : `panel-controls` (boutons de l'inspecteur stylés).
- Lancer :
  - `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/node-edges.logic.spec.ts` (idem pour les trois autres fichiers Vitest ci-dessus)
  - `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/inspector-badge.e2e.ts`
- En échec : 2 + 1 + 2 + 11 + 2 tests
  - node-edges.logic.spec (4 tests) — module `./node-edges.logic` absent (compilation)
  - shortcuts.logic.spec « deselects a selected edge before going up a level » — `selectedEdge` inconnu du type (compilation, fait échouer tout le fichier)
  - map-edges.business « selecting an edge empties the node selection… » — la sélection de nœud survit à `selectEdge`
  - map-edges.business « Escape deselects the selected edge » — Échap ne désélectionne pas l'arête
  - map-page-inspector (11) : Overview (badge absent), Node + ✕, Edge, ✕ d'une arête, français, extrémités en boutons, pastilles (×2), listes Dépend de / Utilisé par, ligne → arête, extrémité → « utilisé par » — `inspector-*` / `node-edges-*` absents
  - inspector-badge.e2e (2) : parcours nœud → arête → Échap ; ✕ de l'en-tête — `inspector-badge` absent

## Green

- Fichiers : `src/ui/src/app/modules/map/{business/map.business.ts, helpers/node-edges.logic.ts, helpers/shortcuts.logic.ts, helpers/edges.logic.ts, components/map-page/map-page.component.{ts,html}, components/inspector-header/*, components/edge-head/*, components/node-edges/*}`, `src/ui/public/i18n/{en,fr}.json` (`map.inspector.*`)
- Changement : en-tête collant `app-inspector-header` (badge Vue d'ensemble / Nœud / Arête, sous-titre, ✕) ; `app-edge-head` (extrémités en boutons, pastilles type / précision / liens / ajoutée) ; `app-node-edges` (« Dépend de » / « Utilisé par », une ligne sélectionne l'arête). `MapBusiness` : sélection nœud/arête exclusives, `escapeStep` gère `selectedEdge`, `selectedNodeEdges` (`edgesAround` : arêtes du nœud, descendants repliés, autre bout = boîte affichée ou branche de divergence) et `selectListedEdge` ; la sélection d'arête survit à un `show` avec `keepView`. Boutons en `iconbtn` (audit `panel-controls`).
- Suite : cargo 578/0 (= baseline) ; web 608/0 (baseline 590 + 18 tests rouges) ; lint propre ; e2e vérifiés verts : edges, rules, navigation, structural-overview, panel-controls, focus-layers, reload-worktree. `inspector-badge` est instable (voir ci-dessous).
- Questions ouvertes : `inspector-badge.e2e.ts` fait `forceClick(WEB_DB)` juste après `openRelief()` (qui n'attend que `repo-name`), alors que l'arête n'existe qu'une fois le diff chargé : le clic tombe souvent dans le vide (échec à la ligne 24 ou 52). Avec `await $(WEB_DB).waitForExist()` après `openRelief()`, les 2 tests passent (vérifié sur une copie jetable, supprimée) ; à corriger dans le test (il est la spec, je n'y ai pas touché). Conditionner `repo-name` à la fin du diff casse 3 tests de `map-page.component.spec.ts`. Captures EN/FR des trois états et doc `map` non faites.

## Answer

Le panneau droit devient un inspecteur. Son en-tête collant `app-inspector-header` porte un badge `inspector-badge` (`data-kind` none/node/edge : Vue d'ensemble, Nœud, Arête), un sous-titre (kind ou type de lien) et ✕. En Explorer, sans sélection, il invite à cliquer un nœud ou une arête. Une arête montre `app-edge-head` : ses extrémités en boutons, qui sélectionnent le nœud, puis des pastilles type, précision, nombre de liens et « ajoutée par la PR », avant la liste des liens et les règles. Un nœud gagne `app-node-edges` : « Dépend de » et « Utilisé par » au niveau affiché (`nodeEdges` / `edgesAround`), et chaque ligne sélectionne l'arête. Les sélections de nœud et d'arête sont exclusives, et Échap désélectionne l'arête avant de remonter d'un niveau.

Vérifié : web 608/0, cargo 578/0, e2e complète 118 passés / 1 ignoré / 0 échec, `just lint` propre. L'e2e complète a trouvé que l'en-tête collant recouvrait le bouton Élargir (`shell.e2e`) : corrigé par une place réservée et `z-index`, puis revérifié. L'orchestrateur a ajouté un `waitForExist` dans `inspector-badge.e2e.ts` (course au chargement du diff). Capture EN de l'inspecteur d'arête relue à 1280 px. Doc `map` (FR/EN) en texte seul, captures de doc non refaites (phase alpha).

Restent en `Consider` : le bouton dupliqué dans `node-edges`, trois états pour la sélection d'arête dans `MapBusiness`, le calcul de l'en-tête à sortir de la page, et `visibleAncestor`/`isAncestor` devenus publics.
