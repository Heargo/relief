# U23 Choix base / head : quelle est la référence ?

Status: resolved
Type: task
Blocked by: U19
UI: oui
Doc: user-docs `review` (choisir ce qu'on compare)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 : dans la barre du haut (U19), on ne voit pas quel côté est la référence de la comparaison, ni dans quel sens se lit le diff.

## Décision (2026-11-20)

Option A de `docs/product/maquette/v3.html` :

- Chaque sélecteur de `app-range-picker` porte son rôle au-dessus de la ref : « Référence · base » (gris) et « Changements · head » (couleur d'accent, souligné). i18n FR/EN.
- `···` devient une flèche (`···→` en mode `...`, `→` en mode `..`) ; le clic bascule toujours le mode ; l'infobulle dit lequel et ce qu'un clic fait.
- Sous la barre du haut, une ligne de lecture : « La carte montre ce que **develop** change par rapport à **main**, depuis leur ancêtre commun **4e1a9c2** » (`..` : « … par rapport à **main** tel quel (diff direct) » ; working tree : « … ce que vos modifications non commitées changent par rapport à **HEAD** (**a7c03f1**) »). Elle s'efface après 5 s ou au premier clic sur la carte, et revient au survol du contrôle.
- ⇄ reste, désactivé quand head est le working tree, avec une infobulle qui dit pourquoi.
- Côté cœur : `DiffResponse` gagne `base_resolved` (sha court de la base réellement comparée : merge-base en `...`, base telle quelle en `..`, `HEAD` pour le working tree). Contrat TS régénéré.
- Hors périmètre : l'infobulle détaillée au survol (bloc `tip` de la maquette), le cas « pas d'ancêtre commun ».

## À faire

- Maquette : `docs/product/maquette/v3.html` (option A recommandée, option B). En attente de validation.
- Proposer un design avant d'implémenter (maquette) : libellés explicites « Référence (base) » et « Changements (head) », sens de lecture (`base → head`), rappel de ce que devient la carte (« ce que head change par rapport à base »).
- Préciser le cas du working tree et du merge-base (`main...feature`) : quelle base est réellement utilisée.
- Un bouton pour inverser base et head, si la maquette le retient.

## Critères d'acceptation

- [x] Maquette validée (option A).
- [x] Cœur : sur une fixture avec branche divergente, `base_resolved` vaut le merge-base en `...`, la base en `..`, `HEAD` pour le working tree.
- [x] Vitest : la ligne de lecture est construite pour les trois cas (`...`, `..`, working tree).
- [x] e2e : les deux sélecteurs portent leur rôle ; la ligne de lecture nomme head, base et le sha ; l'inversion échange les deux refs.

## Baseline

`just test-summary` (2026-11-20, après U24, 8065227) : cargo 611 passed, 0 failed ; web 660 passed, 0 failed.

## Seams

- **Cas d'usage de `relief-app` sur une fixture** (diff d'une plage, `DiffResponse.base_resolved`) : attrape le sha de la base réellement comparée en `...`, `..` et working tree ; rate l'affichage.
- **`range.logic.ts`** (fonction pure exportée, Vitest) : attrape le texte de la ligne de lecture et le libellé de la flèche pour les trois cas ; rate le rendu et l'effacement temporisé.
- **e2e WebdriverIO sur acme-shop** : attrape les rôles visibles sur les deux sélecteurs, la ligne de lecture avec head, base et sha, et l'inversion par ⇄ ; rate les cas limites couverts par Vitest.

## Red

- Fichiers de test : `src/app/relief-app/tests/base_resolved.rs`, `src/ui/src/app/modules/review/helpers/range.logic.spec.ts` (ajout), `tests/e2e/tests/base-head-reference.e2e.ts`, `tests/e2e/tests/range-picker.e2e.ts` (texte de `range-mode` : `→` / `···→`)
- Lancer : `cargo test -p relief-app --test base_resolved` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/review/helpers/range.logic.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/base-head-reference.e2e.ts` (sous xvfb)
- En échec : 4 + 4 + 6 tests (+ 1 modifié)
  - base_resolved.rs (4, ne compile pas) — `DiffResponse.base_resolved` n'existe pas : `three_dots_resolve_to_the_merge_base`, `two_dots_resolve_to_the_base_as_is`, `the_acme_range_resolves_to_the_base_commit`, `the_working_tree_resolves_to_the_head_commit` (sha court de 7 caractères ; en working tree, sha de HEAD)
  - range.logic.spec.ts (4, ne compile pas) — `readingLine` et `rangeArrow` non exportés : trois cas de `readingLine` (clés `review.range.reading.mergeBase|direct|worktree` avec params), `rangeArrow`
  - base-head-reference.e2e.ts (6) — `range-role-base`/`range-role-head`/`range-reading` absents, flèche `···→`/`→` absente, infobulle de ⇄ sans la raison (working tree) : rôles des sélecteurs, ligne de lecture (`...`), ligne de lecture (`..`), swap (rôles), effacement de la ligne, ⇄ désactivé sur le working tree
  - range-picker.e2e.ts (modifié) — `the ... button switches to a direct diff (..) and back` attend maintenant `→` / `···→`

## Green

- Fichiers : `src/domain/relief-model/src/api.rs`, `src/app/relief-app/src/lib.rs`, `docs/contract/diff-response.schema.json`, `src/ui/src/app/core/models/contract.ts` (régénéré), `src/app/relief-app/tests/snapshots/{commit_diff__auth_commit_diff,python_diff__py_shop_diff}.snap`, `src/ui/src/app/modules/review/helpers/range.logic.ts`, `.../business/range-picker.business.ts`, `.../components/range-picker/range-picker.component.{ts,html,scss}`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `DiffResponse.base_resolved` (sha court de 7 car. du côté ancien réellement comparé, `#[serde(default)]`, donc `baseResolved?` en TS pour ne pas casser les fixtures des specs existantes). `readingLine` et `rangeArrow` dans `range.logic.ts`. `app-range-picker` : rôles au-dessus des deux sélecteurs, flèche, infobulle de ⇄ désactivé, ligne de lecture (5 s, effacée au clic hors du contrôle, réaffichée au survol). Clé i18n `review.range` (chaîne inutilisée) remplacée par l'objet `review.range.reading`.
- Suite : cargo 615 réussis / 0 échec (baseline 611, +4) ; web 664 / 0 (baseline 660, +4) ; e2e `base-head-reference` 6/6 et `range-picker` 8/8 ; lint propre.
- Questions ouvertes : les deux snapshots insta (champ `baseResolved` ajouté) ont été mis à jour, ils changent forcément. La ligne de lecture est en texte brut (pas de gras) pour éviter d'injecter des noms de refs en HTML.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - tests/e2e/tests/base-head-reference.e2e.ts:65 et :1 — `void browser;` et l'import `browser` ne servent qu'à faire taire le lint ; retirer l'import et la ligne.
  - src/app/relief-app/src/lib.rs:~1135 — `sides.old.to_string().chars().take(7).collect()` : sha court construit en ligne (obsession des primitives) ; un petit helper nommé `short_sha` dirait l'intention.
  - src/ui/.../range.logic.ts — `readingLine` code `'HEAD'` en dur pour le working tree, et la ligne `..` dit « the head » sans le nommer ; cohérent avec le ticket, mais à garder en tête si la base d'un working tree devient configurable.
  - Aucun test Vitest du business/composant pour l'effacement à 5 s ni le retour au survol (couvert seulement par l'e2e, dont le fondu) ; acceptable vu les seams convenus.
