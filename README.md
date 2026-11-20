# relief

Relire du code qu'on n'a pas écrit, sans lire un diff ligne par ligne. relief dessine un dépôt git comme une carte qu'on zoome (système → modules → fichiers → symboles) et y superpose un diff : ce qui a été ajouté, modifié, supprimé ou déplacé, les dépendances qui apparaissent ou disparaissent, les signatures qui cassent, et qui en subit l'impact.

État : **en développement**. Le cœur Rust et l'application de bureau fonctionnent : `relief` ouvre la carte zoomable d'un dépôt (système, modules, fichiers, symboles). Certaines fonctions du diff, de la recherche et des règles d'architecture ne sont pas encore là ; l'ordre de développement est dans [.scratch/ROADMAP.md](.scratch/ROADMAP.md). La maquette interactive est dans [docs/product/maquette/index.html](docs/product/maquette/index.html).

## Installer et lancer

Prérequis : Rust, Node.js et npm, git. L'interface est embarquée dans l'application à la compilation : construisez-la avant d'installer.

```
npm --prefix src/ui install && npm --prefix src/ui run build
cargo install --path src/interfaces/relief-desktop --features custom-protocol
```

Puis, dans n'importe quel dépôt git :

```
relief                           # HEAD jusqu'à l'arbre de travail, dépôt courant
relief . main...feature          # une plage, comparée au merge-base
relief ~/code/depot              # un autre dépôt
```

