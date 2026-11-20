# Relief : récap du brainstorm (2026-11-18)

> Nom du projet : **relief** (choisi le 2026-11-18). Le dossier s'appelle encore `visuplus`.

## 1. Problème

Avec l'IA, on relit beaucoup de code qu'on n'a pas écrit. La relecture ligne par ligne d'un diff est inefficace.
On veut un outil qui **visualise le code à plusieurs niveaux d'architecture**, montre **les changements d'un git diff** sur ce schéma, et rend visibles **les dépendances et les imports**.

Les questions qu'un relecteur se pose vraiment :
1. Qu'est-ce qui a bougé structurellement ? (modules, dépendances, API publiques)
2. Est-ce que ça respecte l'architecture ? (couches, frontières, couplage)
3. Quel est le rayon d'impact ? (qui appelle ce qui a changé)
4. Où faut-il vraiment lire du code ? (logique, risque)

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Usages | **Relire des PR** et **comprendre un repo inconnu** |
| Langages | MVP **un seul langage (TypeScript)**, mais conçu dès le départ pour **plusieurs langages** et **plusieurs typologies de projets** |
| Taille des repos | Toutes tailles : petits repos, **monorepos**, **multirepos** |
| Diffusion | Usage perso d'abord, puis partage à des amis, puis open source ou commercialisation possible |
| Versioning | **Basé sur git** : git est la source de vérité, l'outil n'est qu'un index dérivé |
| Stack | **Option B : cœur en Rust + UI web**. UI en **Angular** (zoneless, signals, Optimus UI, ngx-translate), comme rpg-manager-front : `docs/adr/0002-angular-pour-l-ui.md` |
| Prochaine étape | **Maquette interactive de l'UI** (carte zoomable + calque de diff sur un faux repo), après avoir choisi un nom |
| Périmètre MVP | **Client local qui marche sur n'importe quelle codebase git.** **Pas d'IA pour l'instant** : tout ce qui est affiché est calculé de façon déterministe depuis le graphe |

### Décisions UX (revue de la maquette, 2026-11-18)

