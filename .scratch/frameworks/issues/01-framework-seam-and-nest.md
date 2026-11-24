# H01 Frameworks dans l'adapter TS, routes NestJS

Status: claimed
Type: task
Blocked by: K12
UI: non
Doc: docs/user `map` (une phrase : frameworks reconnus)

Spec: `../spec.md` (Décisions, Routes NestJS) ; ADR 0011

## Comportement

- L'extraction HTTP de `relief-lang-ts` passe par des modules de framework (`src/frameworks/`), derrière un trait interne et une liste unique. Express (forme de T04) est le premier module ; son comportement ne change pas.
- Un framework ne s'applique qu'aux fichiers qui importent son paquet.
- Module `nest` : dans un fichier qui importe `@nestjs/common`, `@Controller(<prefixe>)` sur une classe et `@Get|Post|Put|Patch|Delete(<chemin>)` sur une méthode marquent la méthode comme route `VERBE /prefixe/chemin` (slashs normalisés ; `@Controller()`, `@Controller({ path })`, `@Get()` acceptés).
- Les appels `fetch("/queries/1")` d'un autre fichier ou d'un autre dépôt atteignent ces routes par les règles existantes (`path_matches`, `verb_matches`).

## Critères d'acceptation

- [ ] Un contrôleur Nest `@Controller('queries')` avec `@Post(':id/result') getQueryResult()` : la méthode porte `route: "POST /queries/:id/result"`.
- [ ] Le même code sans import de `@nestjs/common` : aucune route.
- [ ] Les tests T04/K12 existants passent sans modification.
- [ ] Un appel `fetch` d'un dépôt de l'espace vers une route Nest d'un autre dépôt donne une arête `http`.

## Baseline

Après `13583ee` : cargo 846/0 ; web 1175/0.

## Seams

- **`TsAdapter` par le contrat `LanguageAdapter`** (extraction d'un fichier en octets, comme les tests T04 de `relief-lang-ts`) : un contrôleur Nest (`@Controller('queries')`, `@Post(':id/result')`, `@Get()`, `@Controller()`, `@Controller({ path })`) marque ses méthodes en `route` avec les slashs normalisés ; le même code sans import de `@nestjs/common` ne donne aucune route ; Express inchangé (tests T04 existants). Rate la correspondance entre dépôts.
- **Cas d'usage `relief-app` sur un espace de fixture** (comme `cross_repo_http.rs` de K12, avec un dépôt API dont la route est un contrôleur Nest) : un `fetch` du dépôt web atteint la méthode du contrôleur par une arête `http` entre dépôts. Rate l'UI.

## Red

- Fichiers de test : `src/analysis/lang/relief-lang-ts/tests/frameworks.rs`, `src/app/relief-app/tests/cross_repo_nest.rs` ; fixture `tests/fixtures/shop-nest-api/` (contrôleur `OrdersController`, `@Controller("orders")` + `@Get()`)
- Lancer : `cargo test -p relief-lang-ts --test frameworks` ; `cargo test -p relief-app --test cross_repo_nest`
- En échec : 7 tests
  - a_nest_method_carries_the_route_of_its_controller_and_verb — aucune route (`POST /queries/:id/result` attendu)
  - the_route_method_has_the_route_subkind — la méthode n'a pas le sous-type `route`
  - a_verb_without_path_is_the_prefix_alone — aucune route (`GET /queries`)
  - a_controller_without_prefix_and_a_method_without_path_is_the_root — aucune route (`GET /`)
  - a_controller_with_an_object_path_gives_the_prefix — `@Controller({ path })` non reconnu
  - slashes_are_normalised — aucune route (`PUT /queries/:id`, `PATCH /queries/x`)
  - a_fetch_reaches_a_nest_controller_method_of_another_repository — aucune arête `http` vers `OrdersController.list`
- Passent déjà (garde-fous) : the_same_code_without_the_nest_import_has_no_route, express_routes_are_unchanged

## Progrès (2026-11-24)

Red fait et vérifié (7 tests rouges, 2 garde-fous verts). Tests et fixture `shop-nest-api` mis de côté dans `git stash` (« H01 red tests ») : `git stash pop` puis reprendre à l'étape 5 (green) de `docs/dev/workflow.md`. Réserve du red : vérifier l'id `pkg:shop-nest-api/src` attendu dans `cross_repo_nest.rs`.
