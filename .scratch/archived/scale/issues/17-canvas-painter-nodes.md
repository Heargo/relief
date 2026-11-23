# S17 Peintre Canvas : caméra, boîtes et texte

Status: resolved
Type: task
Blocked by: S15
UI: oui
Doc: aucune tant que le DOM reste le rendu par défaut

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Pourquoi

Premier morceau du moteur Canvas, à côté du DOM : tout ce qu'un nœud montre aujourd'hui.

## Comportement

- Préférence `relief.renderer` (`dom` par défaut, `canvas`) lue au démarrage (`localStorage`, `try/catch`), et `?renderer=canvas` pour les tests et le banc. En `canvas`, les effets `sync*` du DOM ne tournent pas et un `<canvas>` unique remplace le calque des nœuds et le SVG des arêtes.
- Le peintre (`map-painter.ts`, sans Angular) dessine la scène de S15 : redessin complet au plus une fois par `requestAnimationFrame`, `devicePixelRatio`, formes en coordonnées monde sous la caméra, texte en pixels écran.
- Couleurs lues dans les variables CSS `--relief-*` au démarrage et quand le thème change (clair / sombre).
- Nœuds, à parité visuelle avec le DOM (`map-canvas.component.scss`, maquette) : boîte fermée et conteneur ouvert, en-tête (`header` / onglet `tab`, `headerLayout`), libellé tronqué avec `…`, icône (police PrimeIcons dessinée en `fillText`), `sub`, badges, chips de comptes, marque de diff (statut et intensité), fantôme de l'ancien emplacement, impact (`hit` / `box` / `dim` et compte), lecture (vu, progression), archi, chargement, niveau de risque, focus (`faded`), emphase de sélection.
- Le prototype du spike (`proto-renderer.ts`) est supprimé.

## Critères d'acceptation

