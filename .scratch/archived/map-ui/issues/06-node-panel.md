# Panneau d'un nœud

Status: resolved
Type: task
Blocked by: U03
UI: oui
Doc: user-docs `map` (inspecter)

Spec: `../spec.md`

## À faire

- Panneau de droite pour la sélection : chemin, nom, type, visibilité, route éventuelle ; pour un conteneur, ses enfants ; « Utilise » et « Utilisé par » (liens fins, cliquables, type de lien).
- Code du fichier ou du symbole (`/api/code`), police à chasse fixe lisible (≥ 12,5 px), numéros de ligne, coloration syntaxique légère (Shiki ou équivalent, chargé à la demande).
- Aucun texte généré : seulement des faits du graphe (ADR 0005).

## Critères d'acceptation

- [x] Test de composant : un symbole avec 2 appelants et 1 dépendance affiche les deux listes (API mockée).
- [x] e2e : clic sur `computeTotal` → son code s'affiche et contient `export function computeTotal`.

## Baseline

`just test-summary` sur `develop` (1b8352b) : cargo 334 passed, 0 failed ; web 167 passed, 0 failed.

## Seams

1. **Module de logique `node-panel.logic.ts` (Vitest)** : à partir du `GraphSnapshot` et d'un id, les faits du panneau (chemin, nom, type, visibilité, route ; enfants d'un conteneur ; « Utilise » / « Utilisé par » avec le type de lien, dédoublonnés et triés) et le découpage du code en lignes numérotées (à partir de `span`/numéro de départ). Attrape les erreurs de dérivation ; rate le rendu et le chargement réseau.
2. **Entrées/sorties du composant du panneau (`TEST_PROVIDERS`, `ReliefApiService` mocké)** : un symbole avec 2 appelants et 1 dépendance affiche les deux listes, le code renvoyé par `/api/code` (mocké) s'affiche avec ses numéros de ligne, un clic sur un lien émet/sélectionne le nœud cible. Attrape le câblage composant → business → service ; rate la vraie route et la coloration réelle dans un navigateur.
3. **e2e Playwright** sur acme-shop : sélection de `computeTotal` → le panneau affiche son code, qui contient `export function computeTotal`. Attrape le parcours réel (route `/api/code`, blobs git) ; rate les cas limites de dérivation.

Hors seams : le calque de diff (R01) ; la route `/api/code` n'est pas modifiée (elle ignore `range` et ré-indexe à chaque requête, constat de C03), sauf si l'e2e montre que U06 en dépend.

## Red

- Fichiers de test : `web/src/app/modules/map/helpers/node-panel.logic.spec.ts`, `web/src/app/modules/map/components/node-panel/node-panel.component.spec.ts`, `e2e/tests/node-panel.spec.ts`
- Lancer : `cd web && npx ng test --watch=false --include src/app/modules/map/helpers/node-panel.logic.spec.ts` ; idem avec `src/app/modules/map/components/node-panel/node-panel.component.spec.ts` ; `npm --prefix e2e exec playwright test tests/node-panel.spec.ts`
- Contrat attendu (symboles importés) : `helpers/node-panel.logic.ts` exporte `nodePanelFacts(graph, id)` (null si inconnu ; `{ name, kind, subkind, visibility, path, children, uses, usedBy }`, liens `{ id, label, edgeKind }`) et `codeLines(text, startLine)` (`[{ number, text }]`) ; `components/node-panel/node-panel.component.ts` exporte `NodePanelComponent` (inputs `graph`, `nodeId`, output `selectNode`) ; `ReliefApiService.code(node, side): Promise<string>` ; test-ids `node-name`, `node-path`, `node-visibility`, `node-used-by`, `node-uses`, `node-link` (`data-node-id`), `node-code`, `code-line` (`data-line`). Pas de champ « route » dans le modèle actuel : non testé.
- En échec : 
  - `node-panel.logic.spec.ts` (10 tests ; enfants triés par `span.startLine`, puis libellé, sans span en dernier) — le module `./node-panel.logic` n'existe pas (TS2307, ne compile pas).
  - `node-panel.component.spec.ts` (4 tests : deux listes, nom/chemin/visibilité, code avec numéros 7-9 et appel `code(id, 'head')`, clic sur un lien émet la cible) — `./node-panel.component` n'existe pas.
  - `e2e/tests/node-panel.spec.ts` (1 test : recherche + Entrée sur `computeTotal` → `node-code` contient `export function computeTotal`) — pas de `node-code` dans le panneau. Dans cet environnement, `page.goto('/')` échoue (« invalid URL », même échec pour `navigation.spec.ts` existant : binaire/serveur e2e non construit) ; à relancer avec `just e2e` pour confirmer le rouge par assertion.

