# H03 URL de base dynamique

Status: ready-for-agent
Type: task
Blocked by: H02
UI: non
Doc: docs/user `map` ou page espace de travail (une phrase)

Spec: `../spec.md` (URL de base) ; ADR 0011

## Comportement

- Pour tout appel TS (`fetch`, wrappers, Angular) : un chemin dont la tête est dynamique, `` `${expr}/x/${id}` `` ou `expr + '/x/' + id`, a une base (`expr`, texte normalisé) et un chemin (`/x/\0`). Une concaténation avec une expression dynamique au milieu devient un joker, comme une substitution.
- `this.champ` (champ de la classe englobante) et une constante du fichier sont résolus vers leur initialiseur du même fichier, récursivement, profondeur bornée. Un champ sans initialiseur ou réassigné reste dynamique : l'appel est ignoré.
- `HttpCallSite` (et l'index par fichier) portent `base: Option<String>`.
- Un appel avec base n'est relié qu'aux routes des autres dépôts de l'espace (`cross_http`), jamais aux routes de son propre dépôt (`link_http`). Sans base : comportement inchangé.

## Critères d'acceptation

- [ ] `this.http.get(environment.API_URL + '/auth')` : base `environment.API_URL`, chemin `/auth`.
- [ ] `private readonly baseUrl = \`${environment.API_URL}/file\`` puis `this.http.get(\`${this.baseUrl}/${id}\`)` : base `environment.API_URL`, chemin `/file/\0`.
- [ ] `this.http.get(this.baseUrl)` avec `baseUrl = \`${environment.API_URL}/operation\`` : chemin `/operation`.
- [ ] Un appel avec base dans un dépôt qui déclare aussi la route : pas d'arête dans le dépôt ; une arête vers la route de l'autre dépôt.
