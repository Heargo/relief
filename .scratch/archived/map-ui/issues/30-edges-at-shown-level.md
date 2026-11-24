# U30 Arêtes agrégées au niveau affiché

Status: resolved
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `map` (arêtes)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Quand une boîte de fichier est ouverte et montre ses symboles, les arêtes partent des symboles : un fichier qui importe 6 helpers trace 6 traits. Sur la capture, ~300 traits pour ~30 paires de fichiers.

## Comportement

- Par défaut, les arêtes sont agrégées au niveau du **fichier** (la boîte de fichier visible la plus profonde), même quand ses symboles sont affichés ; le compteur de l'arête agrégée dit combien de liens elle porte.
- Les arêtes au niveau symbole s'affichent pour le nœud sélectionné (fichier ou symbole) : ses arêtes sont dépliées jusqu'à ses symboles. Décision de l'orchestrateur (2026-11-23) : pas de dépliage au survol, qui recalculerait l'agrégation à chaque entrée de la souris dans une boîte.
- L'inspecteur d'arête liste toujours les liens symbole à symbole (U20) : rien n'est perdu.

## Critères d'acceptation

- [x] Logique : agrégation au niveau fichier quand les symboles sont visibles ; dépliage pour un nœud donné.
- [x] e2e acme-shop au niveau Symboles : le nombre d'arêtes de la scène est celui des paires de fichiers ; sélectionner un fichier fait apparaître les arêtes de ses symboles.
- [x] Doc `map` FR/EN.

## Baseline

`641b660` (develop) : cargo 660 ; web 876 ; e2e 158 passés / 1 ignoré.

## Seams

