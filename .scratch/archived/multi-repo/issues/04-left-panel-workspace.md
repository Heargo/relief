# K04 Panneau gauche : espace de travail, puis mode, puis comparaison

Status: resolved
Type: task
Blocked by: K03
UI: oui
Doc: docs/user `review`, `map`

Spec: `../spec.md` (Interface)

## Comportement

- En tête du panneau gauche : nom du dépôt (ou de l'espace), branche courante.
- Puis la bascule de mode (Relire la PR / Explorer).
- Sous la bascule, la sélection de la comparaison (aujourd'hui dans la barre du haut, U19/U23), visible seulement en mode Relire la PR.

## Critères d'acceptation

- [ ] e2e : la comparaison est dans le panneau gauche en relecture, absente en exploration ; nom et branche en tête.
- [ ] Doc FR/EN.

## Baseline

Après K03 (`fc0bf86`) : cargo 682 passed, 0 failed ; web 1058 passed, 0 failed ; e2e 180 passed, 1 skipped.

## Seams

- **Composant du panneau gauche / page** (entrées/sorties Angular, `TEST_PROVIDERS`, `ReliefApiService` mocké) : l'en-tête (nom du dépôt, branche courante) au-dessus de la bascule de mode, la sélection de comparaison sous la bascule seulement en mode Relire la PR, absente en Explorer. Rate l'intégration réelle avec le backend.
- **e2e WebdriverIO** sur acme-shop : la comparaison (contrôles de plage d'aujourd'hui, U19/U23) est dans le panneau gauche en relecture et plus dans la barre du haut, absente en exploration ; nom et branche affichés en tête. Rate les cas limites (dépôt détaché, nom long).

## Red

- Fichiers de test : `src/ui/src/app/modules/map/components/map-page/map-page-workspace-header.component.spec.ts`, `tests/e2e/tests/left-panel-workspace.e2e.ts`
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/map/components/map-page/map-page-workspace-header.component.spec.ts` ; `cd tests/e2e && timeout 580 xvfb-run -a npx wdio run wdio.conf.ts --spec tests/left-panel-workspace.e2e.ts`
- Nouveaux data-testid attendus : `workspace-header` (premier enfant de `left-panel`, contient `repo-name` et `ref`, existants), `compare-section` (sous la bascule, en mode Relire seulement, contient `<app-range-picker>`).
- En échec : 7 tests
  - unit « heads the left panel… » — `workspace-header` absent
  - unit « no longer shows the name and the branch in the top bar » — `repo-name`/`ref` encore dans la barre du haut
  - unit « moves the range picker under the mode switch… » — `app-range-picker` encore dans la barre du haut, pas de `compare-section`
  - unit « hides the comparison in explore mode… » — `range-base` toujours présent en Explorer (barre du haut)
  - e2e « heads the left panel with the repository name and the branch » — `workspace-header` absent
  - e2e « shows the comparison under the mode switch… » — `compare-section` absent
  - e2e « hides the comparison in explore mode… » — `range-base` existe encore en Explorer
- À corriger au green : `map-page-left-panel.component.spec.ts` (« opens the panel with the mode switch ») suppose que la bascule est le premier enfant du panneau ; `left-panel.e2e.ts` (« first ») idem ; `topbar*.e2e.ts`/`range-picker.e2e.ts`/`topbar-range-list.e2e.ts` si ils supposent la barre du haut.

## Green

- Fichiers : `src/ui/src/app/modules/map/components/map-page/map-page.component.{html,scss}`, `src/ui/src/app/modules/review/components/range-picker/range-picker.component.scss`, specs adaptées (`map-page-left-panel.component.spec.ts`, `map-page-left-panel-blocks.component.spec.ts`, `tests/e2e/tests/left-panel.e2e.ts` : « premier enfant » devient « deuxième »), docs `docs/user/src/content/docs/{review,map}.md` et `en/`
- Changement : bloc `workspace-header` (nom, méta, branche) déplacé de la barre du haut en tête du panneau gauche ; `compare-section` (`<app-range-picker>`) sous la bascule, seulement en relecture ; le popover du sélecteur passe en flux (position statique) pour ne pas être rogné par le panneau.
- Suite : cargo 682 réussis / 0 échoué ; web 1062 / 0 (baseline 1058 + 4 rouges) ; e2e touchées une à une toutes vertes (left-panel-workspace, left-panel, topbar*, range-picker, shell, diff-layer, base-head-reference, layout, reading-order, settings-menu, fixture-*, map-canvas).
- Questions ouvertes : `just lint` échoue seulement sur Prettier pour `map-page-workspace-header.component.spec.ts` (spec rouge indexée, que je ne peux pas reformater) ; à formater par l'appelant.

## Review

Verdict initial : fix first. Must fix appliqués : Prettier sur la spec rouge ; doc « sous la barre » → « sous la comparaison, dans le panneau gauche » (FR/EN), et mention du bouton « ? » disparu remplacée par Paramètres › Raccourcis. Considers appliqués : `[class.right]` mort retiré. La suite e2e complète a ensuite révélé un échec `panel-controls` (boutons du sélecteur au style natif dans le panneau), corrigé par green (classe `iconbtn`).

## Answer

- `workspace-header` en tête du panneau gauche : nom du dépôt, langages/détecteur, branche courante ; ils quittent la barre du haut.
- `compare-section` sous la bascule de mode, en Relire la PR seulement : les contrôles de plage existants (U19/U23) déplacés tels quels ; le popover passe en flux (il était rogné par le défilement du panneau). La refonte source → destination est pour K05.
- Specs existantes adaptées (sélecteurs seulement) : `map-page-left-panel*.spec.ts`, `left-panel.e2e.ts`.
- Vérifié : web 1062/0, cargo 682/0, e2e 183 passés / 1 ignoré, lint propre, captures EN/FR à 1280 et 1024 px relues.
- Doc : `review`, `map` FR/EN (texte seulement, captures non régénérées en phase alpha).
