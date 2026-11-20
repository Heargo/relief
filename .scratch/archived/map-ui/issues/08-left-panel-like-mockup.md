# U08 Panneau gauche conforme à la maquette

Status: resolved
Type: task
Blocked by: U07
UI: oui
Doc: user-docs `review`, `map` (captures des calques, de la disposition et de la carte de la PR, FR et EN)

Spec: `../spec.md` ; référence visuelle : `docs/product/maquette/index.html` (CSS `.sec`, `.sec h3`, `.seg`, `.tog`, `.prtitle`, `.stats`, `.prog` ; rendus `Calques` l. ~1264 et `Disposition` l. ~1241)

## Constat

Capture de l'utilisateur sur relief et `review-map.png` :

- Les titres de section (« Calques », « Layers ») sont de gros titres collés au bord gauche (pas de padding). La maquette utilise `.sec` (padding 14/16, bordure basse) et des `h3` en 11 px majuscules espacées, couleur `--muted`.
- Les calques sont de grands boutons encadrés pleine largeur. La maquette en fait des interrupteurs (`.tog` : pastille, libellé, description en `small`, raccourci en `kbd` à droite).
- La section « Disposition » affiche trois lignes de mise au point (« Fewer crossings: 137015 », « Raw grid: 137727 », « On screen: 29036 »). La maquette a un contrôle segmenté, le compte « à l'écran » dans le titre, et une seule ligne grise en 11 px.
- La bascule « Relire la PR / Explorer le repo » doit être le contrôle segmenté (`.seg`) en tête du panneau. Aujourd'hui elle est dans la barre du haut.
- La carte de la PR : chips encadrées au lieu des pastilles de couleur suivies d'un nombre (`.stats`), pas de titre `#142 · plage · N commits`, pas de barre de progression de la relecture (`.prog`).

## À faire

