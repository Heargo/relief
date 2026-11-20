# Recherche, fil d'Ariane et raccourcis

Status: resolved
Type: task
Blocked by: U02
UI: oui
Doc: user-docs `map` (naviguer, raccourcis)

Spec: `../spec.md`

## À faire

- Recherche (`/` pour y aller) : symboles, fichiers, modules par nom et par route (`POST /checkout`), flèches + Entrée, Échap ; la sélection cadre le fichier du symbole.
- Fil d'Ariane du nœud sélectionné (clic = cadrer cet ancêtre) ; sans sélection, le niveau courant.
- Échap : désélectionner, puis remonter d'un niveau, puis tout voir.
- Fenêtre d'aide `?` avec tous les raccourcis (la liste vit dans `shortcuts.logic.ts`, source unique pour l'aide et le clavier).

## Critères d'acceptation

- [x] Vitest : classement des résultats de recherche pour des requêtes littérales (`refresh`, `/checkout`).
- [x] e2e : `/`, taper `refresh`, Entrée → `SessionStore.refresh` sélectionné et visible, fil d'Ariane `acme-shop › apps/api › auth/ › session.ts › SessionStore.refresh`.

## Baseline

`just test-summary` (develop, 0cada66) : cargo 329 passed, 0 failed ; web 127 passed, 0 failed.

## Seams

- **S1, logique pure (Vitest)** : `search.logic.ts` (classement des résultats symboles/fichiers/modules par nom et par route, ex. `refresh`, `/checkout`), `shortcuts.logic.ts` (liste unique des raccourcis, touche → action, cascade d'Échap : désélectionner → remonter d'un niveau → tout voir) et le calcul du fil d'Ariane (chemin d'ancêtres d'un nœud, niveau courant sans sélection). Attrape les règles exactes ; rate le câblage clavier et le rendu.
- **S2, `MapBusiness` (TestBed, `ReliefApiService` mocké)** : sélection d'un résultat (sélection + cadrage du fichier du symbole), signal du fil d'Ariane, clic sur un ancêtre (cadrage), Échap appliqué à l'état. Attrape l'état partagé ; rate le DOM et la garde clavier.
- **S3, e2e Playwright sur la fixture** : `/`, taper `refresh`, Entrée → `SessionStore.refresh` sélectionné et visible, fil d'Ariane `acme-shop › apps/api › auth/ › session.ts › SessionStore.refresh` ; clic sur un ancêtre ; Échap en cascade ; `?` ouvre l'aide ; flèches dans la liste ; les touches tapées dans le champ de recherche ne déclenchent pas les raccourcis de niveau (garde clavier, non couverte par U02). Attrape le parcours réel ; rate le détail du classement.

Validation : chaque comportement (recherche, fil d'Ariane, Échap, aide `?`) est atteint ; seams publics (fonctions exportées, business injecté, ce que voit l'utilisateur) ; seul `ReliefApiService` est mocké ; 3 seams.

## Red

- Fichiers de test : `web/src/app/modules/map/helpers/search.logic.spec.ts`, `web/src/app/modules/map/helpers/shortcuts.logic.spec.ts`, `web/src/app/modules/map/helpers/breadcrumb.logic.spec.ts`, `web/src/app/modules/map/business/map-navigation.business.spec.ts`, `e2e/tests/navigation.spec.ts`
- Lancer : `cd web && npx ng test --watch=false` (Vitest ; la compilation échoue tant que les symboles manquent) ; `just build && cd e2e && npx playwright test tests/navigation.spec.ts`
- Contrat d'API imposé aux tests (à créer) :
  - `search.logic.ts` : `buildSearchIndex(graph)`, `searchNodes(index, query)` → `{id, kind, label, path}[]`, max 8, insensible à la casse ; rang : nom exact (dernier segment après `.`) > préfixe > sous-chaîne ; `/checkout` met le fichier `checkout.ts` en tête.
  - `breadcrumb.logic.ts` : `breadcrumbTrail({graph, repoName, selectedId, level})` → `{kind:'root',label} | {kind:'node',id,label} | {kind:'level',level}` ; le nœud `repo` est remplacé par la racine.
  - `shortcuts.logic.ts` : `SHORTCUTS` (`{keys, descriptionKey: 'map.…'}`), `actionForKey`, `escapeStep({helpOpen, selectedNodeId, level})` → `close-help | deselect | level-up | fit-all`, `isTypingTarget({tagName, isContentEditable} | null)`.
  - `MapBusiness` : `search(q)`, `selectResult(id)`, `breadcrumbs()`, `selectCrumb(crumb)`, `escape()`, `helpOpen()`, `openHelp()`, `toggleHelp()`.
  - e2e : `data-testid` `search`, `search-results`, `search-result` (`aria-selected`), `breadcrumbs`, `breadcrumb`, `shortcuts-help`, `help-button`, `selected-node`.