- [x] Le peintre est testé sur un canvas factice (appels enregistrés) pour les cas : fermé, ouvert avec en-tête, onglet, libellé tronqué, statut, impact, emphase.
- [x] En `?renderer=canvas`, la carte d'acme-shop montre les mêmes nœuds et textes qu'en DOM (capture comparée à l'œil, FR et EN, clair et sombre).
- [x] `just e2e` (DOM par défaut) reste vert.

## Baseline

`75a5913` : cargo 630 passed ; web 786 passed ; `just e2e` 46/46 specs.

## Seams

- **Peintre (`src/ui/src/app/modules/map/components/map-canvas/map-painter.ts`, Vitest sur un contexte 2D factice qui enregistre les appels)** : attrape ce qui est dessiné pour chaque état de nœud de la scène (formes, couleurs de la palette, textes et troncature, alpha d'emphase) ; rate le rendu réel des pixels.
- **Choix du moteur (`renderer.logic.ts`, Vitest)** : préférence `relief.renderer` et `?renderer=` (`dom` par défaut), lecture protégée ; rate l'effet sur le composant.
- **e2e (`tests/e2e/tests/map-canvas.e2e.ts`)** : en `?renderer=canvas`, un seul `<canvas>` dessine la carte, aucun `map-node` dans le DOM, et la scène (`__reliefScene`) donne les mêmes nœuds qu'en DOM ; rate la parité visuelle fine (vérifiée par captures à l'étape 7).

## Red

- Fichiers de test : `src/ui/src/app/modules/map/components/map-canvas/map-painter.spec.ts`, `src/ui/src/app/modules/map/helpers/renderer.logic.spec.ts`, `tests/e2e/tests/map-canvas.e2e.ts`
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/components/map-canvas/map-painter.spec.ts --include src/app/modules/map/helpers/renderer.logic.spec.ts` ; `just build` puis `cd tests/e2e && GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/map-canvas.e2e.ts`
- Interface fixée : `map-painter.ts` exporte `createMapPainter(ctx, palette).paint({nodes, edges}, camera, viewport, dpr)`, `readPalette({getPropertyValue})` et le type `Palette` (`fg muted faint line line2 node nodeOpen panel accent add mod del mov rule impact`) ; `renderer.logic.ts` exporte `chooseRenderer(search, storage: {getItem}) : 'dom' | 'canvas'` (clé `relief.renderer`, `?renderer=` prioritaire).
- En échec : 19 unitaires (compilation, modules `./map-painter` et `./renderer.logic` absents) + 1 e2e
  - readPalette, 12 tests de `createMapPainter` (fermé, libellé, libellé masqué, ouvert, onglet, `…`, added/modified, impact hit, compte impact box, alpha 0.3 / 0.2, emphase `dim`, hors vue, caméra + texte en pixels écran) — `map-painter` n'existe pas
  - 6 tests de `chooseRenderer` — `renderer.logic` n'existe pas
  - e2e « the relief.renderer preference picks the canvas without the query » — aucun `<canvas>` (le prototype ne lit que `?renderer=`)
  - Les 3 autres tests e2e (un canvas, pixels peints, mêmes nœuds que le DOM) passent déjà avec le prototype du spike : gardes de non-régression, pas rouges. Sélecteurs bornés à `[data-testid="map-canvas"]` et `[data-testid="map-node"]`.

## Green

- Fichiers : `src/ui/src/app/modules/map/components/map-canvas/map-painter.ts`, `map-edges-temp.ts`, `map-canvas.component.{ts,html,scss}` ; `src/ui/src/app/modules/map/helpers/renderer.logic.ts`, `map-scene.logic.ts`, `header.logic.ts` ; `docs/bench.md` ; `proto-renderer.ts` supprimé
- Changement : peintre Canvas 2D des nœuds (boîtes, en-têtes, onglets, libellés tronqués, icône en `fillText`, sub, badges, chips, diff, fantôme, impact, lecture, archi, chargement, risque, focus, emphase), `chooseRenderer` (`?renderer=` puis `relief.renderer`), `<canvas>` unique dans le template en mode `canvas` (redessin au plus une fois par `requestAnimationFrame`, mesuré `syncCanvas`, palette relue au changement de thème). Arêtes du prototype conservées dans `map-edges-temp.ts` (à remplacer en S18). `labelFont` exportée par la scène et utilisée par le peintre.
- Suite : cargo 630 réussis / 0 échoué ; web 806 / 0 (baseline 786, +20 tests rouges) ; e2e `map-canvas` 4/4 et `map-scene` 7/7 ; lint propre
- Questions ouvertes : le `t` de `MapSceneInput` est conservé : `map-scene.logic.spec.ts` (non listé dans les tests rouges) le passe encore, le retirer casserait sa compilation ; `renderer` retiré d'`exposeScene`.

## Answer

- `map-painter.ts` : peintre Canvas 2D des nœuds (boîtes, en-têtes, onglets, libellés tronqués par recherche dichotomique avec cache, icônes `openng-icons` en `fillText` et redessin à `document.fonts.ready`, sub, badges arrondis, chips, diff teinté sur `--relief-node`, fantôme, impact, lecture, archi, chargement, risque, focus, emphase), palette `readPalette` relue à tout changement de thème (`MutationObserver` sur la classe de `:root`, `prefers-color-scheme`). Police des boîtes fermées par genre (`closedFontPx`), partagée avec la mesure de la scène.
- `renderer.logic.ts` (`chooseRenderer`) : `?renderer=` puis `relief.renderer`, `dom` par défaut. En `canvas`, un `<canvas>` unique, redessin au plus une fois par frame, mesuré `syncCanvas`. Arêtes provisoires dans `map-edges-temp.ts` (remplacées en S18). `proto-renderer.ts` supprimé.
- Vérifié : web 806 (786 + 20), cargo 630, lint propre ; e2e 47/47 sur trois passages directs, mais 46/47 sur trois passages de `just e2e-summary` (une spec instable, jamais reproduite en relance, non identifiée). Captures DOM / Canvas, clair et sombre, comparées à l'œil : même mise en page, mêmes textes et couleurs. Review : ship.
- Écarts connus : coins des boîtes (6 px) et de l'onglet (4 px) carrés, les tests du peintre fixent `fillRect` / `strokeRect` (à reprendre en S20) ; libellés d'en-tête un peu moins gras que le DOM.