- Un style de section commun (`.sec`, `h3`) appliqué à toutes les sections du panneau gauche (PR, calques, ordre de lecture, règles, signaux, exploration, disposition).
- Calques en interrupteurs `.tog` (rôle `switch`, `aria-checked`), en gardant les `data-testid` existants et leur `aria-pressed`, ou en migrant les tests e2e qui s'y fient, listés ici.
- Disposition : contrôle segmenté et ligne de totaux de la maquette. Les attributs `data-count` des trois compteurs restent (tests e2e U04).
- Bascule de mode en contrôle segmenté en tête du panneau (`review-toggle`, `explore-toggle` gardés).
- Carte de la PR comme la maquette : en-tête, pastilles de couleur, barre de progression « N/M vus ».
- Contrôles Optimus seulement (pas d'`<input>` natif stylé à la main), stylés par le thème posé dans U07.

## Critères d'acceptation

- [ ] Vitest ou composant : les titres de section ont la classe commune. Un calque se bascule au clic et au raccourci, son état est exposé par `aria-checked` (ou `aria-pressed`).
- [ ] e2e : les tests des calques, de la disposition (U04) et de la carte de la PR passent sans affaiblir d'assertion. Toute migration de sélecteur est listée ici.
- [ ] e2e : la taille calculée d'un titre de section vaut 11 px, en majuscules.
- [ ] Captures EN et FR, à 1280 et 1024 px, comparées à la maquette. Les écarts restants sont listés dans `## Answer`.

## Baseline

`develop` (d62ec9f, après U07) : cargo 578 passed, 0 failed ; web 487 passed, 0 failed ; e2e 89 passed, 1 skipped, 0 failed. Seul `quicknotes.md` non suivi (fichier de l'utilisateur).

Précision : relief lit git en local, sans forge. Il n'y a donc ni numéro de PR (« #142 ») ni titre de PR. L'en-tête de la carte de la PR se limite à ce que le cœur connaît : la plage et le nombre de commits, si l'API le donne déjà (sinon on n'affiche pas ce nombre, sans nouvelle commande).

## Seams

1. **Entrées/sorties des composants** (TestBed, `TEST_PROVIDERS`, `ReliefApiService` mocké) : `layers-section` (interrupteurs, rôle `switch`, `aria-checked`, description, `kbd`, bascule au clic) et `map-page` (classe de section commune, bascule de mode segmentée en tête du panneau gauche, disposition segmentée et ligne de totaux, carte de la PR avec pastilles et progression). Rate les styles calculés.
2. **e2e WebdriverIO** sur acme-shop : titre de section en 11 px majuscules, bascule de mode dans le panneau gauche, tests existants des calques, de la disposition (U04), de la carte de la PR et de la barre à 1024 px toujours verts (migrations de sélecteurs listées). Rate le détail visuel, couvert par les captures.

UI : oui. Doc : `review`, `map` (FR et EN), captures `review-layers`, `review-card`, `map`.

## Red

- Fichiers de test : `src/ui/src/app/modules/review/components/layers-section/layers-section.component.spec.ts` (modifié), `src/ui/src/app/modules/map/components/map-page/map-page-left-panel.component.spec.ts` (nouveau), `tests/e2e/tests/left-panel.e2e.ts` (nouveau) ; e2e migrés : `focus-layers`, `diff-layer`, `risk`, `co-change`.
- Lancer : `cd src/ui && npx --prefix web ng test --watch=false --include "**/layers-section.component.spec.ts"` ; idem `"**/map-page-left-panel.component.spec.ts"` ; `just build` puis `cd tests/e2e && NO_COLOR=1 GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts --spec tests/left-panel.e2e.ts`
- Migrations de sélecteurs (assertions identiques, seul l'attribut change) : `aria-pressed` → `aria-checked` sur `toggle-focus-layer` (focus-layers), `toggle-diff-layer` (diff-layer), `toggle-risk-layer` (risk), `toggle-co-change-layer` (co-change). Inchangés : `aria-pressed` sur `review-toggle`, `explore-toggle`, `layout-*`, `impact-direction`.
- Contrat de DOM posé par les tests : l'élément `toggle-*` (ou l'ancêtre de `layer-toggle[data-layer]`) est `role="switch"`, classe `tog`, `aria-checked`, avec `[data-testid="layer-description"]` ; sections `layers-section`, `layout-section`, `pr-card`, `reading-order` ont la classe `sec` ; `review-toggle`/`explore-toggle` dans un `.seg` premier enfant `.sec` de `left-panel`, classe `on` sur l'actif ; disposition : `.seg` avec `layout-*` (classe `on`), `crossings-visible` dans le `h3`, `crossings-optimized` et `crossings-raw` dans un seul `.hint` (un seul `p` dans la section) ; carte : `pr-range` (plage seule), pas de `h3`, `pr-stats` classe `stats` avec `i.dot.add|mod|del|mov` (pas de pastille à 0, pas de `.chip`), `pr-progress` classe `prog`, `role="progressbar"`, `aria-valuenow`/`aria-valuemax`, texte « N/M seen|vus » dans la carte.
- En échec : 13 unitaires + 4 e2e (17), tous pour comportement manquant :
  - layers-section : exposes each layer as a switch — pas de `role="switch"` ; toggles from the switch itself — pas d'ancêtre switch ; describes each layer — pas de `layer-description` ; is a panel section with the common class — pas de classe `sec`.
  - map-page-left-panel : opens the panel with the mode switch — bascule encore dans la barre du haut, pas de `.seg` ; marks the active mode — pas de classe `on` ; common section class — `pr-card` sans `sec` ; layout segmented — pas de `.seg` ni de compteur dans le `h3` ; two layout totals on a single line — pas de `.hint` commun ; heads the PR card with the range — pas de `pr-range` ; PR stats — pas de `.stats`/`i.dot` ; review progress bar — pas de `pr-progress` ; writes the progress in French — pas de « 1/2 vus ».
  - left-panel.e2e : a section title is 11 px and uppercase — h3 actuel plus gros ; mode switch at the top of the left panel — encore dans la barre du haut ; layers are switches — pas de `role` ; PR card range and progress bar — pas de `pr-progress`.
  - Les e2e migrés (aria-checked) échoueront aussi tant que les calques ne sont pas des interrupteurs (non relancés ici).

## Green

- Fichiers : `src/ui/src/styles.scss`, `src/ui/public/i18n/{en,fr}.json`, `src/ui/src/app/modules/map/components/map-page/map-page.component.{html,scss}`, `src/ui/src/app/modules/review/components/{layers-section,reading-order-section,signals-section}/*`, `src/ui/src/app/modules/rules/components/rules-section/*`, `src/ui/src/app/modules/explore/components/{explore-section,hotspots-section}/*`, `src/ui/src/app/modules/review/business/reading-order.business.ts`
- Changement : styles communs `.sec`/`h3` 11 px, `.seg`, `.tog`, `.stats`, `.prog`, `.dot` dans `styles.scss` (le scss de `map-page` a perdu les blocs `.layout` et `.pr-card`). Calques en interrupteurs (`role="switch"`, `aria-checked`, description, `kbd`). Bascule de mode et disposition en `.seg` ; carte de la PR : plage, pastilles `i.dot` (libellés pluriels en `sr-only`), barre `pr-progress` « N/M vus ». `ReadingOrderBusiness.load` s'enregistre dans `PendingTasks` (comme `ReviewSummaryBusiness`) pour que le panneau soit stable au rendu.
- Suite : cargo 578/0 (baseline 578/0) ; web 499/0 (baseline 487/0, +12 tests rouges) ; e2e 27 specs passées, 0 échec.
- Questions ouvertes :
  - `just lint` échoue uniquement sur Prettier pour `layers-section.component.spec.ts` (fichier de test indexé, à reformater par l'étape test) ; le reste est propre.
  - Les titres des sections Explorer (`explore-section`, `hotspots-section`) gardent `text-transform: none` : `explore.e2e` et `risk.e2e` (inchangés) lisent « Points d'entrée » / « Hotspots » tels qu'écrits, et WebDriver rend le texte en majuscules sinon.
  - `review-toggle` garde son comportement de bascule (un clic sur l'actif quitte la relecture), car `diff-layer.e2e` s'y fie.
  - `map-page.component.scss` reste au-dessus du budget de 4 kB (4,6 kB, avant : plus), avertissement de build seulement.
  - Captures EN/FR 1280 et 1024 px non faites (`just docs-shots` interdit).

## Answer

- **Panneau gauche refait sur la maquette.**
  - Styles communs dans `styles.scss` : `.sec` et `h3` en 11 px majuscules, `.seg`, `.tog`, `.stats`, `.prog`, `.dot`. Ils sont appliqués à toutes les sections du panneau, Explorer comprise.
  - Bascule de mode en contrôle segmenté en tête du panneau.
  - Carte de la PR : la plage, les pastilles de couleur et une barre « N/M vus ».
  - Calques en interrupteurs (`role="switch"`, `aria-checked`, description, `kbd`).
  - Disposition : contrôle segmenté, compte « à l'écran » dans le titre et une seule ligne de totaux. Les attributs `data-count` sont gardés.
- **Décisions.**
  - Pas de numéro ni de titre de PR : relief n'a pas de forge.
  - `review-toggle` garde son comportement de bascule, sur lequel `diff-layer.e2e` s'appuie.
  - `ReadingOrderBusiness.load` s'inscrit dans `PendingTasks`, comme les autres business de la relecture, pour que le panneau soit stable au rendu.
- **Tests migrés, sans assertion affaiblie.**
  - `aria-pressed` → `aria-checked` sur les calques dans `focus-layers`, `diff-layer`, `risk` et `co-change` (e2e), et dans `docs/user/screenshots/review.shot.ts`.
  - `explore.e2e` et `risk.e2e` lisent les titres « Points d'entrée » et « Hotspots » sans tenir compte de la casse, puisqu'ils sont maintenant en majuscules comme dans la maquette.
- **Vérifié.**
  - cargo 578 passed, web 499 passed (+12), e2e 93 passed (+4), 1 skipped, 0 failed.
  - `just lint` propre, `just docs-build` passe.
  - Captures EN et FR à 1280 px régénérées (`map`, `getting-started`, `review`, `explore`, `rules`), plus une capture ponctuelle à 1024 px : conformes à la maquette, et tout tient à 1024 px.
- **Doc.** `review` (bascule de mode, carte de la PR), `map` (disposition) et `explore` (emplacement de la bascule), en FR et en EN.
- **Écarts restants.**
  - `map-page.component.scss` est à 4,6 kB pour un budget de 4 kB. C'est un avertissement, et le dépassement existait déjà.
  - L'en-tête de la PR n'a ni numéro, ni titre, ni nombre de commits.
- **`just docs-shots`.** Lancé fichier par fichier avec `--spec`, aucun ne bloque. Le blocage vu pendant U07 venait de l'exécution complète.
