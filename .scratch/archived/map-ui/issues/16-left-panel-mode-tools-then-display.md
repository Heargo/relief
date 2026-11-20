# U16 Panneau gauche : les outils du mode, puis l'affichage

Status: resolved
Type: task
Blocked by: U12
UI: oui
Doc: user-docs `map`, `review`, `explore` (où trouver chaque section), captures

Spec: `../spec.md` (« Retours du 2026-11-20 ») ; référence visuelle : `docs/product/maquette/v2.html`, sujet 3, panneau gauche

## Constat

Le panneau gauche mêle l'état de la PR, les calques, les règles, l'ordre de lecture et la disposition, sans ordre lisible. L'utilisateur veut : à gauche, les paramètres d'affichage et les outils du mode ; à droite, le détail de la sélection.

## À faire

- **En haut, la bascule PR / Explorer, inchangée** (même design, même place, mêmes `data-testid`).
- **Bloc « Outils »** (titre de bloc + nom du mode), propre au mode :
  - PR : carte de la PR (plage, stats, progression), ordre de lecture, signaux, règles (si présentes).
  - Explorer : points d'entrée, hotspots, règles (si présentes).
- **Bloc « Affichage »**, commun aux deux modes : calques (seuls ceux qui ont du sens dans le mode : diff et focus en PR ; risque et co-change en Explorer ; impact, arêtes inchangées, règles dans les deux), « Masquer les dépendances externes », puis disposition.
- Rien ne quitte le panneau gauche pour le droit dans ce ticket (la vue d'ensemble de la PR reste à droite quand rien n'est sélectionné).
- Les titres de bloc reprennent le style de `.ptitle` de la maquette v2.

## Critères d'acceptation

- [ ] Composant (TestBed) : en PR, l'ordre des sections est bascule, outils (pr-card, reading-order, signals, rules), affichage (layers, layout) ; en Explorer, bascule, outils (explore, hotspots, rules), affichage. Les calques propres à un mode n'apparaissent pas dans l'autre.
- [ ] e2e : les tests du panneau gauche (`left-panel`, `layers`, `reading-order`, `explore`…) restent verts ; migrations listées ici.
- [ ] Captures EN et FR des deux modes.

## Seams

1. **Composant** (TestBed) `map-page` : ordre et contenu des blocs par mode.
2. **e2e** sur acme-shop : les parcours existants.

## Baseline

Après U15 (2026-11-20) : cargo 578/0 ; web 582/0 ; e2e 114 passed, 1 skipped, 0 failed.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/components/map-page/map-page-left-panel-blocks.component.spec.ts` (nouveau), `tests/e2e/tests/left-panel.e2e.ts` (2 tests ajoutés)
- Contrat d'UI posé par les tests : `data-testid="tools-section"` et `data-testid="display-section"`, enfants directs de `left-panel` après la bascule ; leur premier enfant a la classe `ptitle` et le texte « Tools »/« Outils » (+ nom du mode, différent en PR et en Explorer) et « Display »/« Affichage » ; `layers-section` puis `layout-section` dans `display-section` (`toggle-hide-external` entre les calques et la disposition) ; outils PR : `pr-card`, `reading-order`, `signals-section`, `rules-section` ; outils Explorer : `entry-points-section`, `hotspots-section`, `rules-section`. Les clés i18n (EN/FR) sont à créer.
- e2e existants à migrer : aucun. Les 4 tests de `left-panel.e2e.ts` et les specs `layers`, `reading-order`, `explore`, `structural-overview`, `rules`, `layout`, `focus-layers` passent par des `data-testid` conservés (le premier enfant du panneau reste la bascule).
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/components/map-page/map-page-left-panel-blocks.component.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/left-panel.e2e.ts`
- En échec : 10 tests
  - (composant, 8) PR mode order ; Explorer order ; rules tool absent sans règle ; calques propres à un mode ; calques communs ; hide-external avant la disposition ; titres `.ptitle` ; titres FR — tous : `tools-section` / `display-section` n'existent pas.
  - (e2e, 2) « in PR mode the panel reads switch, PR tools, then display » et « in Explorer … » — `tools-section` / `display-section` absents.

## Green

- Fichiers : `src/ui/src/app/modules/map/components/map-page/map-page.component.html`, `src/ui/src/app/modules/review/components/layers-section/layers-section.component.ts`, `src/ui/src/styles.scss`, `src/ui/public/i18n/en.json`, `src/ui/public/i18n/fr.json`
- Changement : le panneau gauche est découpé en `tools-section` (titre `.ptitle` « Outils/Tools » + nom du mode ; pr-card, ordre de lecture, signaux, ou points d'entrée et hotspots ; règles) et `display-section` (calques, masquage des dépendances externes, disposition). `app-layers-section` gagne `hasDiff` et `hasFocus` (défaut true) ; `hasRisk` et `hasCoChange` ne valent que pour Explorer. Style `.ptitle` global, clés `map.panel.*`.
- Suite : web 590/0 (baseline 582/0) ; cargo non touché ; e2e `left-panel`, `reading-order`, `explore`, `focus-layers`, `structural-overview`, `rules`, `layout`, `risk`, `hide-external`, `impact`, `diff-layer` verts ; `co-change` rouge (2 tests, voir ci-dessous).
- Questions ouvertes :
  - `tests/e2e/tests/co-change.e2e.ts` ouvre l'app en mode PR et clique `toggle-co-change-layer`, que le spec du composant exige absent en PR : à migrer (cliquer `explore-toggle` avant), je n'ai pas le droit d'y toucher.
  - `just lint` échoue sur `prettier --check` du seul `map-page-left-panel-blocks.component.spec.ts` (fichier de test rouge, non reformaté par moi) ; le reste du lint passe, budgets compris.

Migration ajoutée par l orchestrateur : `co-change.e2e.ts` passe en mode Explorer (`explore-toggle`) avant de chercher `toggle-co-change-layer`, calque désormais propre à Explorer. Spec du composant reformaté par prettier.

## Answer

Le panneau gauche se lit dans cet ordre : la bascule PR / Explorer (inchangée), le bloc `tools-section` (titre `.ptitle` « Outils » + nom du mode), puis le bloc `display-section` (« Affichage »). Les outils en PR sont la carte de la PR, l'ordre de lecture, les signaux et les règles. En Explorer, ce sont les points d'entrée, les hotspots et les règles. L'affichage regroupe les calques, « Masquer les dépendances externes » et la disposition. `app-layers-section` reçoit `hasDiff`, `hasFocus`, `hasRisk` et `hasCoChange` : diff et focus n'apparaissent qu'en PR, risque et co-change qu'en Explorer.

Vérifié : web 590/0, cargo inchangé, e2e complète 116 passés / 1 ignoré / 0 échec, `just lint` propre, review `ship`. Captures FR des deux modes relues à 1280 px. `co-change.e2e.ts` a été migré : il passe en Explorer avant le calque. Doc `map` (FR/EN) en texte seul, captures de doc non refaites (phase alpha).

Restent en `Consider` : le filtre des calques peu lisible, les quatre booléens tous liés au mode, `.ptitle` global.
