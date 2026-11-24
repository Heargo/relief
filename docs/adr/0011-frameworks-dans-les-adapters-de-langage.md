# 0011. Frameworks : des modules de l'adapter de langage, activés par les imports du fichier

Status: accepted (2026-11-24)

## Contexte

Les arêtes `http` (T04, K12) ne reconnaissent qu'une forme de route (`app.post("/x", handler)`, Express) et deux formes d'appel (`fetch("/x")`, une fonction `httpPost("/x")`), avec un chemin littéral qui commence par `/`. Sur un espace NestJS + Angular réel, aucune arête n'apparaît :

- NestJS déclare ses routes par décorateurs : `@Controller('queries')` sur la classe, `@Post(':id/result')` sur la méthode.
- Angular appelle par un `HttpClient` injecté : `this.http.get<T>(url)`, une forme que T04 prend pour une déclaration de route.
- Les chemins sont construits à partir d'une URL de base : `environment.API_URL + '/auth'`, `` `${this.baseUrl}/queries/${id}` ``, ou `this.baseUrl` défini dans un champ de la classe.

Ces formes dépendent du framework, pas du langage. D'autres suivront (Next, Fastify, tRPC côté TS ; FastAPI, Flask, Django côté Python). Il faut une place pour chacun, qui ne grossisse pas un seul `http.rs`, et qui ne crée pas d'arêtes fausses dans un dépôt qui n'utilise pas ce framework (un `map.get('/x', cb)` n'est pas une route).

## Décision

- **Un framework est un module de l'adapter de son langage** : `relief-lang-ts/src/frameworks/<nom>.rs` (`express`, `nest`, `angular`, puis d'autres). Il travaille sur l'arbre tree-sitter de ce langage ; un contrat commun à tous les langages n'aurait rien à lui passer. Chaque module implémente un trait interne à la crate (`TsFramework` : s'applique-t-il à ce fichier, et quelles routes et quels appels trouve-t-il). La liste des frameworks d'un langage est en un seul endroit de la crate.
- **Activation par les imports du fichier** : un framework ne s'applique qu'à un fichier qui importe son paquet (`@nestjs/common`, `@angular/common/http`). Express et `fetch` restent la forme générique, sans import requis (comportement de T04 inchangé). L'activation ne dépend que des octets du fichier, donc le cache par blob (I02) reste valide sans clé supplémentaire ; changer la liste des frameworks change la version de l'adapter, ce qui invalide le cache comme tout changement d'extraction.
- **Le contrat de sortie ne change pas de nature** : un framework produit des routes (un handler marqué `route`) et des appels (`HttpCallSite`), que `link_http` et `cross_http` relient déjà, sans cas par framework. Le framework reconnu n'est pas exposé dans le graphe pour l'instant.
- **URL de base : automatique, configuration en option.** Un préfixe dynamique en tête de chemin (`${…}`, `X + '/…'`, un champ `this.x` résolu dans sa classe) est l'URL de base : l'appel garde son expression (`base: "environment.API_URL"`) et le reste du chemin. Sans configuration, un appel avec base est relié aux routes des **autres** dépôts de l'espace (jamais du sien : une base désigne un autre service). Le fichier d'espace peut, par dépôt, associer une expression de base à un dépôt cible ; l'appel n'est alors relié qu'aux routes de ce dépôt.

## Conséquences

- Ajouter un framework = un module, sa ligne dans la liste, ses tests ; ni l'index, ni `relief-app`, ni l'UI ne changent.
- Python suivra le même schéma (`relief-lang-python/src/frameworks/`) quand on y ajoutera FastAPI ou Flask.
- Le préfixe global d'une API (`app.setGlobalPrefix('api')`) n'est pas lu pour l'instant : à ajouter dans `nest` ou dans la configuration quand un cas réel le demande.
- Les fichiers qui n'importent aucun framework ne voient aucune différence ; le risque de fausses routes reste celui de T04.