| Sujet | Décision |
|---|---|
| Zoom | Les boîtes **s'ouvrent automatiquement** en zoomant (zoom sémantique continu) |
| Disposition | Option « moins de croisements » : grille dont l'ordre des enfants est optimisé par recherche locale (197 → 60 croisements sur le faux repo). Le layering type Sugiyama a été essayé et fait **pire** ici (arêtes longues qui sautent des couches) |
| Panneaux | Panneaux gauche et droit **redimensionnables**, taille mémorisée ; bouton « élargir » pour le diff |
| Rayon d'impact | Traverse les appels **HTTP** entre services, **paramétrable** |
| Règles d'archi | `relief.config.yaml` : `from` / `deny` en globs de chemins, évaluées sur chaque lien statique du graphe HEAD ; violation **introduite** (lien absent du merge-base) vs **existante** (dette) |
| Ordre de lecture | **Par fichier par défaut**, options **par symbole** et **par commit**. Fichier et symbole : tri topologique (dépendances d'abord). Commit : `git log merge-base..HEAD`, et choisir un commit filtre la carte sur ses changements (rejeu). « Vu » est suivi par symbole ; un fichier est vu quand tous ses symboles changés le sont |

## 3. Concept produit

### Zoom sémantique (façon C4 / Google Maps)
```
Niveau 0  Système      [front] ──► [api] ──► [db]
Niveau 1  Modules      auth/  billing/  ui/  shared/
Niveau 2  Fichiers     auth/session.ts → shared/http.ts
Niveau 3  Symboles     class SessionStore { login(), refresh() }
Niveau 4  Code         le diff classique, en dernier recours
```
Les arêtes de haut niveau sont des agrégats (« billing → auth : 14 imports »).

### Calque de diff sur la carte
- Nœuds colorés : ajouté / modifié / supprimé / déplacé, avec une intensité selon la taille du changement.
- **Arêtes ajoutées ou supprimées**, le signal clé : un nouveau couplage (ex. `ui/` importe désormais `infra/db`).
- **Diff de signatures** : on sépare l'interface publique (exports, types) de l'implémentation interne.
- **Rayon d'impact** : appelants transitifs d'un symbole modifié, avec la couverture de tests.
- **Diff structurel** (à la difftastic) : on ignore le reformatage et on détecte les déplacements.

### Aides à la relecture
- Ordre de lecture suggéré (tri topologique du diff).
- Règles d'architecture déclaratives (`domain/` ne doit pas importer `infra/`), violations en rouge.
- Carte de risque : complexité × churn × absence de tests.
- Progression de la review : nœuds marqués « vu ».
- Tracé de flux depuis un point d'entrée (route, handler, composant).
- ~~Résumés IA par nœud~~ : **reporté** (pas d'IA dans le MVP, voir décisions).

### Formes du produit (dans le temps)
CLI + page web locale (MVP), extension VS Code, intégration PR GitHub, **serveur MCP** (pour que les agents IA interrogent le graphe).

## 4. Architecture technique

```
┌─────────────────────────────────────────────────────────┐
│  UI (web)        carte zoomable · calque diff · panneau code │
├─────────────────────────────────────────────────────────┤
│  Query API       sous-graphe, agrégation, impact, diff       │
├─────────────────────────────────────────────────────────┤
│  Graph Store     modèle universel (SQLite, par commit/blob)  │
├─────────────────────────────────────────────────────────┤
│  Diff Engine     graphe(base) vs graphe(head) → GraphDiff    │
├──────────────────────────┬──────────────────────────────┤
│  Project Detectors       │  Language Adapters            │
│  (structure haute)       │  (structure basse)            │
│  pnpm/nx/turbo, cargo,   │  TS, Python, Go, Java…        │
│  poetry, compose,        │  tree-sitter + SCIP           │
│  OpenAPI, proto…         │                               │
├──────────────────────────┴──────────────────────────────┤
│  GitSource       readBlob, listTree, diffTrees, log, mergeBase│
└─────────────────────────────────────────────────────────┘
```

- **Language Adapters** : fichiers → symboles, imports, appels, références.
- **Project Detectors** : workspace, package, service, app, frontières. Ils gèrent les « typologies de projet ».
- Le contrat adapter/detector est **sérialisé (JSON ou protobuf)**. Les plugins peuvent donc être des processus séparés, dans n'importe quel langage.

### Modèle de graphe universel
```ts
Node {
  id         // stable : "pkg:@app/auth::file:src/session.ts::sym:SessionStore.login"
  kind       // workspace | repo | service | package | module | file | symbol
  subkind    // libre, fourni par l'adapter : "class", "react-component", "route"…
  parent     // hiérarchie de contenance → zoom
  lang?, span?, visibility (public/internal), contentHash
  metrics?   // loc, complexité…
}
Edge {
  from, to
  kind       // imports | calls | references | extends | implements
             // | http | rpc | publishes | consumes | depends_on
  precision  // syntactic (tree-sitter) | resolved (SCIP/LSP)
}
```
- Les arêtes de haut niveau sont **calculées par agrégation** des arêtes fines.
- Le champ `precision` permet de supporter un langage en mode approximatif, puis de l'améliorer.
- Les arêtes `http` / `rpc` / `publishes` relient les services, y compris entre repos.

### Multi-langage : deux niveaux de précision
1. **tree-sitter** : rapide, couvre la plupart des langages. Ajouter un langage se fait surtout avec des requêtes `.scm`.
2. **SCIP** : optionnel et précis. On réutilise les indexers existants (`scip-typescript`, python, java, go, rust…).

### Passage à l'échelle
- Indexation incrémentale, avec le **hash de blob git comme clé de cache**.
- Agrégats précalculés à chaque niveau.
- L'UI n'affiche **jamais plus d'environ 1–2k nœuds** : zoom sémantique, focus + context, et en vue PR seulement le sous-graphe modifié + 1 saut.
- Stockage SQLite.

### Moteur de diff
```
GraphDiff = {
  nodes: added | removed | modified(body) | modified(signature) | moved
  edges: added | removed
  impact: appelants transitifs des symboles dont la signature change
}
```

## 5. Intégration git

- On indexe des **objets git** : `FileIndex[blob_sha]`, puis `GraphSnapshot[commit]`.
- Lecture **sans checkout** (`git cat-file --batch`, `ls-tree`).
- Le working tree et le staging sont traités comme des « commits virtuels », ce qui permet de relire ce que l'IA vient de faire avant de committer.

| Commande | Usage |
|---|---|
| `relief diff` | working tree vs HEAD |
| `relief diff --staged` | ce qui va être commité |
| `relief diff main...feature` | PR, par rapport au **merge-base** |
| `relief diff v1.2..v1.3` | entre deux tags |
| `relief show <ref>` | carte d'un commit |

Ce que git apporte en plus : détection des renommages (`-M`) et des symboles déplacés, churn et hotspots, **couplage logique** (co-change), ownership (blame agrégé), timeline de l'architecture, rejeu d'une PR commit par commit.

**Multirepo** : submodules, ou manifeste `relief.workspace.yaml` (repos + refs, un snapshot = un tuple de SHA), plus les worktrees.

**Cache** : `<racine du dépôt>/.relief/cache/index.sqlite` (ADR 0007, qui remplace `~/.cache/relief/<repo-id>/` sauf repli pour un dépôt bare ou en lecture seule), avec `repo-id` = hash du premier commit. Jetable. Seul `relief.config.yaml` est versionné dans le repo (règles d'archi, alias, exclusions). Plus tard : partage d'index via `git notes` ou un artefact CI.

**Accès git** : en Rust, **gitoxide (`gix`)**, avec le binaire `git` en repli pour les cas tordus. Le tout derrière l'interface `GitSource`, pour pouvoir lire plus tard depuis l'API GitHub/GitLab.

## 6. Briques et références

- Parsing : tree-sitter. Références : SCIP, LSP, stack-graphs.
- Layout de graphe : **ELK.js** (hiérarchique, imbriqué). Rendu : React Flow (petits graphes), Sigma.js ou Cytoscape (gros graphes).
- Diff structurel : difftastic.
- Inspirations : Sourcetrail, CodeSee, CodeScene, Structure101 / ArchUnit, Gource, dependency-cruiser, madge.

## 7. Roadmap

- **v0** : TS uniquement, `GitSource`, index par blob, detector pnpm/npm workspaces, graphe package → fichier → export, `diff` sur working tree / HEAD / `main...branch`, page web avec le calque de diff.
- **v1** : diff de signatures, rayon d'impact, renommages et symboles déplacés, churn et hotspots, zoom fluide, mode « comprendre un repo », rejeu commit par commit.
- **v2** : SCIP, **2ᵉ langage (Python ou Go) pour valider l'abstraction**, règles d'architecture, couplage logique, timeline.
- **v3** : multirepo (manifeste, submodules), arêtes inter-services, extension VS Code, serveur MCP, commentaire de PR GitHub.

## 8. Nom : relief (choisi)

npm : `relief` est **pris**, `relief-cli` est libre (vérifié le 2026-11-18). Penser à un scope (`@relief/…`) ou à `relief-cli` pour la distribution npm. GitHub pas encore vérifié.

Disponibilité vérifiée sur crates.io le 2026-11-18 (npm et GitHub non vérifiés) :

| Nom | crates.io | Idée |
|---|---|---|
| **relief** | libre | carte en relief + « mettre en relief » les changements (favori) |
| terrane | libre | en géologie, un bloc aux frontières nettes, comme un module |
| isobar | libre | lignes de niveau |
| diffscape | libre | paysage du diff |
| codestrata | libre | strates d'architecture |
| strata, topo, terrain, orrery, cartograph, archmap, contour, stratum | **pris** | — |

## 9. Prochaines étapes

1. ~~Choisir le nom~~ : **relief**.
2. ~~**Maquette interactive**~~ : faite, dans `docs/product/maquette/index.html` (itération 2 le 2026-11-18). Description d'origine : maquette de l'UI (HTML autonome) : carte zoomable système → modules → fichiers → symboles, calque de diff (nœuds et arêtes ajoutés/supprimés), panneau de diff au clic, rayon d'impact, marquage « vu ». Données d'un faux repo TS réaliste.
3. Workflow, outils (ADR 0001 à 0005), 52 tickets et roadmap écrits le 2026-11-18 : voir `docs/dev/workflow.md`, `docs/dev/rules.md` et `.scratch/ROADMAP.md`. Idée d'origine : prototype v0 du cœur Rust, qui sort le `GraphDiff` en JSON entre deux refs, testé sur un vrai repo (ex. `~/dev/rpg-manager-front`).
