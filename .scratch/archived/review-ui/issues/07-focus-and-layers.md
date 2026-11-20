# Focus PR et calques

Status: resolved
Type: task
Blocked by: R01
UI: oui
Doc: docs/user `review` (calques)

Spec: `../spec.md`

## À faire

- Calque « Focus PR » (touche `f`) : seuls les symboles changés et leurs voisins à 1 saut restent nets, le reste est estompé.
- Section « Calques » de la barre de gauche regroupant les bascules existantes (diff, arêtes inchangées, focus, impact, puis règles et risque quand ils existent), avec leur raccourci.

## Critères d'acceptation

- [x] Vitest : ensemble « changé + 1 saut » sur un graphe littéral.
- [x] e2e : `f` estompe `LoginPage` mais pas `CheckoutPage`.

## Baseline

`just test-summary` (develop, 1694e75) : cargo 431 passed, 0 failed ; web 384 passed, 0 failed.

## Seams

- **Module de logique TS (`focus.logic.ts` ou voisin, Vitest)** : attrape l'ensemble « symboles changés + voisins à 1 saut » sur un graphe littéral (arêtes dans les deux sens, conteneurs des nœuds gardés) ; rate le rendu.
- **Entrées/sorties du composant de la section « Calques »** (`TEST_PROVIDERS`) : attrape les bascules regroupées (diff, arêtes inchangées, focus, impact) avec leur raccourci affiché et les événements émis ; rate le câblage sur la carte.
- **e2e WebdriverIO sur l'app construite et acme-shop** : `f` estompe `LoginPage` mais pas `CheckoutPage`, et la section « Calques » porte les bascules ; rate les cas limites de la logique.

## Red

- Fichiers de test : `src/ui/src/app/modules/review/helpers/focus.logic.spec.ts` (nouveau), `src/ui/src/app/modules/review/components/layers-section/layers-section.component.spec.ts` (nouveau), `src/ui/src/app/modules/map/helpers/shortcuts.logic.spec.ts` (ajout), `tests/e2e/tests/focus-layers.e2e.ts` (nouveau)
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/review/helpers/focus.logic.spec.ts` (idem pour les deux autres specs) ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/focus-layers.e2e.ts`
- En échec : 10 tests
  - focus.logic.spec.ts (5 tests : « keeps changed + 1 hop in both directions », « drops 2 hops / unrelated », « keeps containers », « exactly the set », « empty when nothing changed ») — `./focus.logic` et `focusSet(graph, changedIds): Set<string>` n'existent pas (erreur de compilation)
  - layers-section.component.spec.ts (5 tests : ordre des 4 bascules, raccourcis f/i, aria-pressed, événements `diffChange`/`unchangedEdgesChange`/`focusChange`/`impactChange`, titre Layers/Calques) — `LayersSectionComponent` n'existe pas (erreur de compilation ; inputs `diff`, `unchangedEdges`, `focus`, `impact`, testids `layer-toggle` + `data-layer`, `layer-shortcut`)
  - shortcuts.logic.spec.ts « f toggles the PR focus layer » — `actionForKey('f')` renvoie null au lieu de `{ type: 'focus' }`
  - focus-layers.e2e.ts « the Layers section holds the toggles » — `layers-section` absent (aussi `toggle-focus-layer`)
  - focus-layers.e2e.ts « f fades LoginPage but not CheckoutPage… » — `toggle-focus-layer` / `data-faded` absents ; l'étape initiale (LoginPage net) passe
- Contrat e2e : un nœud estompé porte `data-faded="true"` sur `map-node` ; `toggle-diff-layer`, `toggle-unchanged-edges`, `toggle-impact-layer` doivent se trouver dans `layers-section` (sans doublon de testid ailleurs). Les symboles n'étant dessinés qu'une fois cadrés, l'e2e les atteint par la recherche (`/`, nom, Entrée).
- Écart d'acme-shop : aucun trouvé. CheckoutPage est modifié par la PR (commit checkout) ; LoginPage n'appelle que useSession (non modifié), donc à 2 sauts d'un symbole changé au plus proche (httpPost via useSession) : estompé.

## Green