## Green

- Fichiers : `web/src/app/modules/map/helpers/node-panel.logic.ts`, `web/src/app/modules/map/business/node-panel.business.ts`, `web/src/app/modules/map/components/node-panel/node-panel.component.{ts,html,scss}`, `web/src/app/modules/map/components/map-page/map-page.component.{ts,html}`, `web/src/app/core/services/relief-api.service.ts`, `web/public/i18n/{en,fr}.json`, `web/package.json`, `web/package-lock.json`
- Changement : `NodePanelComponent` (composant → `NodePanelBusiness` → `ReliefApiService.code`) remplace l'id brut du panneau de droite : nom, type, visibilité, chemin, enfants, « Utilise » / « Utilisé par » (liens cliquables avec type de lien), code (`/api/code`, côté head) avec numéros de ligne en 13 px. Dérivations dans `node-panel.logic.ts`. Coloration : highlight.js 11.12.0 (cœur + langage TypeScript) chargé par `import()` au premier code affiché, code en clair si l'import échoue ; clé i18n `map.edges.selected` remplacée par `map.node.*` (EN + FR). Pas de champ route (ADR 0005). `/api/code` inchangé : le panneau n'a pas besoin de `range`, la ré-indexation à chaque requête reste le constat C03.
- Taille : bundle initial 718 kB → 720,86 kB (main, 736,03 kB initial total avec styles) ; chunks paresseux : core 20,84 kB + typescript 7,78 kB (≈ 10,4 kB transférés). L'avertissement de budget (500 kB) existait déjà.
- Suite : Vitest 180 passés, 0 échoué (baseline 167) ; cargo 334/0 ; e2e 44 passés, 0 échoué ; `just lint` propre ; aucun fichier de test modifié.
- Ordre des enfants : `span.startLine`, puis libellé, nœuds sans `span` en dernier (test corrigé par red, justifié par le niveau 4 = lecture du code). La doc utilisateur `map` (inspecter) est faite à l'étape 8.
- Mise à jour : enfants triés par `span.startLine` puis libellé, sans `span` en dernier (`node-panel.logic.ts`) ; Vitest 181/0, cargo 334/0, lint propre.

## Review

- Verdict : fix first
- Must fix :
  - `node-panel.component.scss` : il n'existe aucune règle `.hljs-*`. Les spans injectés par `[innerHTML]` échappent à l'encapsulation, donc la coloration est invisible et l'exigence « coloration syntaxique légère » n'est pas remplie. À corriger : règles `:host ::ng-deep .hljs-*` avec des variables `--relief-*`.
  - `user-docs/` : la page `map` (inspecter) n'est pas mise à jour en EN ni en FR. Elle sera traitée à l'étape 8.
- Consider :
  - « Utilise » et « Utilisé par » sont deux blocs dupliqués dans le template : un `ng-template` commun les réunirait.
  - `.path` à 11 px est petit pour un chemin. La règle ≥ 12,5 px ne vise que le code, qui est à 13 px.
  - `node-panel.business.ts:62` relit `facts()` après l'`await`. Mieux vaut prendre le chemin calculé avant.
  - Le tri des enfants avec `Infinity` gagnerait à passer par une petite aide.
  - `pathOf` reprend le chemin depuis le segment `file:` de l'id quand le chemin manque.
- Vérifié sans défaut : les couches ; l'i18n EN et FR ; ADR 0005 respecté, sans champ route ; highlight.js 11.12.0 épinglé, chargé en lazy, avec repli en clair ; U06 ne dépend pas du constat C03 (lecture côté head, sans range) ; `encodeURIComponent`.
- Review : règles `.hljs-*` (`:host ::ng-deep`) avec variables `--relief-syn-*` clair/sombre dans `styles.scss` ; chemin calculé avant l'`await` ; blocs Utilise / Utilisé par dans un `ng-template` commun. Vitest 181/0, cargo 334/0, lint propre.
- Re-vérification : ship (hljs avec `--relief-syn-*` clair/sombre, doc FR/EN, Consider appliqués).
- Ajout (clic sur la carte) : `e2e/tests/node-panel.spec.ts` (2e test, lancer depuis `e2e/` : `npx playwright test tests/node-panel.spec.ts`) rouge par assertion (un clic sur la boîte `renderInvoice` ne change pas `selected-node`) ; `web/src/app/modules/map/helpers/pointer.logic.spec.ts` (3 tests, `isClick(down, up)` : clic si déplacement ≤ ~2 px, glisser à 10 px) rouge : `./pointer.logic` n'existe pas.
- Clic carte : `pointer.logic.ts` (`isClick`), `MapBusiness.selectNode/deselectNode`, clic sans glisser dans `map-canvas` (boîte = sélection, vide = désélection, arêtes inchangées) ; les étiquettes d'arête glissent hors des boîtes (`edgeShape(a, b, avoid)`), sinon `covered` (pointer-events none) pour ne pas voler le clic. Vitest 184/0, cargo 334/0, e2e 45/0, lint propre.
- Ajout (étiquette d'arête) : 3 tests `edgeShape count label` dans `web/src/app/modules/map/helpers/edges.logic.spec.ts` (position par défaut (200 ; 48,8), glissement vers (136 ; 44,19) hors d'une boîte, `covered` si tout est couvert) : déjà verts, le code existe.

