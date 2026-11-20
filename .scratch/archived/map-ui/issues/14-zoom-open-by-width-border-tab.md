# U14 Zoom : ouverture à la largeur, titre en étiquette sur le bord

Status: resolved
Type: task
Blocked by: U10
UI: oui
Doc: user-docs `map` (zoom sémantique), captures

Spec: `../spec.md` (« Retours du 2026-11-20 ») ; référence visuelle : `docs/product/maquette/v2.html`, sujet 1, option A

## Constat

U10 n'ouvre un conteneur qu'une fois son titre lisible (police ≥ 8 px). Sur un dépôt aux modules larges, l'ouverture des modules est repoussée vers l'échelle 0,44, celle des systèmes vers 0,32 : on reste trop longtemps au niveau système ou module. L'utilisateur veut retrouver le zoom d'avant U10, sans en revenir aux en-têtes recouverts par les enfants.

## À faire

- **Ouverture à la largeur seule**, comme avant U10 : retirer la condition `openHeader(...).labelVisible` de `computeModes` (`visibility.logic.ts`) et les `minOpenScale` de `levelScales` (`camera.logic.ts`). Les seuils restent 470, 300 et 175 px.
- **L'en-tête garde la place réservée** (U10) : hauteur `min(header × échelle, taille maquette)`, police qui suit. Aucun enfant ne recouvre l'en-tête.
- **Sous 11 px de police, le titre passe en étiquette** : l'en-tête n'affiche plus de libellé ; une étiquette (police fixe 11 px, fond du panneau, bordure `--line-2`, rayon 4 px) se pose à cheval sur la bordure haute du conteneur, à 8 px du bord gauche, au-dessus des enfants. Elle ne dépasse jamais la largeur du conteneur (ellipse) et garde le nom complet en `title`.
- La règle d'U10 sur les boîtes fermées ne change pas (pas de libellé coupé sous 14 × 28 px, nom au survol).
- Logique pure dans `header.logic.ts` : pour un kind et une échelle, `{ height, fontSize, label: 'header' | 'tab' | 'none' }`. Le canvas applique le résultat.

## Critères d'acceptation

