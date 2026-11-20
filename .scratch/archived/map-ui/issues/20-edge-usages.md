# U20 Inspecteur d'arête : les utilisations dans le code

Status: resolved
Type: task
Blocked by: U17
UI: oui
Doc: user-docs `map` (panneau d'une arête), captures

Spec: `../spec.md` (« Retours du 2026-11-20 ») ; référence visuelle : `docs/product/maquette/v2.html`, sujet 3, clic sur une arête

## Constat

Une arête dit « A importe B », pas où ni comment A se sert de ce qu'il importe. L'utilisateur veut, au clic sur une arête, la liste des utilisations des symboles importés dans le code.

## À faire

**Cœur** (calcul à la demande, rien de neuf dans le snapshot ni à l'indexation)
- `relief-adapter-api` : une capacité optionnelle d'adapter, `usages(path, bytes, bindings) -> Vec<Usage { binding, line, column, snippet, enclosing? }>` : les références, dans le fichier, aux liaisons importées données (nom local, alias compris). Un adapter qui ne l'implémente pas renvoie « non pris en charge ».
- `relief-lang-ts` l'implémente (tree-sitter : identifiants qui résolvent vers la liaison d'import, hors déclaration d'import et hors ombrage local). Python : hors périmètre, « non pris en charge ».
- `relief-app` : `Session::edge_usages(side, from, to)` : retrouve les arêtes fines sous l'arête (agrégée ou non), lit le blob du fichier source du côté demandé (head, ou base pour une arête supprimée), déduit les liaisons importées vers `to`, appelle l'adapter. Plafond (200 utilisations) avec le total. Commande Tauri `edge_usages`, contrat généré.

**UI**
- Dans l'inspecteur d'arête (U17), section « Utilisations dans `<fichier>` » : groupées par symbole importé (nom, nombre), chaque ligne avec numéro de ligne, la ligne de code et le symbole surligné, la fonction englobante. Un clic ouvre le code à cette ligne (panneau du nœud ou du diff). Arête agrégée : groupées d'abord par fichier source.
- États : chargement, aucune utilisation (import seul), « non pris en charge pour ce langage », plafond atteint (« et N de plus »).
- Arête `http` : la ligne de l'appel client si l'adapter la connaît, sinon la section n'apparaît pas.

## Critères d'acceptation

- [ ] cargo (`relief-lang-ts`) : alias, appel, type, réexport, liaison ombrée par une variable locale (exclue), import non utilisé (zéro).
- [ ] cargo (`relief-app`) : `edge_usages` sur acme-shop pour une arête fichier → fichier et une arête agrégée module → module ; plafond.
- [ ] Composant (TestBed) : groupes, surlignage, états vides et non pris en charge.
- [ ] e2e : clic sur une arête d'acme-shop, les utilisations s'affichent ; un clic ouvre le code à la bonne ligne.
- [ ] Captures EN et FR.

## Seams

1. **Adapter TS** (cargo, sur des octets) : `usages`.
2. **relief-app** (cargo, fixture acme-shop) : `Session::edge_usages`.
3. **Composant** (TestBed) et **e2e**.

## Baseline

Après U19 (2026-11-20) : cargo 586/0 ; web 630/0 ; e2e 128 passed, 1 skipped, 0 failed.

## Red

- Fichiers de test : `src/analysis/relief-adapter-api/tests/usages.rs`, `src/analysis/lang/relief-lang-ts/tests/usages.rs`, `src/app/relief-app/tests/edge_usages.rs`, `src/ui/src/app/modules/map/components/map-page/map-page-edge-usages.component.spec.ts`, `tests/e2e/tests/edge-usages.e2e.ts`
- Tests existants à migrer : aucun (nouveaux fichiers ; seuls les mocks `api` des specs de `map-page` n'ont pas besoin de `edgeUsages` tant que le panneau d'arête ne l'appelle pas sans erreur : green doit tolérer un `edgeUsages` absent/rejeté dans les specs existantes, ou y ajouter le mock)
- Lancer :
  - `cargo test -p relief-adapter-api --test usages`
  - `cargo test -p relief-lang-ts --test usages`
  - `cargo test -p relief-app --test edge_usages`
  - `cd src/ui && npx ng test --watch=false --include src/app/modules/map/components/map-page/map-page-edge-usages.component.spec.ts`
  - `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/edge-usages.e2e.ts`
- Contrat posé (à implémenter) : `LanguageAdapter::usages(path, bytes, bindings: &[String]) -> Option<Vec<Usage>>` (None = non pris en charge, défaut) ; `Usage { binding (nom exporté), line (1-based), column (0-based, dans snippet), snippet (ligne sans terminateur), enclosing: Option<String> }` dans `relief-adapter-api` ; `Session::edge_usages(&EdgeUsagesRequest { range, side, from, to }) -> EdgeUsagesResponse { supported, total, files: Vec<FileUsages { file, usages }> }`, constante `EDGE_USAGES_CAP = 200`, exportés par `relief_app` ; UI : `ReliefApiService.edgeUsages(from, to, side, range?)`, types `EdgeUsagesResponse` dans `contract.ts`, data-testid listés en tête de la spec composant et de l'e2e (`data-focused="true"` sur `code-line`).
- En échec : 29 tests (tous rouges pour symbole/route manquant)
  - `usages.rs` (adapter-api) : an_adapter_without_usages_answers_not_supported — `LanguageAdapter::usages` n'existe pas (ne compile pas)
  - `usages.rs` (lang-ts), 11 tests : `Usage` et `TsAdapter::usages` n'existent pas (ne compile pas)
  - `edge_usages.rs` (relief-app), 5 tests : `EdgeUsagesRequest`/`EdgeUsagesResponse`/`EDGE_USAGES_CAP`/`Session::edge_usages` n'existent pas (ne compile pas)
  - `map-page-edge-usages.component.spec.ts`, 11 tests : `EdgeUsagesResponse` absent de `contract.ts` (ne compile pas) ; une fois le type ajouté, le panneau d'arête n'a ni section ni appel `edgeUsages`
  - `edge-usages.e2e.ts`, 1 test : le panneau de l'arête api → db ne liste aucune `usage-row` (vérifié en lançant l'e2e sur le binaire actuel)

## Green

- Fichiers : `src/domain/relief-model/src/{api,lib,contract}.rs`, `src/domain/relief-model/src/bin/write-contract.rs`, `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/lang/relief-lang-ts/src/{lib,usages}.rs`, `src/app/relief-app/src/{lib,range}.rs`, `src/interfaces/relief-desktop/{src/lib.rs,build.rs,capabilities/main.json,permissions/autogenerated/edge_usages.toml}`, `src/ui/scripts/generate-contract.mjs`, `src/ui/src/app/core/{models/contract.ts,services/relief-api.service.ts}`, `src/ui/src/app/modules/map/{business/edge-usages.business.ts,helpers/edge-usages.logic.ts,components/edge-usages/*,components/map-page/*,components/node-panel/*}`, `src/ui/public/i18n/{en,fr}.json`, `docs/contract/edge-usages-response.schema.json`
- Changement : `Usage`/`EdgeUsagesResponse` dans relief-model (contrat généré) ; `LanguageAdapter::usages` (défaut `None`) implémenté par TS (identifiants résolus vers l'import, ombrage par paramètre/variable/fonction/classe, `Class.method` englobant) ; `Session::edge_usages` (arêtes `imports` sous l'arête, blob du côté demandé, plafond 200 avec total) et commande Tauri `edge_usages` (permission ajoutée). UI : section `app-edge-usages` dans l'inspecteur d'arête (chargement, vide, non pris en charge, « et N de plus »), clic = ouvre le fichier avec `code-line` marquée `data-focused`. Tolérant à un `edgeUsages` absent ou rejeté (section masquée).
- Suite : cargo 603/0 ; web 641/0 ; e2e 128 passed, 1 skipped, 1 failed (le nouveau `edge-usages.e2e.ts`, voir ci-dessous) ; lint propre.
- Questions ouvertes : `edge-usages.e2e.ts` est faux sur un point : `[data-testid="usage-row"][data-line="10"]` est ambigu sur l'arête api → db, car `apps/api/auth/session.ts` (ligne 10 : `findUser(email)`) précède `routes/invoices.ts` dans l'ordre par chemin imposé par le contrat du cœur ; le premier `usage-row` de ligne 10 est donc celui de `session.ts`. Avec le sélecteur restreint à `[data-file-id*="routes/invoices.ts"]` (copie temporaire, supprimée), tout le parcours passe (clic, `selected-node`, ligne focalisée unique). À corriger côté test (red). Aussi : `src/interfaces/relief-desktop/Cargo.toml` modifié par une autre session, non touché.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `src/app/relief-app/src/lib.rs:~855` (`edge_usages`) : la liaison est déduite de `edge.to.symbol_key()` ; or `refs::bindings` rend `default` et `*` pour les imports par défaut et espace de noms. Ces imports ne trouvent donc rien et l'UI affiche « Importé mais jamais utilisé », ce qui est faux. Soit les traiter, soit ne pas affirmer « jamais utilisé » (état distinct).
  - `src/app/relief-app/src/lib.rs:~870` : `supported = wanted.is_empty()` rend `supported: true`, `total: 0` quand aucune arête `imports` ne sous-tend l'arête demandée ; la garde `hasCodeUsages` côté UI compense, mais la réponse du cœur ment (arête http : le ticket veut « section absente »). Les 3 `list_tree` complets par appel sont aussi à surveiller sur gros dépôts.
  - `src/analysis/lang/relief-lang-ts/src/usages.rs:133` (`is_shadowed`) : ombrage correct pour paramètres, const/let, fonctions, classes, catch, for-of. Angles morts : paramètres de type génériques (`<T>`), `var` hissé depuis un bloc imbriqué, une valeur locale qui masque un type de même nom. Faux négatifs rares ; à noter si besoin.
  - `src/ui/.../map-page.component.ts` (`usageFocus`) : remis à zéro seulement par `clearSelection`, pas au changement d'arête ; une ligne marquée peut réapparaître en rouvrant le même fichier.
  - Lecture de blob : côté base/head via `sides` puis `list_tree` + `read_blob`, même motif que `code`, justesse OK ; chemin issu du graphe, rien de forgé.

## Answer

Le calcul se fait à la demande : rien ne change dans le snapshot ni dans l'indexation. `LanguageAdapter::usages(path, bytes, bindings)` renvoie `None` par défaut (non pris en charge). L'adapter TS l'implémente avec tree-sitter : les identifiants qui résolvent vers l'import, alias compris, hors déclaration d'import, hors ombrage par paramètre, variable, fonction ou classe, avec la fonction englobante (`Class.method`). `Session::edge_usages` prend les arêtes `imports` sous l'arête demandée, agrégée ou non. Il lit le blob côté head, ou côté base pour une arête supprimée, appelle l'adapter, trie par chemin puis ligne et plafonne à 200 avec le total. Commande Tauri `edge_usages`, contrat régénéré (`Usage`, `FileUsages`, `EdgeUsagesResponse`). Dans l'UI, `app-edge-usages` est branché dans l'inspecteur d'arête : groupes par fichier puis par symbole avec compteur, ligne de code avec le symbole surligné, fonction englobante. Un clic ouvre le code à la ligne. La section gère les états chargement, vide, non pris en charge et « et N de plus ».

Vérifié : cargo 603/0, web 641/0, e2e complète 129 passés / 1 ignoré / 0 échec, `just lint` propre, review `ship`. Après green, le sélecteur `usage-row` de `edge-usages.e2e.ts` a été restreint à `routes/invoices.ts` : `session.ts` a aussi une ligne 10. Capture EN relue à 1280 px sur l'arête apps/api → packages/db. Doc `map` (FR/EN) en texte seul, captures de doc non refaites (phase alpha).

Restent en `Consider` :
- les imports par défaut et `* as` ne trouvent aucune utilisation, et l'UI affiche à tort « importé mais jamais utilisé » ;
- `supported: true, total: 0` sans arête `imports` sous-jacente ;
- angles morts de l'ombrage : génériques, `var` hissé, type masqué ;
- `usageFocus` n'est pas remis à zéro au changement d'arête ;
- `list_tree` complet à chaque appel.
