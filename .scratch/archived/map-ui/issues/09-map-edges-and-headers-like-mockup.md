# U09 Étiquettes d'arêtes et en-têtes de nœuds conformes à la maquette

Status: resolved
Type: task
Blocked by: U03
UI: oui
Doc: user-docs `map`, `review` (captures de la carte, FR et EN)

Spec: `../spec.md` ; référence visuelle : `docs/product/maquette/index.html` (`edgeLabel` l. ~904, rendu des arêtes l. ~945-962, CSS `.el` l. ~208, `.node .hd` et `.k-*>.hd` l. ~155-175)

## Constat

Capture de l'utilisateur sur relief (niveau 0) : des centaines de pastilles rondes numérotées couvrent la carte. `review-map.png` sur acme-shop montre aussi une pastille par arête, même pour un seul lien.

La maquette :

- n'écrit pas de cercle mais un texte (600, 10,5 px, contour de la couleur de fond) au point de la courbe situé à 3/8 de sa longueur ;
- n'écrit rien pour une arête qui ne porte qu'un lien (`live > 1`), ni sur une arête de moins de 60 px à l'écran ;
- en relecture, écrit `+n` / `−n` selon les liens ajoutés et retirés, `nouveau` pour une arête neuve à un lien, `déplacé`, `⚠ n` pour une violation ;
- fait varier l'épaisseur du trait avec le nombre de liens (`1.3 + log2(n) × 0.9`).

En-têtes : la maquette tronque le libellé seulement quand la boîte est trop étroite (`flex: 0 0 auto; max-width: 100%`). La capture montre des libellés vides ou tronqués à 4 lettres (« exte… ») sur des boîtes larges.

## À faire

- Étiquettes d'arêtes selon `edgeLabel` de la maquette, en texte SVG avec contour, couleurs par statut (`.el.base/add/del/viol/mov/hl/dimmed`), masquées sous 60 px et pour une arête à un seul lien.
- Épaisseur du trait selon le nombre de liens.
- Logique dans `edges.logic.ts` (pure, testée par Vitest) : le texte de l'étiquette, sa visibilité et l'épaisseur.
- En-têtes de nœud : tailles et paddings de la maquette par kind (système 15 px / 38 px, module 13 / 30, fichier 12 / 26, chasse fixe pour fichiers et symboles). Pas de troncature tant que la boîte a la place.
- i18n des mots `nouveau`, `déplacé` (FR, EN).

## Critères d'acceptation