- Spec : les 3 critères cochables (cœur, Vitest, e2e) sont couverts et implémentés ; rien de hors périmètre. Contrat régénéré (schema + contract.ts cohérents, `baseResolved?` optionnel justifié), clés i18n présentes en FR et EN, aucun secret, aucun problème de chemin ou d'écriture dans le dépôt analysé.
- Doc : `docs/user` `review` à faire par l'orchestrateur (hors de cette review).

## Answer

- Cœur : `DiffResponse.base_resolved` (sha court, 7 caractères) du côté réellement comparé : merge-base en `...`, base telle quelle en `..`, `HEAD` pour le working tree. `#[serde(default)]`, donc `baseResolved?` côté TS ; contrat régénéré, deux snapshots insta mis à jour.
- UI : `app-range-picker` affiche « Référence · base » et « Changements · head » au-dessus des sélecteurs, la flèche `···→` / `→` (clic : bascule de mode, infobulle explicite), l'infobulle de ⇄ désactivé sur le working tree, et la ligne de lecture (`readingLine`, `rangeArrow` dans `range.logic.ts`). La ligne s'efface après 5 s ou au clic hors du contrôle, revient au survol ; la sortie du survol relance le délai.
- Écart avec la maquette : la ligne de lecture est dans la barre du haut, après le compteur de commits, tronquée par une ellipse, et non sous la barre : en position absolue elle recouvrait les panneaux et cassait trois e2e (impact, layout, shell). Texte brut, sans gras, pour ne pas injecter de noms de refs en HTML.
- Doc utilisateur `review` (FR et EN) mise à jour ; `just docs-build` passe.
- Vérifié : cargo 615 / 0, web 664 / 0 (baseline 611 / 660), `just lint` propre, `just e2e-summary` 137 passés, 1 ignoré, 0 échec. Review : ship.
- `Consider` non appliqués : import `browser` inutile dans `base-head-reference.e2e.ts`, helper `short_sha`, la ligne `..` dit « head » sans le nommer, pas de test TestBed de l'effacement à 5 s (couvert par e2e). Captures non relues (le spec n'en produit pas).
