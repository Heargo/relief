# U25 Historique de navigation : précédent / suivant

Status: resolved
Type: task
Blocked by: U05
UI: oui
Doc: docs/user `map` (raccourcis)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 (`quicknotes.md`, se perdre dans les dépendances) : après avoir suivi plusieurs arêtes, rien ne ramène au nœud d'avant.

## À faire

- Chaque sélection (nœud, arête) et chaque cadrage par la recherche ou un lien de panneau ajoute une étape à l'historique (sélection et caméra) ; pan et zoom à la main n'en ajoutent pas.
- `Alt` + `←` / `→`, boutons 4 / 5 de la souris et deux boutons dans le fil d'Ariane : étape précédente / suivante, avec un vol de caméra.
- Logique dans un module pur (`history.logic.ts`) ; l'historique vit le temps de la session, vidé au changement de plage.

## Critères d'acceptation

- [x] Tests Vitest de `history.logic` (pile, branche abandonnée après un retour puis une nouvelle sélection).
- [x] e2e acme-shop : sélectionner A, puis B depuis une arête de A, `Alt+←` resélectionne A et le cadre.

## Baseline

`just test-summary` (2026-11-20, après U23, bd034ac) : cargo 615 passed, 0 failed ; web 664 passed, 0 failed. e2e 137 passés, 1 ignoré, 0 échec.

## Seams

- **`history.logic.ts`** (fonctions pures exportées, Vitest) : attrape la pile (push, back, forward), l'abandon de la branche avant après un retour puis une nouvelle étape, les bornes (rien avant la première, rien après la dernière), le vidage ; rate le câblage clavier/souris et la caméra.
- **Business de la carte** (`*.business.ts`, `TestBed`, `ReliefApiService` mocké) : attrape qu'une sélection et un cadrage par recherche ou lien ajoutent une étape, que pan/zoom n'en ajoutent pas, que précédent/suivant restaurent sélection et caméra, et que le changement de plage vide l'historique ; rate le rendu.
- **e2e WebdriverIO sur acme-shop** : sélectionner A, puis B depuis une arête de A, `Alt+←` resélectionne A et le cadre ; `Alt+→` revient sur B ; les boutons du fil d'Ariane font de même ; rate les boutons 4/5 de la souris (non simulables de façon fiable, couverts par le câblage commun avec le clavier).

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/history.logic.spec.ts`, `src/ui/src/app/modules/map/business/map-history.business.spec.ts`, `tests/e2e/tests/navigation-history.e2e.ts`
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/map/helpers/history.logic.spec.ts` ; idem avec `src/app/modules/map/business/map-history.business.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/navigation-history.e2e.ts`
- API attendue : `history.logic.ts` exporte `emptyHistory<T>()`, `pushStep(h, step)`, `goBack(h)`, `goForward(h)`, `currentStep(h)` (null si vide), `canGoBack(h)`, `canGoForward(h)`, `clearHistory(h)` (immuables, bornes = no-op). `MapBusiness` expose `canGoBack()`, `canGoForward()` (signals), `goBack()`, `goForward()` ; `show(graph)` sans `keepView` vide l'historique. e2e : boutons `data-testid="history-back"` / `history-forward` (`disabled` sans étape) dans le fil d'Ariane, `Alt+←/→`.
- En échec : 20 tests (9 logic, 9 business, 2 e2e)
  - history.logic.spec (9 tests) — module `./history.logic` inexistant (ne compile pas)
  - map-history.business.spec (9 tests) — `canGoBack`, `canGoForward`, `goBack`, `goForward` absents de `MapBusiness` (ne compile pas)
  - e2e « Alt+Left selects the previous node again… » — Alt+← ne fait rien (le badge reste `node`, pas `edge`)
  - e2e « the buttons of the breadcrumbs go back and forward » — `history-back` introuvable

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/history.logic.ts` (nouveau), `helpers/shortcuts.logic.ts`, `business/map.business.ts`, `components/map-canvas/map-canvas.component.{html,scss}`, `components/map-page/map-page.component.ts`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `history.logic.ts` (pile immuable avec curseur, branche avant abandonnée au push). `MapBusiness` enregistre une étape (sélection, caméra visée, niveau, cap) à chaque sélection nœud/arête/lien/recherche, rien pour pan/zoom ; `goBack`/`goForward` restaurent avec vol de caméra ; `show()` sans `keepView` vide l'historique. `Alt+←/→` et boutons souris 4/5 dans `map-page`, deux boutons à icônes SVG (sans texte, pour ne pas changer le texte du fil d'Ariane testé par navigation.e2e) `history-back`/`history-forward` dans le fil d'Ariane, clés i18n `map.history.*`.
- Suite : cargo 615/0 (= baseline) ; web 682/0 (664 + 18 nouveaux) ; e2e 139 passés, 1 ignoré, 0 échec (baseline 137 + 2 nouveaux) ; lint propre ; aucun fichier de test modifié.
- Questions ouvertes : les raccourcis Alt+←/→ ne sont pas listés dans la fenêtre d'aide (SHORTCUTS ne gère pas les modificateurs) ; doc utilisateur `map` (raccourcis) à mettre à jour à l'étape doc.

## Review

Verdict initial : fix first. Must fix : tests de `historyMove` / `mouseHistoryMove` (ajoutés). Consider traités : `flightTarget` remis à null par `stopAnimation()` (caméra périmée pendant l'animation de layout), branchement back/forward dédoublonné (`moveInHistory`), Alt+←/→ ignoré dans un champ de saisie. Consider restants : `clearHistory` ignore son argument (API du ticket), `show()` avec `keepView` garde des étapes qui peuvent viser des nœuds disparus (non testé), Alt+←/→ absent de la fenêtre d'aide (`SHORTCUTS` ne gère pas les modificateurs).

## Answer

- `history.logic.ts` : pile immuable avec curseur (`emptyHistory`, `pushStep`, `goBack`, `goForward`, `currentStep`, `canGoBack`, `canGoForward`, `clearHistory`), branche avant abandonnée au push.
- `MapBusiness` enregistre une étape (sélection, caméra visée, niveau) à chaque sélection de nœud, d'arête, de lien de panneau ou de résultat de recherche ; pan et zoom n'en ajoutent pas. `goBack` / `goForward` restaurent avec un vol de caméra. `show()` sans `keepView` (changement de plage) vide l'historique.
- `Alt+←/→`, boutons 4 / 5 de la souris et deux boutons à icône à gauche du fil d'Ariane (`history-back`, `history-forward`, désactivés sans étape).
- Doc utilisateur `map` (FR et EN) : paragraphe « Précédent / suivant » et ligne dans le tableau des raccourcis ; `just docs-build` passe.
- Vérifié : cargo 615 / 0, web 684 / 0 (baseline 615 / 664), `just lint` propre, `just e2e-summary` 139 passés, 1 ignoré, 0 échec.
