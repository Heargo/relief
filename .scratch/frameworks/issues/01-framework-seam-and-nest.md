# H01 Frameworks dans l'adapter TS, routes NestJS

Status: ready-for-agent
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