- [ ] Vitest : `computeModes` ouvre un module dont la largeur à l'écran atteint 300 px même quand la police de son en-tête est sous 8 px. `levelScales` ne dépend plus de `minOpenScale`. Pour un module à l'échelle 0,25, le titre est en `tab` ; à 1, en `header` avec les tailles de la maquette.
- [ ] e2e sur la fixture `deep`, à trois zooms intermédiaires : le bas de chaque en-tête reste au-dessus de ses enfants (comme U10) ; chaque conteneur ouvert sans libellé d'en-tête a une étiquette `.tab` visible avec son nom, qui ne déborde pas de son conteneur.
- [ ] e2e : à l'échelle où U10 gardait les modules fermés, ils sont ouverts.
- [ ] `readable-zoom.e2e` migré (l'ouverture plus tôt change ses attentes) : migrations listées ici. Les autres tests restent verts.
- [ ] Captures avant et après sur le dépôt relief et acme-shop.

## Seams

1. **Logique TS** (Vitest) : `visibility.logic.ts`, `camera.logic.ts`, `header.logic.ts`. Rate le rendu.
2. **e2e WebdriverIO** sur `deep` (`// @fixture deep`) : ouverture, en-têtes non recouverts, étiquettes visibles et contenues.

## Baseline

`just test-summary` (2026-11-20) : cargo 578 passed, 0 failed ; web 562 passed, 0 failed.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/header-tab.logic.spec.ts` (nouveau, `headerLayout(kind, scale)` -> `{ height, fontSize, label }`, à exporter de `header.logic.ts`), `src/ui/src/app/modules/map/helpers/open-by-width.logic.spec.ts` (nouveau), `tests/e2e/tests/header-tab.e2e.ts` (nouveau, `// @fixture deep`). Le canvas doit poser un `.tab` (enfant direct du `map-node`, avec `title` = nom complet) quand `label === 'tab'`.
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/header-tab.logic.spec.ts --include src/app/modules/map/helpers/open-by-width.logic.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/header-tab.e2e.ts` (sous xvfb-run, app construite par `just build`)
- En échec : 7 tests
  - header-tab.logic.spec.ts (5 tests, fichier entier) — `headerLayout` n'est pas exporté de `header.logic.ts` (erreur de compilation)
  - open-by-width.logic.spec.ts, « opens a module 300 px wide on screen at 0.25 », « opens a module at 0.3 whatever its header », « opens a package 470 px wide on screen at 0.2 » — `computeModes` garde la condition `labelVisible` (renvoie `box`)
  - open-by-width.logic.spec.ts, « puts each level at the width threshold alone » — `levelScales` applique encore `minOpenScale` (0,32 au lieu de 0,0489)
  - header-tab.e2e.ts, « containers open on width alone and a tab names each one... » — aucune étiquette `.tab` rendue (`tabs` = 0)
  - header-tab.e2e.ts, « a module wide enough on screen is open, even when... » — aucun module ouvert avec un en-tête trop petit (`smallOpen` = 0)
  (le 5e test d'open-by-width, « keeps a module under 300 px closed », passe : garde-fou de non-régression.)
- Migrations : `open-header.logic.spec.ts` supprimé (ses attentes « fermé à 0,3 / 0,4 » contredisent U14 ; remplacé par `open-by-width.logic.spec.ts`). `readable-zoom.e2e.ts` : aucune attente à changer, les 2 tests passent toujours (un libellé remplacé par une étiquette n'est plus compté comme coupé). `header.logic.spec.ts` (`openHeader`, `labelVisible`) passe encore : au green de le retirer ou l'adapter si `openHeader`/`minOpenScale` disparaissent.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/header.logic.ts`, `visibility.logic.ts`, `camera.logic.ts`, `src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts` et `.scss`, `src/ui/angular.json`
- Changement : `computeModes` et `levelScales` n'ouvrent plus qu'à la largeur (condition `labelVisible` et `minOpenScale` retirés). `headerLayout(kind, scale)` -> `{ height, fontSize, label: 'header' | 'tab' | 'none' }` (tab sous 11 px) ; le canvas pose un `.tab` (enfant du `map-node`, `title` = nom complet, `has-tab` en `overflow: visible`) et vide le libellé de l'en-tête. `minOpenScale` supprimé ; `openHeader` gardé car `header.logic.spec.ts` le teste encore.
- Suite : cargo 578 passed / 0 failed (baseline 578/0) ; web 569 passed / 0 failed (baseline 562/0, +7 nouveaux tests) ; e2e `header-tab` 2/2 et `readable-zoom` 2/2 ; lint propre ; aucun fichier de test modifié.
- Questions ouvertes : budget `anyComponentStyle` d'`angular.json` relevé de 8 kB à 9 kB (le scss du canvas dépassait de 138 octets) ; à valider. `openHeader` / `labelVisible` ne servent plus qu'à `header.logic.spec.ts` et à `headerLayout` : à retirer en review si on adapte ce test. Captures avant/après non faites.

## Review

- Verdict : fix first
- Must fix : docs/user/src/content/docs/map.md:23 et docs/user/src/content/docs/en/map.md:23 — la page décrit encore un titre qui rétrécit puis disparaît ; il passe maintenant en étiquette sur la bordure sous 11 px — mettre à jour les deux langues (texte seul, pas de captures).
- Consider :
  - angular.json:26 — budget 8 à 9 kB : acceptable (le scss ajoute un vrai bloc `.tab`), mais le plafond est relevé au lieu de réduire ; garder 9 kB, ne pas le relever à nouveau sans scinder le scss du canvas.
  - header.logic.ts:7,36-40 — `labelVisible` n'est plus lu en production, seul `header.logic.spec.ts` le teste : le retirer de `OpenHeader`/`openHeader` et adapter ce spec (MIN_FONT à vérifier s'il reste utile).
  - header.logic.ts:44 — `HeaderLabel` déclare `'none'`, jamais produit (généralité spéculative) : le retirer ou le justifier.
  - visibility.logic.ts:35 — commentaire de doc recomposé sur une ligne trop longue après le retrait de la condition : le recouper.
  - Ticket : les captures avant/après restent à faire (hors alpha, voir mémoire du workflow).

## Answer

Les conteneurs s'ouvrent de nouveau sur leur seule largeur à l'écran (470 / 300 / 175 px) : `computeModes` ne teste plus `labelVisible`, `levelScales` n'a plus de `minOpenScale`. `headerLayout(kind, scale)` (`header.logic.ts`) rend `{ height, fontSize, label }` ; sous 11 px de police, le canvas pose une étiquette `.tab` à cheval sur la bordure haute (ellipse, `title` = nom complet) et vide le libellé de l'en-tête. Budget `anyComponentStyle` relevé de 8 à 9 kB pour le bloc `.tab`.

Vérifié : Vitest (10 nouveaux tests sur `open-by-width` et `header-tab`), suite web 569/0, cargo 578/0, e2e complète 108 passés / 1 ignoré / 0 échec (dont `header-tab.e2e` et `readable-zoom.e2e`), `just lint` propre. Capture à 1280 px sur `deep` relue : étiquettes `billing/`, `lib/` sur les bordures, aucun en-tête recouvert. La remarque bloquante de la review (doc `map` FR/EN) est corrigée, texte seul ; captures de doc et captures avant/après non refaites (phase alpha).

Restent en `Consider` : retirer `labelVisible`/`openHeader` (seulement lus par `header.logic.spec.ts`), la valeur `'none'` de `HeaderLabel` jamais produite.