Les données de relief (cache d'index, état de relecture) vivent dans `.relief/` à la racine du dépôt analysé, ignoré par git ; repli sur `~/.cache/relief/<repo-id>/` (ou `$XDG_CACHE_HOME/relief/<repo-id>/`) pour un dépôt bare ou en lecture seule. `RELIEF_CACHE_DIR` choisit un autre dossier. Voir la page « Commencer » de la documentation (`docs/user`).

## Commandes

```
relief [chemin] [plage]          # ouvre la fenêtre sur la carte ; code de sortie 2 si le dépôt ne s'ouvre pas
```

## Architecture

relief est un client local : un binaire Rust lit les objets git (sans checkout, sans jamais écrire dans le dépôt), construit un graphe du code, compare deux graphes, et l'affiche dans une UI Angular embarquée dans une application Tauri. Tout est calculé de façon déterministe, sans IA. Les règles de dépendance entre couches sont dans [docs/dev/rules.md](docs/dev/rules.md) ; cette section décrit ce qui existe aujourd'hui.

### Le flux

```
           dépôt git (objets, index, working tree)
                         │
                   relief-git ── GitSource : refs, arbres, blobs, merge-base, log
                         │
                  relief-index ── Indexer : detectors + adapters → GraphSnapshot
                   │        │         (cache SQLite par blob)
          relief-detect   relief-lang-ts
          (workspaces,    (symboles, imports, appels,
           packages)       rendus, arêtes HTTP)
                         │
                  relief-diff ── GraphDiff, signatures, couplage, résumé de relecture
                         │
                   relief-app ── Session, cas d'usage
                         │
                  relief-desktop (Tauri) ── commandes IPC
                         │
                    src/ui/ (Angular)
```

Le flux ne remonte jamais : une couche n'appelle que celles du dessous. `relief-model` est partagé par toutes.

### Le cœur Rust (`src/`)

| Crate | Rôle | État |
| --- | --- | --- |
| `relief-model` | Le graphe universel : `Node` (`repo`, `workspace`, `service`, `package`, `module`, `file`, `symbol`, `external`), `Edge` (`imports`, `calls`, `references`, `renders`, `extends`, `implements`, `http`, `depends_on`), `GraphSnapshot`, `GraphDiff`, les réponses de l'API. Ids stables et lisibles (`pkg:@acme/api::file:src/billing/invoice.ts::sym:computeTotal`). Génère le JSON Schema de `docs/contract/`. `testing::GraphBuilder` construit des snapshots en mémoire pour les tests. | fait |
| `relief-git` | `GitSource` sur `gix` : résout `A...B` (contre le merge-base), `A..B`, l'index et le working tree comme « commits virtuels » ; liste les arbres, lit les blobs, diffe les arbres, lit le log. | fait |
| `relief-detect` | Découpe un arbre en workspace, packages et dossiers : détecteur de workspaces (npm, pnpm, yarn), puis détecteur générique valable pour n'importe quel langage. | fait |
| `relief-lang-ts` | `TsAdapter`, l'adapter TypeScript/TSX (tree-sitter) : symboles et leur visibilité, résolution des imports et des références, appels, rendus JSX, routes et appels HTTP reliés entre front et API, comparaison de signatures (`compare.rs`). | fait |
| `relief-index` | `Indexer` : lance les detectors puis, pour chaque fichier, l'adapter qui gère son langage (`extract`), puis une seconde passe de liaison inter-fichiers (`link`). Les extractions sont mises en cache dans `<cache>/index.sqlite`, clé (blob, adapter, version). Définit le trait `LanguageAdapter`. | fait |
| `relief-diff` | Fonctions pures sur des snapshots : `diff_graphs_with_options` (ajouts, suppressions, modifications de corps ou de signature, renames, changements de forme seule), attribution des arêtes aux commits, couplage entre modules, impact (rayon, profondeur, chemin, couverture de tests), `review_summary`. | fait |
| `relief-rules` | Règles d'architecture (`relief.config.yaml`). | squelette |
| `relief-app` | Couche application : `Session` et cas d'usage appelés par l'app de bureau (résolution des deux côtés d'une plage, indexation avec mémoire des commits réels, renames, textes de signatures, diff). | fait |
| `relief-desktop` | Binaire `relief` : app Tauri 2 (clap : `[path] [range]`), cinq commandes IPC sur la `Session`, UI (`src/ui/dist`) embarquée. Mince : appelle `relief-app`. | fait |
| `relief-fixtures` | Construit des dépôts git de test déterministes (dates et auteurs fixes) à partir de `tests/fixtures/<nom>/`. | fait |

Le contrat entre adapters et index est sérialisable : un adapter pourra devenir un processus séparé. Ajouter un langage revient à écrire une crate `relief-lang-<x>` qui implémente `LanguageAdapter` et à l'enregistrer dans `relief-desktop`.

### L'API (commandes Tauri)

| Commande | Renvoie |
| --- | --- |
| `meta` | Le dépôt, la plage d'ouverture, les branches et tags (pour le sélecteur de plage) |
| `snapshot(rev)` | Le `GraphSnapshot` d'une révision |
| `diff(range)` | Le `GraphDiff` d'une plage, avec renames et fichiers au formatage seul |
| `review_summary(range)` | Le résumé structurel et les signaux de relecture |
| `code(node, side, range)` | Le texte d'un fichier ou d'un symbole, d'un côté de la plage |

Le JSON est décrit par les schémas de [docs/contract/](docs/contract/), générés depuis les types Rust ; les types TypeScript de l'UI en sont générés (`just contract`).

### L'UI (`src/ui/`)

Angular 22, zoneless, signals. Trois couches : composant → `*.business.ts` (état et orchestration) → `ReliefApiService`, seul à parler à l'API. La logique non triviale vit dans des helpers purs `*.logic.ts`.

- `core/` : `ReliefApiService`, `contract.ts` (généré), langue (ngx-translate, EN/FR), thème, page de base.
- `modules/map/` : la carte zoomable en DOM + SVG (layout, caméra, visibilité par niveau, arêtes et croisements, recherche, raccourcis, fil d'Ariane) et le panneau de nœud.
- `modules/review/` : la couche diff posée sur la carte, le panneau de diff (diff ligne à ligne, raisons de changement de signature), l'aperçu structurel et les signaux de relecture.

Les écrans `rules` et `explore` prévus par [docs/dev/rules.md](docs/dev/rules.md) n'existent pas encore.

### Autour du code

- `tests/e2e/` : WebdriverIO (`tauri-driver`) contre l'app construite, sur une fixture construite pour l'occasion.
- `docs/user/` : doc utilisateur Starlight (FR à la racine, EN sous `en/`), captures produites par WebdriverIO sur la fixture `acme-shop`.
- `tests/fixtures/acme-shop/` : le faux monorepo de la maquette (API, web, packages `db` et `shared`), décrit par `fixture.yaml` comme une suite de couches (`base`, `auth`, `checkout`…) qui donnent des commits et des branches à comparer.
- `justfile` : toutes les commandes (`just dev`, `just test`, `just lint`, `just e2e`, `just contract`…), détaillées dans [docs/dev/rules.md](docs/dev/rules.md#commandes).

## Où trouver quoi

| Où | Quoi |
| --- | --- |
| [docs/product/BRAINSTORM.md](docs/product/BRAINSTORM.md) | Le problème, le concept, l'architecture, les décisions |
| [docs/product/maquette/](docs/product/maquette/index.html) | La maquette d'UX validée |
| [docs/dev/rules.md](docs/dev/rules.md) | Structure du code, couches, tests, commandes |
| [docs/adr/](docs/adr/) | Les décisions et leurs raisons |
| [docs/dev/workflow.md](docs/dev/workflow.md) | Comment un ticket est développé (tests d'abord) |
| [.scratch/ROADMAP.md](.scratch/ROADMAP.md) | L'ordre de développement ; les specs et tickets sont sous `.scratch/` |

## Licence

[MIT](LICENSE).