- **Logique (`*.logic.ts`, Vitest)** : l'agrégation des arêtes s'arrête au fichier quand ses symboles sont visibles, sauf pour le nœud « déplié » (sélectionné ou survolé) dont les arêtes descendent jusqu'aux symboles ; le compteur de l'arête agrégée porte le nombre de liens. Équivalence avec l'agrégateur incrémental de S21 (même résultat que le calcul complet). Attrape la règle ; rate le dessin.
- **Business (`MapBusiness`, TestBed)** : `edges()` au niveau Symboles sur acme-shop sans sélection = paires de fichiers ; avec un fichier sélectionné, ses arêtes au niveau symbole. Attrape le câblage ; rate le rendu.
- **e2e (acme-shop)** : au niveau Symboles, aucune arête de la scène n'a pour extrémité un symbole sans sélection ; sélectionner un fichier en fait apparaître. Attrape le parcours.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/edge-file-level.logic.spec.ts`, `src/ui/src/app/modules/map/business/map-edges-level.business.spec.ts`, `tests/e2e/tests/edges-shown-level.e2e.ts`
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/edge-file-level.logic.spec.ts` ; idem avec `src/app/modules/map/business/map-edges-level.business.spec.ts` ; e2e (après green) : `cd tests/e2e && xvfb-run npx wdio run wdio.conf.ts --spec tests/edges-shown-level.e2e.ts`
- À créer pour green : `AggregateOptions.isSymbol?: (id) => boolean` et `AggregateOptions.unfolded?: ReadonlySet<string>` (`edges.logic.ts`) ; `createEdgeAggregator(..., { isSymbol })` et `update(visible, unfolded?)` (`edge-aggregator.logic.ts`, incrémental : un changement de `unfolded` ré-attache les arêtes sous les nœuds ajoutés/retirés) ; câblage dans `map.business.ts` (`isSymbol` par `kind === 'symbol'`, `unfolded` = nœud sélectionné). Règle : sans `unfolded`, une extrémité symbole remonte à son fichier ; une arête dont une extrémité est dans (ou est) un nœud déplié reste au niveau symbole aux deux bouts. Le survol d'un nœud n'a pas encore d'état dans `MapBusiness` (seul `hoveredEdge` existe) : à ajouter côté green (non testé ici, hors seams convenus au-delà de la logique).
- En échec : 19 tests (10 + 7 + 2)
  - logique (compilation : `isSymbol`/`unfolded` absents de `AggregateOptions`, `update` à 1 argument) — 10 tests : repli au fichier avec compteur ; changed ; ensemble déplié vide ; fichier déplié ; symbole déplié ; arêtes internes d'un fichier déplié ; fichier sans symboles visibles ; équivalence incrémentale ; sans déplié ; repli après retrait du déplié
  - business (assertion : `edges()` donne des arêtes symbole → symbole) — 5 tests : paires de fichiers sans sélection ; fichier sélectionné ; symbole sélectionné ; repli après désélection ; liens conservés (2 liens sur web.file → db.file)
  - e2e — 2 tests : « draws the pairs of files, no symbol end, without selection » (arêtes à extrémité symbole aujourd'hui) ; « selecting a file draws the edges of its symbols, Escape folds them back » (non lancé)
- Specs existantes à mettre à jour : aucune. Revue : les specs Vitest `map-edges.business.spec.ts` (niveau 0), `map-edge-culling` (niveau paquet), `edge-aggregator.logic.spec.ts` (sans `isSymbol`), et les e2e `edges`, `edge-emphasis`, `edge-labels-on-demand`, `hidden-internal-edges`, `map-scene`, `co-change` (niveaux 0 à 2, ou arêtes de couplage logique agrégées sans `isSymbol`) ne dépendent pas d'arêtes symbole sans sélection.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/edges.logic.ts`, `src/ui/src/app/modules/map/helpers/edge-aggregator.logic.ts`, `src/ui/src/app/modules/map/business/map.business.ts`, `docs/user/src/content/docs/map.md`, `docs/user/src/content/docs/en/map.md`
- Changement : `AggregateOptions.isSymbol`/`unfolded` ; sans dépliage, une extrémité symbole visible remonte à son fichier, sinon l'arête reste au niveau symbole si une extrémité est dans (ou est) un nœud déplié. L'agrégateur incrémental prend `update(visible, unfolded?)` et ré-attache les arêtes sous les nœuds dépliés ajoutés/retirés. `MapBusiness` : `isSymbol` par `kind === 'symbol'`, `unfolded` = nœud sélectionné (pas d'état de survol). Doc `map` FR/EN.
- Suite : cargo 660/0 (baseline 660) ; web 891/0 (baseline 876, +15) ; e2e ciblés (edges-shown-level, edges, edge-emphasis, edge-usages) 4 specs vertes ; lint propre ; build OK ; docs-build OK.
- Questions ouvertes : aucune

## Review

- Verdict : fix first
- Must fix : map.business.ts:624-633 (`selectEdge`/`applyEdge`) et map-canvas.component.ts:397 — cliquer une arête dépliée (symbole à symbole) vide la sélection de nœud, donc `unfolded` redevient vide, l'arête se replie au fichier et `selectedEdge()` (recherche par `pairKey`) ne trouve plus rien : pas d'inspecteur U20 ni d'arête choisie. Garder l'arête sélectionnée vivante (déplier aussi les extrémités de l'arête choisie, ou retomber sur l'arête repliée qui porte le lien) et ajouter un test business (sélectionner un fichier, `selectEdge` sur une arête symbole, `selectedEdge()` non nul).
- Consider :
  - edge-aggregator.logic.ts:213 — `update` rend un nouveau tableau même sans paire touchée ; changer la sélection invalide `edgeShapes` (clé `this.edges()`) pour toutes les arêtes en vue, même quand rien ne change (niveaux sans symboles). Renvoyer le tableau précédent si `touched.size === 0`.
  - edge-aggregator.logic.ts:95-128 / edges.logic.ts:62-77 — `underUnfolded`/`fold` dupliqués entre les deux fichiers (cycle borné par budget ou par ensemble) ; extraire un helper partagé.
  - map.business.ts:396 — sélectionner un paquet/service au niveau Symboles déplie toutes les arêtes sous lui (potentiellement des milliers) ; envisager un plafond ou limiter le dépliage aux fichiers/symboles.
  - Points vérifiés : (1) équivalence incrémentale correcte (flips de `unfolded` ré-attachent via `under`, ordre par `first`, testé sur 12 étapes) ; (2) coût : seules les arêtes sous les nœuds ajoutés/retirés sont ré-attachées, identités des paires intactes (géométries conservées) ; (3) emphase et U24 cohérents (arêtes internes du fichier sélectionné dépliées puis masquées), arêtes fusionnées OK, `links` conserve les liens symbole à symbole. Doc FR/EN présente.

## Answer

- Au niveau Symboles, les arêtes sont agrégées au fichier (compteur de liens) ; celles du fichier ou du symbole sélectionné, et les extrémités de l'arête sélectionnée, sont dépliées jusqu'aux symboles. Seuls les fichiers et symboles se déplient (un package sélectionné ne déplie rien). Pas de dépliage au survol (décision de l'orchestrateur). L'inspecteur garde les liens symbole à symbole.
- Agrégateur incrémental (S21) : `update(visible, unfolded)` ré-attache seulement les arêtes sous les nœuds dépliés ajoutés ou retirés, garde l'ordre du calcul complet, renvoie le même tableau quand rien n'est touché. Helpers partagés dans `edges.logic.ts`.
- Review : fix first (une arête dépliée cliquée se repliait et perdait l'inspecteur ; un package dépliait tout), corrigé avec deux tests.
- Vérifié : Vitest 893 ; e2e 160 passés / 1 ignoré ; `just lint` ; doc `map` FR/EN.
