# U24 Ne pas afficher les dépendances internes du nœud sélectionné

Status: resolved
Type: task
Blocked by: U18
UI: oui
Doc: user-docs `map` (sélection)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 : quand un nœud est sélectionné, ses dépendances internes s'affichent et encombrent la vue.

## Question ouverte

Lecture proposée : les arêtes dont les deux extrémités sont à l'intérieur du nœud sélectionné (entre ses enfants) sont masquées ; seules ses arêtes vers l'extérieur ressortent (U18). À confirmer, et préciser : masquées ou estompées comme `dim` ? Seulement à la sélection, ou aussi au survol ?

## Décision (2026-11-20)

Masquées (classe `hidden`), et seulement à la sélection : le survol ne change rien.

## À faire

- Dans `emphasis.logic.ts`, une classe `hidden` pour les arêtes internes au nœud sélectionné.

## Critères d'acceptation

- [ ] Vitest : une arête entre deux enfants du nœud sélectionné est classée interne ; ses arêtes vers l'extérieur restent `out` / `in`.
- [ ] e2e sur acme-shop : après sélection d'un module ouvert, ses arêtes internes ne sont plus visibles.

## Baseline

`just test-summary` (2026-11-20, b4241c2) : cargo 611 passed, 0 failed ; web 657 passed, 0 failed.

## Seams

- **`emphasis.logic.ts`** (fonction exportée, Vitest) : attrape le classement `hidden` d'une arête dont les deux extrémités sont des descendants du nœud sélectionné, le maintien de `out` / `in` pour ses arêtes vers l'extérieur, et l'absence d'effet au survol ; rate le rendu effectif sur le canvas.
- **e2e WebdriverIO sur acme-shop** : attrape qu'après sélection d'un module ouvert ses arêtes internes ne sont plus visibles à l'écran ; rate les cas limites (imbrication profonde, survol), couverts par le premier seam.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/emphasis.logic.spec.ts` (nouveau `describe`), `tests/e2e/tests/hidden-internal-edges.e2e.ts`
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/emphasis.logic.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/hidden-internal-edges.e2e.ts`
- En échec : 2 tests (+ 1 non rouge par construction)
  - `hides an edge whose two ends are inside the selected node` — reçoit `out` au lieu de `hidden`
  - e2e `are hidden once the module is selected, and come back on Escape` — l'arête interne payment.ts → invoice.ts n'obtient jamais la classe `hidden`
  - Note : `keeps the edges to the outside…` et `hides nothing without a selection…` passent déjà (non-régression : `out`/`in`/`dim` et rien de masqué sans sélection ou avec une arête choisie) ; le survol n'étant pas un paramètre de `edgeEmphasis`, il n'a pas de test propre.

## Green

- Fichiers : src/ui/src/app/modules/map/helpers/emphasis.logic.ts, src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts, src/ui/src/styles.scss
- Changement : `edgeEmphasis` classe `hidden` une arête dont les deux extrémités sont dans le nœud sélectionné ; le canvas bascule cette classe sur le groupe `g.edge` ; `.edge.hidden { display: none }`. Le survol n'est pas touché.
- Suite : cargo 611 passed / 0 failed ; web 660 passed / 0 failed (baseline 611 / 657, +3 tests rouges).
- Questions ouvertes : e2e wdio non lancé (Vitest vert, lint propre).

## Review

- Verdict : fix first
- Must fix : docs/user/src/content/docs/en/map.md:72 et docs/user/src/content/docs/map.md:72 — le ticket annonce `Doc: user-docs map (sélection)` mais aucune page n'est modifiée — ajouter dans les deux langues que les arêtes internes au nœud sélectionné sont masquées (pas estompées) et reviennent avec Échap.
- Consider : tests/e2e/tests/hidden-internal-edges.e2e.ts:50 — la condition `display === 'none' || visibility === 'hidden' || opacity === 0` est lâche — ne tester que `display: none`, ce que le CSS fait. Le e2e n'a pas été lancé (Green le signale) : le lancer avant de fusionner.
- Consider : src/ui/src/app/modules/map/helpers/emphasis.logic.ts:29 — `at !== null` répété trois fois — sortir un `if (at === null) dim` ou calculer `inside` une fois.

## Answer

- `edgeEmphasis` (`emphasis.logic.ts`) classe `hidden` une arête dont les deux extrémités sont dans le nœud sélectionné ; ses arêtes vers l'extérieur restent `out` / `in`. Le survol ne change rien. Le canvas pose la classe sur `g.edge`, `.edge.hidden { display: none }`.
- Doc utilisateur `map` (FR et EN), section sélection, mise à jour ; `just docs-build` passe.
- Vérifié : Vitest (12/12 sur `emphasis.logic.spec.ts`), `just lint` propre, `just e2e-summary` 131 passed, 1 skipped, 0 failed (dont `hidden-internal-edges.e2e.ts`). Suite : cargo 611, web 660 (baseline 611 / 657).
- Review : `Must fix` (doc) traité. `Consider` non appliqués : condition de visibilité large dans le e2e, `at !== null` répété dans `edgeEmphasis`.