- [ ] Vitest `edges.logic` : une arête à 1 lien sans diff n'a pas d'étiquette ; 5 liens → `5` ; en relecture, 3 liens dont 1 ajouté → `3 +1` ; une arête ajoutée à 1 lien → `new` / `nouveau` ; une arête de 50 px à l'écran n'a pas d'étiquette ; l'épaisseur croît avec le nombre de liens.
- [ ] e2e : sur acme-shop au niveau 0, aucune étiquette n'est un cercle (`circle` absent des arêtes), et l'arête `apps/web → packages/db` porte « ⚠ 2 » (classe `viol` : 2 liens ajoutés qui violent `web-sans-db`) et `apps/web → apps/api` porte « 3 +1 », sur une fenêtre de 3200×2000 (à 1280 px l’arête web → db fait ~32 px, sous le seuil de 60 px). Corrigé après le green : « nouvelle dépendance » ne valait que pour une arête à un lien, couverte par le test du canvas.
- [ ] e2e : sur acme-shop au niveau 0, le libellé de chaque système est affiché en entier (pas d'ellipse) à 1280 px.
- [ ] Captures EN et FR comparées à la maquette.

## Baseline

`develop` (7aa4665, après U08) : cargo 578 passed ; web 499 passed ; e2e 93 passed, 1 skipped, 0 failed. Seul `quicknotes.md` non suivi (fichier de l'utilisateur).

Existant : `edges.logic.ts` a déjà `edgeThickness(count)` (borné à 6 px, `1.2 + 1.1·log2`) ; la maquette dit `1.3 + 0.9·log2`. Garder une seule fonction, alignée sur la maquette (le plafond peut rester).

## Seams

1. **Module de logique `edges.logic.ts`** (Vitest) : texte de l'étiquette d'une arête agrégée (sans diff, en relecture : `+n`/`−n`, nouveau, déplacé, `⚠ n`), sa visibilité (un seul lien, longueur à l'écran < 60 px), l'épaisseur. Rate le rendu SVG.
2. **Entrées/sorties du composant `map-canvas`** (TestBed) : une étiquette est un `<text>` SVG avec la classe de statut, sans `<circle>` ; les en-têtes de nœud portent la classe de kind attendue. Rate les tailles calculées.
3. **e2e WebdriverIO** sur acme-shop : au niveau 0, aucun cercle d'étiquette, l'arête `apps/web → packages/db` porte « ⚠ 2 » (violation) et web → api « 3 +1 », à 3200×2000, et le libellé de chaque système est affiché en entier à 1280 px. Tests existants (`edges.e2e`, `layout.e2e`, `diff-layer.e2e`) toujours verts.

UI : oui. Doc : `map`, `review` (FR et EN), captures.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/edges.logic.spec.ts` (étendu), `src/ui/src/app/modules/map/components/map-page/map-page-edge-labels.component.spec.ts` (nouveau), `tests/e2e/tests/edge-labels.e2e.ts` (nouveau)
- Contrat attendu par les tests : `edges.logic.ts` exporte `edgeLabel({count, added, removed, moved, cls: 'base'|'add'|'del'|'viol'|'violOld'|'mov', review}, {new, moved}): string` (vide si rien à écrire), `edgeLabelVisible(label, screenLength): boolean` (faux si vide ou ≤ 60), et `EdgeShape.length` (distance écran entre les deux bords) ; `edgeThickness(n)` = `1.3 + 0.9·log2(n)` (plafond conservé). Dans le canvas, `[data-testid="map-edge"]` reste présent même sans étiquette ; l'étiquette est un `<text class="el <cls>">` dedans, sans `<rect>` ni `<circle>` ; clés i18n `map.edges.new` / `map.edges.moved`. En-tête de système (`k-package`) : `.hd` 15 px / 38 px, `.lb` en `flex: 0 0 auto`.
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/edges.logic.spec.ts` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/map/components/map-page/map-page-edge-labels.component.spec.ts` ; `just build` puis `cd tests/e2e && NO_COLOR=1 GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/edge-labels.e2e.ts`
- En échec : 
  - edges.logic.spec : ne compile pas, `edgeLabel`, `edgeLabelVisible` et `EdgeShape.length` n'existent pas (tous les tests du fichier sont rouges de ce fait, dont ceux d'avant ; ils repasseront avec les exports) ; `edgeThickness` suit encore `1.2 + 1.1·log2`.
  - map-page-edge-labels (6) : `draws no circle on the edges` — un `<rect>` d'étiquette est encore dessiné ; `writes the number of links in a text of the status class` — pas de `text.el.base` ; `writes no label on an edge of a single link` — un texte « 1 » est écrit ; `calls an added edge of one link new` — pas de `text.el.add` ; `calls it nouveau in French` — idem ; `draws the stroke of the 5-link edge thicker` — épaisseur 3,75 au lieu de 3,39. (Le test `keeps the data attributes` passe : garde-fou de non-régression.)
  - edge-labels.e2e (2) : `no edge label is a circle…` — aucun `text.el` sur l'arête web → db ; `shows the whole label of every system…` — l'en-tête de système fait 13 px / 28,8 px avec `.lb` en `0 1 auto`, au lieu de 15 px / 38 px / `0 0 auto`.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/edges.logic.ts`, `src/ui/src/app/modules/map/business/map.business.ts`, `src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts` et `.scss`, `src/ui/public/i18n/en.json` et `fr.json`, `src/ui/angular.json`
- Changement : `edgeLabel`, `edgeLabelVisible`, `EdgeShape.length` et `edgeThickness` (1,3 + 0,9·log2) dans `edges.logic.ts` ; `EdgeLine` porte `added/removed/moved/review` ; le canvas écrit un `<text class="el <cls>">` (sans rect ni cercle, retiré si l'étiquette est vide ou l'arête courte) ; en-têtes par kind (15/38, 13/30, 12/26, symbole 100 %) et `.lb` en `flex: 0 0 auto` pour système, module, fichier ; clés `map.edges.new` / `moved`. Budget `anyComponentStyle` en erreur relevé de 8 kB à 12 kB (le scss du canvas dépassait de 581 octets).
- Suite : cargo 578 réussis / 0 échoué ; web 520 / 0 (baseline 499 + nouveaux tests) ; e2e 94 réussis, 1 ignoré, 1 échoué (baseline 93 / 1 / 0) ; l'échec est `edge-labels.e2e.ts` test 1. `just lint` échoue sur `prettier --check` de `tests/e2e/tests/explore.e2e.ts`, fichier non touché (déjà dans 7aa4665).
- Questions ouvertes :
  - `edge-labels.e2e.ts` test 1 est incompatible avec les tests unitaires : sur acme-shop, l'arête `web → db` a 2 liens, tous ajoutés, et ne mesure que ~32 px à l'écran à 1280 px. Selon la maquette et `edge-labels`/`edges.logic.spec` (`+2` pour 2 liens ajoutés, masquée sous 60 px), elle n'a ni « new » ni étiquette visible. Le test 2 (en-têtes) passe. Il faut soit corriger la fixture/le test e2e (par exemple une arête à 1 lien assez longue), soit assouplir la règle des 60 px.
  - `just lint` : formater `tests/e2e/tests/explore.e2e.ts` (hors périmètre, fichier de test).

## Answer

- **Étiquettes d'arêtes comme la maquette.**
  - Un `<text class="el <statut>">` SVG avec un halo de la couleur de fond, sans cercle ni rectangle.
  - Le texte vient de `edgeLabel` : le nombre de liens à partir de 2 ; en relecture `+n` / `−n`, `nouveau` / `new`, `déplacé` / `moved`, `⚠ n`.
  - L'étiquette est masquée sous 60 px à l'écran (`edgeLabelVisible`, `EdgeShape.length`).
  - La classe vient de `edgeLabelClass`. Priorité : `hl` > `mov` > `viol` > `violOld` > `add` > `del` > `base`.
  - Épaisseur : `edgeThickness` suit la maquette (`1.3 + 0.9·log2(n)`), plafond gardé.
  - Toute cette logique est dans `edges.logic.ts`, testée par Vitest (`edges.logic.spec.ts`, `edge-label-class.logic.spec.ts`).
- **En-têtes de nœud aux tailles de la maquette.**
  - Système (service, package, workspace) : 15 px sur 38 px. Module : 13 sur 30. Fichier : 12 sur 26. Symbole : 11,5 px.
  - Chasse fixe pour les fichiers et les symboles.
  - `.lb` en `flex: 0 0 auto; max-width: 100%` : pas d'ellipse tant que la boîte a la place.
- **Corrections après le green.**
  - Le test e2e 1 attendait « new » sur `apps/web → packages/db`. Cette arête a 2 liens ajoutés, viole `web-sans-db` et mesure ~32 px à 1280 px. Le test passe donc à 3200×2000 et attend « ⚠ 2 » (`viol`), plus « 3 +1 » (`base`) sur web → api. L'assertion est plus précise, pas plus faible ; le critère du ticket est mis à jour.
  - Le budget d'erreur `anyComponentStyle`, relevé à 12 kB par le green, est revenu à 8 kB. Le style `text.el` est passé dans `styles.scss` (le canvas est en `ViewEncapsulation.None`). Le canvas est à 7,8 kB, un avertissement au-dessus de 4 kB.
  - `tests/e2e/tests/explore.e2e.ts` : reformatage Prettier oublié en U08.
  - Review « fix first » : la cascade de ternaires du canvas est devenue `edgeLabelClass`, testée.
- **Vérifié.**
  - cargo 578 passed, web 527 passed (+28), e2e 95 passed (+2), 1 skipped, 0 failed.
  - `just lint` propre, `just build` passe.
  - Toutes les captures de la doc régénérées, fichier par fichier, EN et FR. La carte montre les étiquettes en texte, comme la maquette.
- **Doc.** `map` (FR et EN) : la flèche porte son nombre de liens à partir de 2, rien sous 60 px, et en relecture `+n`, `−n`, nouveau, déplacé, `⚠ n`.
- **Restes.** Le cast `as EdgeLabelClass` à l'appel sans `highlighted` (sûr, non bloquant).
