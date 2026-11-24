# H02 Appels Angular HttpClient

Status: ready-for-agent
Type: task
Blocked by: H01
UI: non
Doc: docs/user `map` (complète la phrase de H01)

Spec: `../spec.md` (Appels Angular) ; ADR 0011

## Comportement

- Module `angular` : dans un fichier qui importe `HttpClient` de `@angular/common/http`, `this.http.get|post|put|patch|delete(url, …)` (membre ou paramètre de constructeur typé `HttpClient`, ou champ initialisé par `inject(HttpClient)`) est un appel HTTP du symbole englobant, verbe donné par la méthode ; `request('GET', url)` aussi. Les arguments de type (`get<User>(…)`) sont ignorés.
- Dans ces fichiers, ces appels ne sont plus lus comme des déclarations de route.
- Chemins littéraux seulement dans ce ticket (l'URL de base est H03).

## Critères d'acceptation

- [ ] Un service Angular `this.http.get<User[]>('/user')` : appel `GET /user` depuis la méthode englobante.
- [ ] `this.http.post('/auth/login', body)` : appel `POST`.
- [ ] Un `router.get('/x', handler)` dans un fichier sans import Angular garde le comportement de T04.
- [ ] Entre dépôts : un service Angular qui appelle `/queries/1` atteint la route Nest `GET /queries/:id` (H01).
