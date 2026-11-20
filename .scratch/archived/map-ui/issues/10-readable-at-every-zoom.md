# U10 Carte lisible à tous les niveaux de zoom

Status: resolved
Type: bug
Blocked by: U09
UI: oui
Doc: user-docs `map` (zoom sémantique, si le comportement visible change), captures

Spec: `../spec.md` ; référence visuelle : `docs/product/maquette/index.html`

## Constat

`relief .` sur le dépôt relief (capture de l'utilisateur, 2026-11-20), à un zoom intermédiaire :

- **En-têtes qui se chevauchent.** L'en-tête d'un conteneur ouvert recouvre celui de ses enfants (`src/` et `analysis/` superposés, `src/` et `app/` aussi). Le libellé d'un enfant passe sous le bord du parent.
- **Libellés coupés.** Une petite boîte fermée affiche un libellé coupé net, en haut comme en bas (« arc », « fou », « lan », « revi », « iss »). Une boîte de quelques pixels de haut garde un en-tête de 26 à 30 px.

**Cause.** La disposition (`layout.logic.ts`) réserve l'en-tête en unités du monde (`header` : fichier 30, module 36, système 50), mis à l'échelle par la caméra. L'en-tête CSS, lui, a une taille fixe en pixels écran (U09 : 38, 30 et 26 px, 15, 13 et 12 px de police). Sous une échelle d'environ 0,8, la place réservée à l'écran (36 × 0,5 = 18 px pour un module) est plus petite que l'en-tête dessiné : les enfants le recouvrent. Un conteneur s'ouvre sur sa seule largeur à l'écran (`OPEN_THRESHOLDS`), donc un module large s'ouvre à petite échelle. La maquette a le même défaut, que acme-shop ne montre presque pas : ses conteneurs sont peu profonds. Le dépôt relief a des dossiers imbriqués sur 4 ou 5 niveaux (`.scratch/archived/<feature>/issues/`).

## À faire

- **L'en-tête d'un conteneur ouvert tient dans la place que la disposition lui réserve** : hauteur = `header × échelle`, plafonnée à la taille de la maquette. La police suit la hauteur (par exemple 0,45 × la hauteur), bornée par la taille de la maquette. Sous une hauteur lisible (environ 10 px), le libellé est masqué. Aucun enfant ne recouvre plus l'en-tête de son parent.
- **Une boîte fermée trop petite pour son libellé n'en affiche pas** : pas de texte coupé. Seuils de départ : moins d'environ 14 px de haut ou de 28 px de large. Le nom reste accessible au survol (`title`) et par la recherche.
- **Logique pure** dans un helper `*.logic.ts` testé : la hauteur d'en-tête, la taille de police et la visibilité du libellé, en fonction du kind, de l'échelle et de la taille à l'écran. Le canvas applique le résultat.
- **acme-shop au niveau de la maquette** : aux niveaux 0 à 3, les en-têtes gardent les tailles de la maquette quand la place y est, et les captures ne régressent pas.

## Critères d'acceptation

- [ ] Vitest : pour une échelle de 0,5, l'en-tête d'un module ouvert fait 18 px, avec une police de 13 px au plus. À 0,2, son libellé est masqué. Une boîte fermée de 10 px de haut n'a pas de libellé. À 1, les tailles de la maquette (38, 30, 26 px).
- [ ] e2e, sur une fixture aux dossiers imbriqués sur au moins 4 niveaux (nouvelle, ou un dépôt construit par `relief-fixtures`) : à trois zooms intermédiaires, pour chaque nœud ouvert, le bas de son en-tête est au-dessus du haut de chacun de ses enfants. Aucun libellé visible ne déborde de sa boîte (`scrollWidth <= clientWidth`, `scrollHeight <= clientHeight` sur `.hd`).
- [ ] Les tests existants (`edge-labels.e2e`, en-têtes à 1280 px, `layout.e2e`, `diff-layer.e2e`) restent verts. Toute migration est listée ici.
- [ ] Captures avant et après sur un dépôt profond (le dépôt relief) et sur acme-shop, comparées à la maquette.

## Baseline

`develop` (d33108b, après U11) : cargo 578 passed ; web 532 passed ; e2e 99 passed, 1 skipped, 0 failed. Seul `quicknotes.md` non suivi (fichier de l'utilisateur).

## Seams

1. **Module de logique TS** (nouveau helper, par ex. `header.logic.ts`, Vitest) : pour un kind, une échelle et une taille à l'écran, la hauteur d'en-tête, la taille de police et la visibilité du libellé (conteneur ouvert, boîte fermée). Rate l'application au DOM.
2. **Fixture `deep`** (`tests/fixtures/deep/`, construite par `relief-fixtures` ; dossiers imbriqués sur au moins 4 niveaux, avec des dossiers larges et étroits mêlés, comme `.scratch/archived/<feature>/issues/`) et **e2e WebdriverIO** (`// @fixture deep`) : à trois zooms intermédiaires, pas de chevauchement entre l'en-tête d'un nœud ouvert et ses enfants, et aucun libellé visible qui déborde de sa boîte. Plus les tests existants d'en-têtes sur acme-shop. Rate le rendu fin, couvert par les captures.

UI : oui. Doc : `map` si le comportement visible change ; captures.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/header.logic.spec.ts` (importe `closedLabelVisible`, `openHeader` de `./header.logic`, à créer : `openHeader(kind, scale) -> { height, fontSize, labelVisible }`, `closedLabelVisible(width, height) -> boolean`) ; `tests/e2e/tests/readable-zoom.e2e.ts` ; fixture `tests/fixtures/deep/` (46 fichiers, dossiers sur 4 à 6 niveaux, un dossier large `invoices`).
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/map/helpers/header.logic.spec.ts` ; `just build` puis `cd tests/e2e && NO_COLOR=1 GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/readable-zoom.e2e.ts`
- En échec : tout le spec Vitest (11 tests) — le module `./header.logic` n'existe pas ; e2e « headers never overlap their children and no visible label overflows, at three zooms » — l'en-tête de `invoices` (et `src/lib/a/b`, …) recouvre ses enfants ; e2e « a closed box too small for its label shows none » — `pkg:deep::file:package.json` garde un libellé visible dans une boîte fermée trop petite.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/header.logic.ts` (nouveau), `src/ui/src/app/modules/map/components/map-canvas/map-canvas.component.ts`
- Changement : `openHeader(kind, scale)` (hauteur = `header` monde × échelle plafonnée à la maquette, police 0,5 × hauteur plafonnée, libellé masqué sous 10 px) et `closedLabelVisible(w, h)` (>= 28 × 14 px). Le canvas applique hauteur, police, `line-height: 1` et `margin-top: -1px` (bordure) en styles en ligne sur `.hd`, réduit la police des `.sub`/`.chips`/badges, n'écrit aucun libellé quand il est masqué (nom en `title` de la boîte). La clé de rendu inclut la hauteur d'en-tête et la visibilité. Aucun changement de scss.
- Suite : cargo 578 passés / 0 échoué ; web 542 / 0 (baseline 532) ; e2e 101 passés, 1 ignoré, 0 échoué (baseline 99). `just lint` échoue seulement sur `prettier --check` de `tests/e2e/tests/readable-zoom.e2e.ts` (fichier de test rouge, laissé intact).
- Questions ouvertes : le formatage prettier du fichier e2e rouge est à corriger par l'étape qui possède les tests.

## Answer

- **En-têtes à la taille de la place réservée.** `header.logic.ts` (pur, testé) :
  - `openHeader(kind, scale)` : hauteur = `header` monde × échelle, plafonnée à la maquette (38, 30, 26 px). Police = 0,5 × hauteur, plafonnée à la maquette. Libellé masqué dès que la police passerait sous `MIN_FONT` = 8 px, soit sous 16 px de haut.
  - `closedLabelVisible(w, h)` : une boîte fermée n'a de libellé qu'à partir de 28 × 14 px.
  - `headerStyle(open)` : les valeurs que le canvas pose (hauteur, police, `line-height`, marge de bordure, police des sous-éléments plafonnée à 11 px).
  - `minOpenScale(kind)` : l'échelle à partir de laquelle l'en-tête d'un kind est lisible.
- **Règle d'ouverture** (`computeModes`, `visibility.logic.ts`). Un conteneur ne s'ouvre que si son en-tête est lisible, en plus du seuil de largeur. Sinon il reste une boîte fermée, avec son nom et ses silhouettes. C'est ce qui rend la carte lisible : on n'a plus de bandes imbriquées sans nom. Les boutons de niveau (`levelScales`, `camera.logic.ts`) prennent `minOpenScale` comme plancher, pour que le niveau demandé ouvre vraiment ses conteneurs.
- **Canvas.**
  - Quand le libellé est masqué, l'en-tête est vidé (méta, sous-titres, chips, badges) mais garde sa hauteur.
  - Le nom passe dans le `title` de la boîte, visible au survol.
- **Fixture `deep`.** 46 fichiers TS, dossiers imbriqués sur 4 à 6 niveaux, dont `invoices/` (11 fichiers) et `.scratch/archived/<feature>/issues/`. Elle sert à l'e2e `readable-zoom.e2e.ts`.
- **Test existant migré.** `subgraph-budget.e2e.ts`, « zooming into a package loads its files ». Avec la nouvelle règle, `pkg-03` (fixture `wide`) ne s'ouvre qu'à l'échelle où son titre est lisible, où il mesure ~2 800 px de large. Ses 300 fichiers ne tiennent donc plus sur 1280 × 720, et les nœuds hors écran ne sont pas dessinés. Le test passe à une fenêtre de 3600 × 2000 et à un seul petit cran de molette (−40) au lieu de 25 crans de −120. L'assertion est inchangée : exactement 300 fichiers, au plus 2 000 nœuds, pas de chargement en cours.
- **Vérifié.**
  - cargo 578 passed ; web 550 passed (+18) ; e2e 101 passed (+2), 1 skipped, 0 failed ; lint propre ; budgets inchangés.
  - Captures de `deep` avant/après, à trois zooms, à 1280 × 800 et 2400 × 1300. Avant : en-têtes recouverts, bandes sans nom, libellés coupés. Après : chaque dossier visible porte son titre (`billing/`, `invoices/`, `payments/`, `lib/`, `b/`, `c/`), sans recouvrement.
  - Captures de la doc régénérées. acme-shop garde les tailles de la maquette ; les tests d'en-têtes à 1280 px sont verts.
- **Doc.** `map` (FR et EN) : le titre d'une boîte ouverte rétrécit avec elle, puis disparaît quand il deviendrait illisible ; une boîte trop petite n'affiche pas son nom ; le nom reste au survol.
- **Note.** Les boutons `+` et `−` zooment autour du centre de la carte, donc le bord gauche des grandes boîtes (où sont les titres) peut sortir de l'écran. C'est le comportement existant, hors ticket.