- Non couvert : la recherche par route `POST /checkout` (le graphe n'expose aucune route ; seul le chemin `/checkout` est testé).
- En échec : 
  - search.logic.spec (7 tests) — module `./search.logic` absent
  - breadcrumb.logic.spec (4 tests) — module `./breadcrumb.logic` absent
  - shortcuts.logic.spec (9 tests) — module `./shortcuts.logic` absent
  - map-navigation.business.spec (10 tests) — `search`, `selectResult`, `breadcrumbs`, `selectCrumb`, `escape`, `helpOpen`, `openHelp`, `toggleHelp` absents de `MapBusiness`
  - e2e navigation.spec : 7 tests sur 8 en échec (champ de recherche désactivé, pas de fil d'Ariane, pas d'aide) ; le 8e (touche `2` hors recherche) est un témoin qui passe déjà

### Corrections de tests (justifiées)

- Correction d'un test U01 : `map-page.component.spec.ts` « has a search field that stays disabled » devient « has an active search field » (champ activé), car le ticket U05 rend la recherche active.
- Correction e2e : `navigation.spec.ts` attend désormais l'id `pkg:@acme/api/auth` pour le module `auth/` (format émis par D03) au lieu de `/mod:auth$/`. Le fil `acme-shop › apps/api › auth/` est inchangé. Les ids de symbole (`sym:SessionStore.refresh`) et les graphes synthétiques des specs Vitest ne dépendent pas de ce format.
- Défaut trouvé au navigateur : en FR, les résultats de recherche affichent le type brut (`file`, `symbol`). Test ajouté dans `map-page.component.spec.ts` (« names the type of each result in French », rouge : attend « symbole » / « fichier »), un témoin EN passe. Justification : i18n EN/FR du spec.
- Correction d'un défaut du test lui-même : « names the type of each result in French » est scindé en un test symbole et un test fichier (deux `configureTestingModule` dans un même test échouaient). Les attentes ne changent pas.

## Green

- Fichiers : `web/src/app/modules/map/helpers/{search,breadcrumb,shortcuts}.logic.ts` (nouveaux), `business/map.business.ts`, `components/map-page/*` (recherche, aide `?`, clavier), `components/map-canvas/*` (fil d'Ariane, clavier déplacé vers la page), `web/public/i18n/{en,fr}.json`
- Changement : recherche (classement nom exact > préfixe > sous-chaîne, chemin `/checkout`), fil d'Ariane, Échap en cascade, aide `?` alimentée par `SHORTCUTS` (source unique du clavier et de l'aide), garde clavier par `isTypingTarget`. `selectResult` cadre avec `dive(id, 9)` (le cadrage par défaut à 1.4 n'ouvre pas module/service dans un petit graphe). Aucune dépendance ajoutée.
- Suite : cargo 329/0 (= baseline) ; web 158 réussis, 1 échoué sur 159 ; e2e 40 réussis, 2 échoués (navigation).
- Questions ouvertes :
  - e2e `navigation.spec.ts` « / refresh Enter » et « clicking an ancestor » : le graphe réel d'acme-shop n'a aucun nœud `mod:` (fichier -> parent = service `pkg:@acme/api`), et le label du service est `@acme/api`, pas `apps/api`. Le fil réel est `acme-shop › @acme/api › session.ts › SessionStore.refresh`, le test attend `apps/api › auth/` et un nœud `mod:auth`. Il faut que le cœur émette des modules (dossiers) et un label de service basé sur le chemin, ou corriger le test. Décision requise.
  - `map-page.component.spec.ts` « has a search field that stays disabled » (U01) est périmé : le champ est maintenant actif. Test à mettre à jour par l'étape rouge/review.

### Mise à jour (après D03)

- `breadcrumb.logic.ts` et `search.logic.ts` passent `node.path` à `labelOf` (libellé de système `apps/api`).
- Suite : cargo 334/0, web 164/0, e2e 43/0, lint propre, `just build` ok. Plus de question ouverte.

### Mise à jour (i18n des types)

- Clés `map.kinds.*` (EN/FR) ; le type de chaque résultat de recherche est traduit dans `map-page.component.html`.
- Suite : cargo 334/0, web 165/1. L'échec est le test « names the type of each result in French » : il appelle `search()` (donc `TestBed.configureTestingModule`) deux fois dans le même test, ce qui lève « Cannot configure the test module when already instantiated » ; le test est faux, pas le code. `just build`/`e2e-summary` bloqués par `docs-build` (image manquante dans la doc en cours de mise à jour, hors de mon périmètre).

## Blocage (orchestrateur)

Le critère e2e (fil `acme-shop › apps/api › auth/ › session.ts › SessionStore.refresh`) suit le ticket et la maquette (`M('auth', …)` dans le service `apps/api`), donc le test n'est pas faux. Le cœur ne peut pas le satisfaire : `relief-detect/src/workspaces.rs` n'émet aucun nœud `Module` (dossier) dans un package de workspace (seul `generic.rs` le fait), et le service s'appelle `@acme/api`, pas `apps/api`. Le corriger demande un seam Rust en plus (4 seams) : hors périmètre.

Découpage proposé : un ticket cœur **D03** « Modules (dossiers) dans les packages d'un workspace, et label du service par son chemin » (seam : `relief-detect` sur la fixture acme-shop, snapshots `insta`), placé avant U05 ; puis reprendre U05 à l'étape 5 (le code green est en place, non commité). Levé par D03 (07b2449).

## Review

(rapport de tdd-review, recopié par l'orchestrateur)

- Verdict : fix first (doc seulement ; code conforme)
- Must fix :
  - `user-docs` `map.md` (FR et EN) : rien sur la recherche (`/`), le fil d'Ariane, la cascade d'Échap ni l'aide `?`. Ajouter une section « Naviguer » et la liste des raccourcis, et refaire la capture. Traité à l'étape 8.
- Consider :
  - `search.logic.ts` `pathOf` relit le chemin dans l'id alors que D03 fournit `Node.path` : il y a deux sources de vérité pour le chemin.
  - `shortcuts.logic.ts` `keyLabel` : un libellé de présentation (`Esc`) dans le module de logique. À déplacer si les libellés doivent être traduits.
  - `map-page.component.ts` `onKey` : le `switch` sur `action.type` est dans le composant. Un `MapBusiness.runShortcut(action)` le rendrait testable en S2.
  - Recherche par route `POST /checkout` : reportée, car le graphe n'expose aucune route. Il faut un ticket de suite (nœuds de route dans le cœur, puis index de recherche). Le manque est signalé dans la doc.
- Vérifié conforme : `SHORTCUTS` source unique (clavier `actionForKey` et aide), garde clavier `isTypingTarget`, aucun conflit avec U02 (le `HostListener` de niveau n'existe plus qu'à un seul endroit, la page), i18n EN/FR, thème, couches, corrections de test justifiées.

### Relecture des corrections

- Verdict final : **ship**. La ligne Must fix (doc) est résolue : les sections « Rechercher et se repérer » et « Raccourcis clavier » (FR/EN) sont fidèles à `shortcuts.logic.ts` et `search.logic.ts`, et les clés `map.kinds.*` sont utilisées. Il ne reste aucun Must fix.

## Answer

- **Construit** :
  - `search.logic.ts` : index et classement des résultats (nom exact, puis préfixe, puis sous-chaîne, au plus 8 résultats, recherche par chemin `/checkout`).
  - `breadcrumb.logic.ts` : le fil d'Ariane, avec `labelOf` et `Node.path`, ou le niveau courant quand rien n'est sélectionné.
  - `shortcuts.logic.ts` : `SHORTCUTS` est la source unique du clavier et de l'aide. S'y ajoutent la cascade d'Échap (fermer l'aide, désélectionner, remonter d'un niveau, tout voir) et la garde `isTypingTarget`.
  - `MapBusiness` : `search`, `selectResult` (cadre jusqu'au symbole), `breadcrumbs`, `selectCrumb`, `escape`, aide `?`.
  - Page : champ de recherche avec flèches, Entrée et Échap ; fenêtre d'aide ; touches `0` à `3` déplacées du canvas vers la page, pour un seul écouteur clavier.
  - i18n EN/FR, y compris le type de chaque résultat (`map.kinds.*`).
- **Décisions** :
  - Le ticket a été bloqué, puis repris après D03 (07b2449), qui ajoute les modules de dossier et le libellé des systèmes par leur chemin.
  - La recherche par route `POST /checkout` est reportée, faute de routes dans le graphe ; la doc le signale.
  - `+` et `−` restent des boutons, pas des touches.
- **Vérifié** :
  - Suites : cargo 334/0, web 167/0, e2e 43/0, `just lint` propre, `just docs-build` OK.
  - Navigateur (relief-acme), en EN et en FR, à 1280 et 1024 px :
    - `/`, `refresh`, Entrée sélectionne `SessionStore.refresh` et l'affiche, avec le fil `acme-shop › apps/api › auth/ › session.ts › SessionStore.refresh` ;
    - un clic sur `auth/` cadre le module ;
    - la cascade d'Échap va jusqu'au niveau 0 ; `?` ouvre et ferme l'aide ; les touches `0` à `3` marchent ; les flèches parcourent les résultats ; `/checkout` met `checkout.ts` en tête ;
    - aucune erreur dans la console.
  - À 1024 px, la carte ne fait que 294 px (défaut U01 connu) et le fil d'Ariane la dépasse.
- **Bundle initial** : 717,88 kB, contre 708 kB avant, sans dépendance ajoutée.
- **Doc** : `user-docs` `map.md` (FR et EN), nouvelle capture `map-search.png`.
- **Pistes laissées** :
  - le champ de recherche garde le texte après Entrée ;
  - le symbole sélectionné n'a pas de surbrillance sur la carte ;
  - les lignes Consider de la review.