### Review (delta : clic sur la carte et étiquettes d'arête)

- Verdict : ship. Must fix : aucun.
- Consider :
  - La désélection par un clic dans le vide n'est pas testée (ni par un test business `selectNode`/`deselectNode`, ni en e2e), pas plus que le fait qu'un glisser ne sélectionne rien : seul `isClick` est testé.
  - Un clic sur `.map-current` désélectionne.
  - `edgeLines` se recalcule à chaque frame de pan, soit E × 7 × N : à surveiller sur un gros dépôt.
  - `LABEL_HALF_WIDTH`/`LABEL_HALF_HEIGHT` dupliquent la taille fixée dans le scss.
  - Ticket de suivi à prévoir : performance et placement des étiquettes (collisions entre étiquettes, conteneurs).
- Compromis `covered` (l'étiquette n'est plus cliquable, le trait l'est encore) : jugé acceptable pour U03. Il reste dans U06, car l'étiquette volait le clic sur la boîte.

## Answer

- Construit :
  - `NodePanelComponent` (composant → `NodePanelBusiness` → `ReliefApiService.code`) remplace l'id brut du panneau de droite. Il affiche nom, type et sous-type, visibilité, chemin, enfants (ordre du source, puis libellé, nœuds sans `span` à la fin), « Utilise » / « Utilisé par » (liens cliquables avec le type de lien) et le code du fichier ou du symbole, côté head, en 13 px avec numéros de ligne.
  - Coloration : highlight.js 11.12.0 (cœur + TypeScript, version exacte), chargé par `import()`, avec repli en clair. Couleurs `--relief-syn-*` en clair et en sombre.
  - Aucun texte généré, aucun champ route (le modèle n'en a pas).
- Ajouts hors du panneau :
  - Un clic sans glisser sur un nœud de la carte le sélectionne, un clic dans le vide désélectionne (`pointer.logic.ts`, comme la maquette).
  - L'étiquette de compte d'une arête glisse hors des boîtes de nœuds ; si aucune place n'est libre (`covered`), elle n'est plus cliquable, le trait l'est toujours.
- Bundle : `main` 718 → 722,55 kB. Chunks paresseux core 20,84 kB + typescript 7,78 kB.
- `/api/code` n'a pas changé : U06 lit `side=head` sans `range`. Le constat C03 (`range` ignoré, ré-indexation à chaque requête) reste ouvert.
- Vérifié :
  - Suites : cargo 334/0, web 187/0 (baseline 167), e2e 45/0, `just lint` et `just docs-build`.
  - Navigateur (relief-acme), EN puis FR, à 1280 puis 1024 px :
    - panneaux du symbole `SessionStore.refresh`, du fichier `session.ts` (lignes 1-27), du module `auth/` (sans code) et de `computeTotal` (`export function computeTotal`) ;
    - clic sur un nœud de la carte et sur un lien du panneau ;
    - étiquettes d'arête cliquables (161 sur 168, 7 couvertes) ;
    - coloration visible en clair et en sombre ;
    - pas de défilement horizontal à 1024 px ;
    - console sans erreur.
- Doc : `user-docs` `map`, section « Inspecter un nœud » / « Inspecting a node », en FR et EN, sans nouvelle capture.
- Suivis :
  - Les types de lien (`calls`…) ne sont pas traduits, comme dans U03.
  - Le titre du panneau d'arête de U03 reste en anglais après le passage en FR.
  - « Utilisé par » est vide pour un fichier ou un module : il n'y a pas d'agrégation.
  - Performance et placement des étiquettes d'arête.
  - Tests de désélection et du glisser.
  - La commande e2e d'un fichier dans `docs/rules.md` (`npm --prefix e2e exec`) échoue sans `baseURL` : il faut la lancer depuis `e2e/`.
