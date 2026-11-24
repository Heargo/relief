# Spec : frameworks (H)

Status: ready-for-agent
Date: 2026-11-24

## But

Lire chaque dépôt selon ses frameworks, pour que les arêtes `http` apparaissent sur des projets réels : routes NestJS, appels Angular `HttpClient`, chemins construits à partir d'une URL de base. Décision : `docs/adr/0011-frameworks-dans-les-adapters-de-langage.md`.

Cas réel de départ : l'espace `sql-monitoring` (front Angular, back NestJS), où aucune arête `http` n'apparaît aujourd'hui.

## Décisions

- Un framework = un module `relief-lang-ts/src/frameworks/<nom>.rs` derrière un trait interne (`TsFramework`), listés en un seul endroit. Express (T04) devient le premier module, sans changement de comportement.
- Un framework ne s'applique qu'aux fichiers qui importent son paquet (`@nestjs/common`, `@angular/common/http`). Le cache par blob reste valide.
- Sortie inchangée : routes (handler avec `route`) et `HttpCallSite`, reliés par `link_http` (dans un dépôt) et `cross_http` (entre dépôts).

## Routes NestJS

- `@Controller('queries')` (ou `@Controller()`, ou `@Controller({ path: 'queries' })`) sur une classe donne le préfixe ; `@Get()`, `@Post(':id/result')`, `@Put`, `@Patch`, `@Delete` sur une méthode donnent le verbe et la fin du chemin. La route est `POST /queries/:id/result`, portée par le nœud de la méthode.
- Les slashs sont normalisés (un seul `/` entre les morceaux, pas de `/` final, `/` seul pour un contrôleur et une méthode sans chemin).

## Appels Angular

- Dans un fichier qui importe `HttpClient` de `@angular/common/http` : `<x>.get|post|put|patch|delete(url, …)` sur un membre ou une variable typé `HttpClient` (paramètre de constructeur, `inject(HttpClient)`) est un appel, verbe donné par la méthode. Les génériques (`get<User>(…)`) sont ignorés. `request('GET', url)` aussi.
- Ces formes ne sont plus lues comme des déclarations de route dans ce fichier.

## URL de base

- Commun à tous les appels TS (`fetch`, wrappers, Angular) : un chemin dont la tête est dynamique, `` `${expr}/x` `` ou `expr + '/x'`, a une base `expr` (texte normalisé de l'expression) et un chemin `/x`.
- `this.champ` et une constante locale du fichier sont résolus vers leur initialiseur quand il est dans le même fichier et sans ambiguïté (`baseUrl = \`${environment.API_URL}/file\``), récursivement, avec une limite de profondeur.
- Un appel sans base garde le comportement de T04/K12. Un appel avec base n'est relié qu'aux routes des autres dépôts de l'espace.

## Configuration

- Dans le fichier d'espace, par dépôt, une liste optionnelle `http` : `{ "base": "environment.API_URL", "repo": "sql-monitoring-back" }`. Un appel de ce dépôt dont la base vaut `base` n'est relié qu'aux routes du dépôt `repo`. Une base inconnue garde la règle automatique. Un `repo` qui n'existe pas dans l'espace est une erreur d'espace.
- Les champs inconnus du fichier restent préservés (comportement actuel de `Workspace`).

## Hors périmètre

- Préfixe global (`setGlobalPrefix`), versionnement d'API Nest, routes de modules (`RouterModule`).
- Frameworks Python, Next, Fastify, tRPC.
- Afficher le framework reconnu dans l'UI.
