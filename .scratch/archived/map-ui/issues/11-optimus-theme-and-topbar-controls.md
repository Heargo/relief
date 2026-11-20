# U11 Thème Optimus et contrôles de la barre du haut

Status: resolved
Type: bug
Blocked by: U07
UI: oui
Doc: user-docs `map` et `review` (plage de commits, recharger), captures

Spec: `../spec.md` ; référence visuelle : `docs/product/maquette/index.html` (`.refsel`, `.iconbtn`, `.sres`, option « working tree vs HEAD » l. ~282)

## Constat

`relief .` sur le dépôt relief (capture de l'utilisateur, 2026-11-20) :

- **Liste de la plage cassée.** Ouverte, la liste n'a ni fond, ni bordure, ni ombre : « develop...main » et « main...develop » s'écrivent en texte nu par-dessus la carte. **Cause** : `app.config.ts` appelle `provideOptimus({ theme: { options: … } })` sans aucun preset. Les composants Optimus (listes déroulantes de `p-select`, cases à cocher, etc.) n'ont donc pas de style. `@openng/optimus-ui-themes` est installé (Aura, Lara, Nora, Material) mais n'est pas utilisé. Les variables `--p-select-*` posées par U07 n'habillent que le champ, pas sa liste.
- **Plage vide.** Avec `relief .`, la plage est l'arbre de travail comparé à HEAD (`range` à `null`). `rangeChoices` ne propose pas ce choix, donc le champ est vide.
- **« Reload »** est un bouton natif, sans le style `.iconbtn` des autres boutons de la barre.
- Le sélecteur de langue et sa liste ont le même défaut de thème que la plage.
- Seule la recherche est conforme (avis de l'utilisateur).

## À faire

- **Brancher un preset Optimus** (Aura, par `definePreset`), dérivé sur les jetons de relief : couleurs `--relief-*`, rayon 6 px, police héritée de 13 px, mode sombre sur le sélecteur existant. Poser le thème une seule fois (`app.config.ts`, plus `styles.scss` si besoin). Garder ce que U07 a réglé sur les champs.
- **Listes déroulantes** comme `.sres` de la maquette : fond `--relief-panel`, bordure `--line-2`, rayon 8 px, ombre `--shadow`. L'option survolée ou choisie a le fond `--panel-2`. Plage en chasse fixe de 12 px.
- **Plage** : quand `range` est `null`, le champ affiche un choix libellé « arbre de travail vs HEAD » / « working tree vs HEAD » (i18n), présent dans la liste et sélectionné. Le choisir revient à l'arbre de travail.
- **« Recharger »** prend le style `.iconbtn`, sur une ligne, à la hauteur des autres.
- Vérifier les autres composants Optimus déjà utilisés (cases à cocher de l'ordre de lecture et de l'impact, `p-select`) : le preset les habille sans casse visuelle.

## Critères d'acceptation

- [ ] Vitest (`rangeChoices` ou un helper voisin) : sans plage, le premier choix est l'arbre de travail, et il est la valeur courante.
- [ ] e2e : la liste de la plage ouverte a un fond opaque (`background-color` calculé non transparent) et une bordure. Sur une fixture lancée sans plage (`tiny`), le champ de la plage n'est pas vide.
- [ ] e2e : « Recharger » a la même hauteur que « Sombre » (± 1 px).
- [ ] Les tests existants de la barre (`topbar.e2e`, barre à 1024 px de `diff-layer.e2e`, `shell.e2e`) restent verts.
- [ ] Captures EN et FR, clair et sombre, liste de la plage ouverte, comparées à la maquette.

## Baseline

`develop` (2c1de3c, après U09) : cargo 578 passed ; web 527 passed ; e2e 95 passed, 1 skipped, 0 failed. Seul `quicknotes.md` non suivi (fichier de l'utilisateur).

## Seams

1. **Module de logique TS** (`rangeChoices` dans `modules/review/helpers/diff-layer.logic.ts`, ou un helper voisin, Vitest) : sans plage, le choix « arbre de travail » est en tête et sert de valeur courante ; avec une plage, rien ne change. Rate le rendu.
2. **Entrées/sorties du composant `map-page`** (TestBed) : le champ de la plage a une valeur quand `range` est `null`, et « Recharger » a la classe `iconbtn`. Rate le thème (jsdom ne calcule pas le CSS).
3. **e2e WebdriverIO** : liste de la plage ouverte sur acme-shop avec un fond opaque et une bordure ; sur `tiny` (lancée sans plage), champ de la plage non vide ; « Recharger » à la hauteur de « Sombre ». Rate le détail visuel, couvert par les captures.

UI : oui. Doc : `map`, `review` (plage, recharger), captures.

## Red

- Fichiers de test : `src/ui/src/app/modules/review/helpers/diff-layer.logic.spec.ts`, `src/ui/src/app/modules/map/components/map-page/map-page.component.spec.ts`, `tests/e2e/tests/topbar-controls.e2e.ts` (`// @fixture tiny`, lancée sans plage : « Recharger » visible), `tests/e2e/tests/topbar-range-list.e2e.ts` (acme-shop)
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/review/helpers/diff-layer.logic.spec.ts --include src/app/modules/map/components/map-page/map-page.component.spec.ts` ; `just build` puis `cd tests/e2e && NO_COLOR=1 GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/topbar-controls.e2e.ts` (idem `topbar-range-list.e2e.ts`)
- Contrat de nommage : `WORKTREE_RANGE` (= `'WORKTREE'`, déjà la valeur de `?range=`) et `currentRange(range: string | null)` à exporter de `diff-layer.logic.ts` ; libellé i18n affiché « working tree vs HEAD » / « arbre de travail vs HEAD ».
- En échec : 9 tests
  - `rangeChoices without a range` > puts the working tree first… — `WORKTREE_RANGE` et `currentRange` non exportés (le fichier ne compile pas ; fait échouer tout le fichier spec)
  - `rangeChoices without a range` > changes nothing with a range — même cause
  - `map-page` shows the working tree as the range when opened without one — champ vide (`' '`)
  - `map-page` labels the working tree in French — champ vide
  - `map-page` styles the reload button as an icon button — pas de classe `iconbtn`
  - e2e `topbar-controls` the range field is not empty… — texte du champ `""`
  - e2e `topbar-controls` the open range list has an opaque background and a border — fond `rgba(0, 0, 0, 0)` (pas de preset)
  - e2e `topbar-controls` Reload is as tall as the theme button — écart 1,84 px
  - e2e `topbar-range-list` on acme-shop the open range list… — fond `rgba(0, 0, 0, 0)`

## Green

- Fichiers : `src/ui/src/app/relief-preset.ts` (nouveau), `src/ui/src/app/app.config.ts`, `src/ui/src/app/modules/review/helpers/diff-layer.logic.ts`, `src/ui/src/app/modules/map/components/map-page/map-page.component.{ts,html,scss}`, `src/ui/src/styles.scss`, `src/ui/public/i18n/{en,fr}.json`
- Changement : preset Aura dérivé par `definePreset` (surfaces et accent sur `--relief-*`, rayon 6 px, liste de `p-select` en `--relief-panel` / `--relief-line-2` / 8 px, option survolée ou choisie en `--relief-panel-2`), branché une fois dans `provideOptimus` ; le mode sombre pose déjà `.dark` sur `<html>`. `WORKTREE_RANGE`, `currentRange` et `rangeChoices` (arbre de travail en tête sans plage) ; le champ de la plage affiche `review.worktree` ; « Recharger » a la classe `iconbtn`. `.p-select-label` passe en `overflow: clip` (avec `hidden`, WebDriver lisait un texte vide).
- Suite : cargo 578/0 (baseline 578) ; web 532/0 (baseline 527, +5 tests rouges) ; e2e 99 passed, 1 skipped, 0 failed (baseline 95) ; lint propre ; budgets `angular.json` inchangés (avertissements de budget SCSS déjà présents sur map-page et map-canvas, aucune erreur).
- Questions ouvertes : les surcharges `--p-inputtext-*` / `--p-select-*` de `styles.scss` sont gardées telles quelles (U07), non retirées ; captures et doc utilisateur non faites (étape suivante).

## Answer

- **Thème Optimus branché.**
  - `src/ui/src/app/relief-preset.ts` : Aura dérivé par `definePreset`, branché une seule fois dans `provideOptimus` (`app.config.ts`).
  - Une seule palette pour le clair et le sombre, qui pointe sur les jetons `--relief-*` (ils basculent eux-mêmes par `:root.dark`). Rayon 6 px, anneau de focus coupé.
  - Liste de `p-select` comme `.sres` de la maquette : fond `--relief-panel`, bordure `--line-2`, rayon 8 px. L'ombre vient du nouveau jeton `--relief-shadow`, en clair et en sombre (valeurs de la maquette). L'option survolée ou choisie a le fond `--panel-2`.
  - `--p-select-border-radius` est retiré de `styles.scss`, puisqu'il doublonnait le preset. Les autres surcharges de U07 (champ, padding, focus) restent : le preset ne les couvre pas.
- **Plage.**
  - `WORKTREE_RANGE` (`'WORKTREE'`, la valeur de `?range=`) et `currentRange` dans `diff-layer.logic.ts`. `rangeChoices` met l'arbre de travail en tête quand il n'y a pas de plage.
  - Le champ affiche « arbre de travail vs HEAD » / « working tree vs HEAD ».
- **« Recharger »** en `.iconbtn`. `.p-select-label` passe en `overflow: clip` : avec `hidden`, WebDriver lisait un texte vide.
- **Vérifié.**
  - cargo 578 passed, web 532 passed (+5), e2e 99 passed (+4), 1 skipped, 0 failed.
  - Lint propre, budgets d'`angular.json` inchangés.
  - Liste de la plage ouverte capturée en clair et en sombre (FR, 1280 px) : fond, bordure, ombre, options en chasse fixe, conformes à `.sres`.
  - Toutes les captures de la doc régénérées.
- **Doc.** `review` (FR et EN) : le choix « arbre de travail vs HEAD » dans le sélecteur de plage.
- **Restes, non bloquants.** Les deux gabarits `selectedItem` et `item` du sélecteur de plage répètent le même `@if`. La bordure de la liste n'est pas testée en sombre.