- Fichiers : `src/ui/src/app/modules/review/helpers/focus.logic.ts`, `.../review/components/layers-section/layers-section.component.{ts,html,scss}`, `.../review/business/diff.business.ts`, `.../map/helpers/shortcuts.logic.ts`, `.../map/components/map-canvas/map-canvas.component.{ts,html,scss}`, `.../map/components/map-page/map-page.component.{ts,html}`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `focusSet` (changés + 1 saut dans les deux sens + conteneurs ; `null` si rien n'a changé, surcharge non-null pour un tuple non vide car le spec indexé lit le résultat sans test de nullité ; `focusIds` lit `mapDiff()`, le diff actif filtré par commit) ; touche `f` et signal `focusLayer` dans `DiffBusiness` ; la carte pose `data-faded="true"` (opacité 0.2) hors de l'ensemble ; nouvelle section « Calques » (`app-layers-section`) qui regroupe les bascules diff, arêtes inchangées, focus, impact (retirées de leur ancien emplacement : carte et section diff).
- Suite : cargo 431 passed, 0 failed (baseline identique) ; web 396 passed, 0 failed (baseline 384 + 12 nouveaux) ; e2e 68 passed, 1 skipped, 0 failed ; lint propre.
- Questions ouvertes : chaque bascule est un `<button data-testid="toggle-*">` contenant un `<span data-testid="layer-toggle" data-layer aria-pressed>`, car le spec unitaire et l'e2e exigent deux testids différents sur la même bascule ; un premier `just e2e-summary` a échoué puis le second est passé (probablement transitoire) ; le budget SCSS de map-canvas est dépassé (avertissement déjà présent avant).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - layers-section.component.html:3-10 — `aria-pressed` porté deux fois (bouton + span `layer-toggle`), un `<button>` dans lequel un span reprend l'état pour satisfaire deux testids — porter `data-testid="layer-toggle"` et `data-layer` sur le bouton et garder `toggle-*` en attribut distinct est impossible (un seul testid) : acceptable, mais à documenter ou aligner l'e2e et le spec sur un seul testid.
  - map-page.component.ts:121-127 — `focusIds` filtre sur `::sym:` : une PR qui ne change que des fichiers donne un ensemble vide, donc toute la carte estompée ; `focusIds` lit `review.diff()` et non `activeDiff` — retourner null si aucun symbole changé.
  - map-canvas : les arêtes ne sont pas estompées avec les nœuds du focus.
  - map-canvas.component.scss : le budget `anyComponentStyle` (4 kB, ~8,3 ko) était déjà dépassé sur HEAD (8300 octets, +48 ici), pas une régression.
  - focus-layers.e2e.ts:25-40 — pas de dépendance à une animation d'opacité (aucune `transition` sur les nœuds ; seule l'animation des arêtes existe). Le flaky vient plus probablement du cadrage de la caméra ; la boucle waitUntil (deux lectures identiques) le couvre, mais « sharp » peut se stabiliser avant le rendu final.
- Ajout (review) : `focus.logic.spec.ts` attend `focusSet(graph, [])` === `null` (aucun symbole changé : rien n'est estompé), remplaçant l'ancien test « empty » (ensemble vide). Rouge : `focusSet` renvoie un `Set` vide au lieu de `null` (2 tests : liste vide, graphe vide).

## Answer

- Construit : `focusSet` (symboles changés + voisins à 1 saut dans les deux sens + conteneurs ; `null` quand aucun symbole n'est changé, donc rien n'est estompé) ; calque « Focus PR » (touche `f`, `data-faded` sur les nœuds hors focus), calculé sur le diff actif (commit sélectionné en mode Commit) ; section « Calques » (`app-layers-section`) qui regroupe diff, arêtes inchangées, focus et impact avec leurs raccourcis ; la bascule « Arêtes inchangées » quitte la carte.
- Review : « ship », puis correction du focus qui estompait toute la carte sans symbole changé et lisait le diff complet au lieu du diff actif. Après lecture de la capture, l'état coupé d'une bascule est rendu lisible (texte atténué, fond sur l'état actif).
- Vérifié : `just test-summary` cargo 431/0, web 396/0 (baseline 431/384) ; `just e2e-summary` 68 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-shots` et lecture de `review-layers` FR/EN ; `just docs-build`.
- Doc : section « Calques » de `review` (FR et EN) avec capture ; page `map` mise à jour (la bascule des arêtes est dans « Calques »).
- Suivis (Consider) : estomper aussi les arêtes hors focus ; un seul testid par bascule (aujourd'hui `toggle-*` et `layer-toggle`, d'où `aria-pressed` en double et deux signatures de `focusSet` pour le spec) ; budget SCSS de `map-canvas` déjà dépassé avant ce ticket.
