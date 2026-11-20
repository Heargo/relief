# U12 Contrôles des panneaux conformes à la maquette

Status: resolved
Type: task
Blocked by: U08, U11
UI: oui
Doc: user-docs `review` (ordre de lecture, rayon d'impact), captures

Spec: `../spec.md` ; référence visuelle : `docs/product/maquette/index.html` (`.seg`, `.iconbtn`, `.tog`, rendus de l'ordre de lecture et de l'impact)

## Constat

Captures de l'utilisateur (2026-11-20) après U08 :

- **Ordre de lecture** : « File / Symbol / Commit » sont trois boutons encadrés séparés, l'actif cerné d'orange. Dans la maquette (et ailleurs depuis U08), c'est un contrôle segmenté `.seg`. « Mark seen » et « Seen, next → » sont des boutons natifs grisés, hors du style des autres.
- **Rayon d'impact** : « Callers / Dependencies » (`impact-direction`) a le même défaut que l'ordre de lecture. Il faut aussi un `.seg`.
- Le bouton « Show all » des commits et les cases à cocher (« via HTTP », « vu ») sont hors du style commun. Les cases à cocher dépendent du thème Optimus de U11.

U08 a posé `.seg`, `.tog` et `.sec` dans `styles.scss`, mais ne les a appliqués qu'au panneau gauche (bascule de mode, calques, disposition).

## À faire

- **Ordre de lecture** : le mode en `.seg`. « Marquer vu » et « Vu, suivant → » en boutons `.iconbtn`, grisés proprement quand ils sont désactivés. « Tout afficher » idem.
- **Impact** : la direction en `.seg`. La case « via HTTP » au style du thème (U11).
- **Inventaire** : relever tout autre `<button>` des panneaux (gauche, droit, panneau d'un nœud, panneau d'une arête) qui n'a ni `.seg`, ni `.iconbtn`, ni `.tog`, et l'aligner. Lister dans `## Answer` ce qui a été changé.
- Garder les `data-testid` et `aria-pressed` existants : `reading-mode-*`, `impact-direction`, et les boutons de « vu ».

## Critères d'acceptation

- [ ] Composant (TestBed) : `reading-order` et `impact-section` rendent leur choix de mode dans un `.seg`, l'actif avec la classe `on` et `aria-pressed="true"`.
- [ ] e2e : aucun `<button>` visible des panneaux gauche et droit n'a le style natif. Un sélecteur fixe la règle : chaque bouton visible est dans un `.seg`, ou a `.iconbtn` ou `.tog`, ou est une ligne de liste explicitement exemptée. Les tests existants (`reading-order.e2e`, `commit-replay.e2e`, `impact.e2e`) restent verts.
- [ ] Captures EN et FR de l'ordre de lecture et de l'impact, comparées à la maquette.

## Baseline

`develop` (9dd4e53, après U10) : cargo 578 passed ; web 550 passed ; e2e 101 passed, 1 skipped, 0 failed. Seul `quicknotes.md` non suivi (fichier de l'utilisateur).

## Seams

1. **Entrées/sorties des composants** (TestBed) : `reading-order-section` (mode en `.seg`, actif `on` + `aria-pressed`, « Marquer vu », « Vu, suivant », « Tout afficher » en `.iconbtn`) et `impact-section` (direction en `.seg`). Rate les styles calculés.
2. **e2e WebdriverIO** sur acme-shop : aucun `<button>` visible des panneaux gauche et droit hors de `.seg`, `.iconbtn`, `.tog` ou d'une liste d'exemptions explicite (lignes de liste cliquables) ; tests existants (`reading-order`, `commit-replay`, `impact`) verts. Rate le détail visuel, couvert par les captures.

UI : oui. Doc : `review` (captures de l'ordre de lecture et de l'impact).

## Red

- Fichiers de test : `src/ui/src/app/modules/review/components/reading-order-section/reading-order-section.component.spec.ts` (nouveau), `src/ui/src/app/modules/review/components/impact-section/impact-section.component.spec.ts` (1 test ajouté), `tests/e2e/tests/panel-controls.e2e.ts` (nouveau)
- Lancer : `cd src/ui && npx ng test --watch=false --include 'src/app/modules/review/components/reading-order-section/*.spec.ts' --include 'src/app/modules/review/components/impact-section/*.spec.ts'` ; `just build` puis `cd tests/e2e && NO_COLOR=1 GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/panel-controls.e2e.ts`
- Inventaire réel (acme-shop) des `<button>` hors `.seg`/`.iconbtn`/`.tog` : à corriger = `reading-mode-*`, `reading-mark`, `reading-mark-next`, `commit-show-all`, `rules-view-file`, `expand-right`, direction d'impact (sans testid). Exemptés (lignes de liste/p-button) : `entry-point-row`, `hotspot-row`, `rule-row`, `signal-row`, `quiet-row`, `overview-row`, `node-link`, `node-child`, `reading-row`, `impact-row`, `commit-row`, `.p-button` (`diff-expand`). Note : `.iconbtn` est dans `map-page.component.scss` (encapsulé) ; à remonter dans `styles.scss`.
- En échec : 8 tests
  - reading-order-section : mode en `.seg` — pas de `.seg`, pas de classe `on`
  - reading-order-section : mark / mark-next `.iconbtn` désactivés sans sélection — classe `iconbtn` absente
  - reading-order-section : mark / mark-next `.iconbtn` activés avec sélection — classe `iconbtn` absente
  - reading-order-section : « Show all » `.iconbtn` — classe absente
  - impact-section : direction en `.seg`, actif `on` + `aria-pressed` — pas de `.seg`, pas de `on`
  - panel-controls.e2e : review (n) — boutons natifs listés ci-dessus
  - panel-controls.e2e : ordre par commit — boutons natifs (mode, mark, show-all, direction, expand)
  - panel-controls.e2e : explore — boutons natifs (rules-view-file, expand-right, direction d'impact)

## Green

- Fichiers : `src/ui/src/styles.scss`, `src/ui/src/app/modules/map/components/map-page/map-page.component.{html,scss}`, `src/ui/src/app/modules/review/components/reading-order-section/reading-order-section.component.{html,scss}`, `src/ui/src/app/modules/review/components/impact-section/impact-section.component.{html,scss}`, `src/ui/src/app/modules/rules/components/rules-section/rules-section.component.{html,scss}`
- Changement : `.iconbtn` remonté dans `styles.scss` (une seule définition, plus un état `:disabled` en `--relief-faint`). Mode de lecture et direction d'impact en `.seg` avec classe `on` + `aria-pressed` ; `reading-mark`, `reading-mark-next`, `commit-show-all`, `rules-view-file`, `expand-right` en `.iconbtn`. Styles locaux de bordure orange retirés.
- Suite : cargo 578/0 (baseline 578) ; web 555/0 (baseline 550, +5 tests rouges) ; e2e 104 passés, 1 ignoré, 0 échec (baseline 101).
- Questions ouvertes : `just lint` échoue sur `prettier --check` de `tests/e2e/tests/panel-controls.e2e.ts` (fichier de test indexé, non modifiable ici) ; à reformater à l'étape suivante.

## Answer

- **`.iconbtn` remonté dans `styles.scss`**, une seule définition à côté de `.seg` et `.tog`. Il a un état `:disabled` lisible (texte `--relief-faint`, bordure `--relief-line`). La barre du haut ne change pas (tests `topbar*` verts).
- **Contrôles alignés** (inventaire réel sur acme-shop, relecture et exploration, un nœud sélectionné) :
  - en `.seg` (classe `on` et `aria-pressed` sur l'actif) : `reading-mode-file`, `reading-mode-symbol` et `reading-mode-commit` ; la direction d'impact « Appelants / Dépendances » ;
  - en `.iconbtn` : `reading-mark`, `reading-mark-next`, `commit-show-all`, `rules-view-file`, `expand-right`.
  - Les anciens styles locaux (bordure orange) sont retirés.
- **Exemptions de l'e2e**, une par une : les lignes de liste cliquables (`entry-point-row`, `hotspot-row`, `rule-row`, `signal-row`, `quiet-row`, `overview-row`, `node-link`, `node-child`, `reading-row`, `impact-row`, `commit-row`) et le bouton Optimus `diff-expand`. `.p-button` était trop large et a été retiré.
- **Review « fix first », corrigé.**
  - `rules-section.component.scss` avait une règle `button { border: 0; padding: 0; … }` de spécificité (0,1,1), qui écrasait `.iconbtn` (0,1,0) : « Voir le fichier » s'affichait sans bordure. Elle est limitée à `button:not(.iconbtn)`.
  - L'audit e2e vérifie maintenant aussi le style calculé (bordure non nulle sur chaque `.iconbtn`). Vérifié : sans le correctif, il échoue en nommant `rules-view-file` ; avec, il passe.
  - `impact-section.component.spec.ts` asserte `classList.contains('seg')` sans le repli `closest`.
- **Test instable corrigé.** Dans `panel-controls.e2e.ts`, le premier test appuyait sur `n` avant que l'ordre de lecture soit chargé, et échouait deux fois sur trois. Il attend maintenant « 0/14 », comme `reading-order.e2e`. Il passe quatre fois sur quatre.
- **Vérifié.**
  - cargo 578 passed, web 555 passed (+5), e2e 104 passed (+3), 1 skipped, 0 failed ; lint propre ; budgets inchangés.
  - Captures FR de l'ordre de lecture et des règles : conformes à la maquette (`.seg`, boutons bordés). Captures de la doc régénérées.
- **Doc.** Aucun texte ne décrit l'apparence de ces boutons ; les captures `review` et `rules` sont régénérées.
- **Hors ticket, remarqué.** Dans l'ordre de lecture, un long chemin passe sous le numéro et la case à cocher au lieu de rester aligné à côté.
