# relief : règles

relief visualise un dépôt git comme une carte zoomable (système → modules → fichiers → symboles) et superpose un diff à cette carte. C'est un **client local** : une app native (Tauri) `relief` en Rust qui lit git, indexe le code, calcule un graphe et un `GraphDiff`, et l'affiche dans une UI Angular embarquée (`docs/adr/0002-angular-pour-l-ui.md`). Pas de serveur distant, pas de compte, **pas d'IA dans le MVP** : tout ce qui est affiché est calculé de façon déterministe depuis git et le graphe (`docs/adr/0005-pas-d-ia-dans-le-mvp.md`). Le cadrage produit est dans `docs/product/BRAINSTORM.md`, l'UX validée dans `docs/product/maquette/index.html`.

Langues : le code, les identifiants et les messages de commit sont en anglais ; les specs, tickets et docs internes en français ; l'UI et la doc utilisateur en anglais et en français.

## Structure

```
src/                      toutes les sources, rangées par couche (ADR 0008)
  domain/                 pur, sans I/O
    relief-model/         types du graphe universel (Node, Edge, GraphSnapshot, GraphDiff), ids stables, JSON Schema
    relief-diff/          moteur de diff, impact, agrégation par niveau, ordre de lecture
    relief-rules/         règles d'architecture (relief.config.yaml)
  analysis/               lire git et le code
    relief-git/           trait GitSource + implémentation gix (repli sur le binaire git)
    relief-adapter-api/   contrats des extracteurs : LanguageAdapter, Detector, Extraction, LinkContext, Detection
    relief-detect/        Project Detectors : workspace, packages, dossiers (générique, n'importe quel langage)
    relief-index/         orchestre detectors + adapters → GraphSnapshot ; cache SQLite par blob
    lang/relief-lang-ts/  Language Adapter TypeScript/TSX (tree-sitter)
  app/                    couche application
    relief-app/           `Session`, `DataDir` et cas d'usage (snapshot, diff, résumé de relecture, code)
  interfaces/             points d'entrée
    relief-desktop/       app Tauri 2 (binaire `relief`, `relief [path] [range]`) : commandes sur la `Session`, UI embarquée, composition root
  ui/                     UI Angular 22 (zoneless, signals) + Optimus UI
tests/
  e2e/                    tests WebdriverIO contre l'app construite
  fixtures/               définitions des dépôts de test (acme-shop = le faux repo de la maquette)
  relief-fixtures/        construit des dépôts git de test déterministes (tests/fixtures/<nom>/)
docs/
  adr/                    décisions d'architecture
  contract/               contrat JSON (généré)
  dev/                    règles (ce fichier), workflow, conventions des agents
  product/                BRAINSTORM.md, maquette/
  user/                   doc utilisateur (Starlight), FR + EN, captures WebdriverIO
```

Une dépendance d'une couche vers une couche du dessus (`domain/` vers `analysis/` ou `interfaces/`, `analysis/` vers `interfaces/`) se voit dans le chemin et est refusée en review. Les dev-dependencies de test (fixtures, adapters pour les tests d'intégration) sont tolérées.

## Couches

Le flux va toujours dans un seul sens : **git → index → diff/requêtes → API → UI**.

| Couche               | Où                                                                | Fait                                                                                                                                                                                                                                                                                                                                                                       | Peut utiliser                                                                       |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Source git           | `relief-git`                                                      | Lire refs, arbres, blobs, diff d'arbres, merge-base, log, worktree/index. Aucune connaissance du code.                                                                                                                                                                                                                                                                     | `gix`, binaire `git` en repli                                                       |
| Detectors / adapters | `relief-adapter-api` (contrats), `relief-detect`, `relief-lang-*` | Un fichier (ou un arbre) → nœuds et arêtes. Fonctions pures sur des octets et des chemins : **ne lisent jamais git eux-mêmes**. Ils dépendent de `relief-adapter-api` et `relief-model`, jamais de `relief-index`.                                                                                                                                                         | `relief-adapter-api`, `relief-model`, tree-sitter                                   |
| Index                | `relief-index`                                                    | Assemble un `GraphSnapshot` pour un commit (ou commit virtuel), cache par hash de blob. Reçoit ses detectors et adapters de l'appelant (`with_detectors`, `with_adapter`) : il n'en nomme aucun.                                                                                                                                                                           | git, adapter-api, model                                                             |
| Requêtes             | `relief-diff`, `relief-rules`                                     | Fonctions pures sur des `GraphSnapshot` : diff, impact, agrégation, ordre de lecture, violations.                                                                                                                                                                                                                                                                          | `relief-model`                                                                      |
| Application          | `relief-app`                                                      | Cas d'usage (`Session` : `meta`, `snapshot`, `diff`, `review_summary`, `code`) : résolution des deux côtés d'une plage, indexation avec mémoire des commits réels, renames, textes de signatures, `attribute_edge_commits`, erreur unique `AppError`. Reçoit ses detectors et adapters de l'appelant ; aucune règle de diff propre : elle appelle les couches inférieures. | git, index, requêtes, adapter-api                                                   |
| Exposition           | `relief-desktop`                                                  | Parse les arguments, expose les commandes Tauri, appelle `relief-app`, sérialise. Aucune logique métier. C'est la composition root : il fournit les extracteurs (`default_detectors()` + `TsAdapter`) à la `Session`.                                                                                                                                                      | `relief-app`                                                                        |
| UI                   | `src/ui/`                                                         | Afficher et interagir. Ne recalcule pas ce que le cœur sait calculer (diff, impact, violations) : elle le demande à l'API.                                                                                                                                                                                                                                                 | l'API via `ReliefApiService` (`src/ui/src/app/core/services/relief-api.service.ts`) |

- `relief-app` est la couche application derrière l'exposition (les commandes Tauri ; d'autres, comme des sous-commandes CLI, pourront s'y ajouter sans réécriture). Elle existe parce que `relief-index` ne peut pas dépendre de `relief-diff` et que les crates de requêtes ne dépendent pas de git ; elle n'appelle que les crates des couches inférieures, jamais l'inverse, et ne dépend d'aucun `relief-lang-*` ni de `relief-detect`.
- Une crate de requêtes ne dépend jamais de `relief-git` : elle reçoit des snapshots. C'est ce qui la rend testable sans dépôt.
- Le contrat entre adapters et index est sérialisable (serde) : un adapter pourra devenir un processus séparé plus tard sans changer l'index.
- Les erreurs : `thiserror` dans les crates de bibliothèque, `anyhow` seulement dans un binaire. Pas de `unwrap()` hors des tests.

## Modèle de graphe

- `Node { id, kind, subkind, parent, lang?, span?, visibility, content_hash, signature_hash?, metrics? }`, `Edge { from, to, kind, precision }` (voir `docs/product/BRAINSTORM.md`).
- Les **ids sont stables** et lisibles : `pkg:@acme/api::file:src/billing/invoice.ts::sym:computeTotal`. Ils ne dépendent ni de l'ordre de parcours ni d'un compteur.
- Le `content_hash` d'un symbole ignore les espaces et les commentaires ; le `signature_hash` ne couvre que la signature publique. Deux hashes différents = deux catégories de changement (corps / signature).
- Le JSON exposé est généré depuis les types Rust (`schemars`) dans `docs/contract/*.schema.json`, et les types TS de `src/ui/src/app/core/models/contract.ts` en sont générés (`just contract`). On ne les écrit jamais à la main.

## UI (src/ui/)

Angular 22, zoneless, composants standalone, TypeScript strict ; pour tout ce qui n'est pas propre à relief, mêmes conventions que rpg-manager-front.

- Structure : `src/ui/src/app/core/` (services, modèles dont `contract.ts`, i18n, préférences, composants partagés) et `src/ui/src/app/modules/<écran>/` (`map`, `review`, `rules`, `explore`), chacun avec `components/`, `business/`, `helpers/`.
- Couches **composant → business → service**. Un composant n'injecte jamais un service ; un `*.business.ts` porte l'état (`signal`, `computed`, exposés en lecture seule) et l'orchestration ; `ReliefApiService` est le seul à appeler l'API (commandes Tauri par `invoke`, `Promise` pour un appel, `Observable` si l'API pousse un jour des mises à jour).
- Toute logique non triviale (layout, visibilité, agrégation affichée, comptage de croisements, ordre côté client, raccourcis) va dans des helpers purs `*.logic.ts`, sans injection Angular, testés sans TestBed. Les composants restent minces.
- API des composants : `input()`, `input.required()`, `output()`, `model()`, `viewChild()` ; templates en `@if` / `@for` / `@switch`. Pas de `@Input()`, `@Output()`, `*ngIf`.
- Contrôles d'interface : Optimus UI (`@openng/optimus-ui`) avant tout composant maison ; jamais d'`<input>` natif stylé à la main. La carte elle-même est un canvas dessiné à la main.
- La carte est un canvas Canvas 2D (ADR 0009) : un peintre (`map-painter.ts`, `edge-painter.ts`) dessine la scène (`buildMapScene`, en unités du monde) à chaque frame, sans élément par nœud ni par arête ; le fil d'Ariane, les niveaux et la légende restent en Angular. L'UI n'affiche jamais plus d'environ 2 000 nœuds : au-delà, le cœur renvoie un sous-graphe.
- Préférences de l'utilisateur (taille des panneaux, disposition, langue, mode de lecture) : `localStorage`, chaque accès dans un `try/catch`. L'état de relecture (« vu ») est persistant côté cœur, par dépôt et plage de commits, via l'API.
- Couleurs en variables CSS sur `:root`, thème clair et sombre (`prefers-color-scheme`).

## i18n

- ngx-translate, comme rpg-manager-front. Chaînes de l'UI dans `src/ui/public/i18n/en.json` et `fr.json`, clés imbriquées par écran (`map.*`, `review.*`). Toute nouvelle clé va dans les deux fichiers dans le même changement.
- Templates : `{{ 'map.key' | translate }}` ; TypeScript : `LanguageBusiness.t('clé', params)`. Jamais de texte affiché en dur. Les textes intégrés d'Optimus UI viennent du bloc `optimus` de chaque fichier.
- Langue de départ : choix enregistré, puis langue du navigateur, puis `en`.
- La CLI et les messages d'erreur de l'API sont en anglais.

## Git

- relief lit des **objets** git, sans checkout : `ls-tree`, `cat-file`, diff d'arbres. Le working tree et l'index sont des « commits virtuels ».
- Une plage `A...B` se compare au **merge-base**. `A..B` compare les deux arbres tels quels.
- relief n'écrit dans le dépôt analysé que son dossier `.relief/` (`cache/` jetable, `state/` à garder, `.gitignore` et `relief.json`), résolu par `DataDir` dans `relief-app` ; `relief-git` l'exclut comme `.git/`. Pour un dépôt bare ou en lecture seule, repli sur `~/.cache/relief/<repo-id>/` (`repo-id` = hash du premier commit) ; `RELIEF_CACHE_DIR` force la racine des données. Seul `relief.config.yaml` est versionné dans le dépôt analysé.

## Commandes

Les tâches passent par [`just`](https://github.com/casey/just) (`justfile` à la racine).

- Prérequis e2e : `tauri-driver` (`cargo install tauri-driver --locked`), `WebKitWebDriver` (`webkitgtk-6.0` sur Arch, `webkit2gtk-driver` sur Debian/Ubuntu) et Xvfb (`xvfb-run`).
- Prérequis Linux pour `relief-desktop` (Tauri 2) : `webkit2gtk-4.1`, `libsoup-3.0`, `gtk+-3.0` (paquets `-dev` selon la distribution). `cargo test` des commandes et du binaire n'ouvre aucune fenêtre.
- `just setup` : installe les dépendances (cargo fetch, npm install dans `src/ui/`, `tests/e2e/`, `docs/user/`, `tauri-driver`, contrôle de `WebKitWebDriver`)
- `just dev` : l'app desktop (`tauri dev`) sur la fixture acme-shop `main...feat/promo-codes`, UI servie par `ng serve` (port 4200)
- `just build` : docs, UI, copie de `docs/user/dist/` dans `src/ui/dist/relief/browser/docs/`, puis `cargo build --release` (l'UI et la doc sont embarquées dans l'app ; l'app desktop avec `--features custom-protocol`). La commande `open_docs` ouvre cette doc dans la fenêtre `docs` ; sous `just dev` (`ng serve`), la doc n'est pas servie : le lien Aide n'ouvre rien d'utile
- `just test` : `cargo test --workspace` puis `ng test --watch=false` (`src/ui/`, Vitest)
- `just test-summary` : la même chose réduite aux lignes de résumé
- `just e2e` / `just e2e-summary` : build puis WebdriverIO sur l'app (`tests/e2e/`, sous Xvfb quand il est présent)
- `just bench-ui` : benchmark de rendu de la carte (pan, zoom, sélection sur `dense` et excalidraw, `tests/e2e/bench/`), chiffres dans `target/bench-ui/` et `docs/bench.md` ; hors `just e2e`, demande le clone de `just bench`
- `just lint` : `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`, `ng build` (vérifie aussi les templates), Prettier
- `just contract` : régénère `docs/contract/` et `src/ui/src/app/core/models/contract.ts`
- `just fixture <nom> <dossier>` : construit un dépôt de fixture (par exemple `just fixture acme-shop /tmp/acme`)
- `just docs-dev`, `just docs-build`, `just docs-shots [page]` : doc utilisateur et ses captures

## Tests

- **Rust, unitaires** : à côté du code (`#[cfg(test)] mod tests`). Les crates de requêtes se testent avec des snapshots construits en mémoire (`relief_model::testing::GraphBuilder`), jamais avec un dépôt.
- **Rust, intégration** : `src/<crate>/tests/*.rs`, sur des dépôts construits par `relief-fixtures`. Git n'est jamais mocké.
- **Snapshots** : `insta` pour les sorties JSON (`cargo insta review` pour accepter un changement voulu). Un snapshot accepté fait partie du test : la review le relit.
- **App desktop** : les commandes Tauri se testent avec `tauri::test` (runtime simulé) dans `src/interfaces/relief-desktop/tests/`, sur une fixture ; `relief_desktop::register` est générique sur le runtime pour cela ; `assert_cmd` lance le vrai binaire `relief` pour les cas d'erreur (`tests/binary.rs`).
- **Cas d'usage** : les cas d'usage de `relief-app` se testent sur une fixture.
- **UI** : Vitest par le builder `@angular/build:unit-test` (jsdom). Les `*.logic.ts` sont testés directement ; les business avec `TestBed.inject` ; les composants avec `imports: [Composant]` et `providers: TEST_PROVIDERS` (`src/ui/src/testing/test-providers.ts` : vraies traductions EN/FR, Optimus UI), en attendant `fixture.whenStable()` (zoneless). Seul `ReliefApiService` est mocké.
- **e2e** : WebdriverIO + `tauri-driver` (`tests/e2e/`), qui lance l'app construite sur une fixture construite pour l'occasion. Un test par parcours principal de ticket d'UI ; sélecteurs par rôle et par texte, ou `data-testid` quand ni l'un ni l'autre n'est stable. La carte étant un canvas, les specs la lisent par l'API de scène (`window.__reliefScene()`, `tests/e2e/helpers/map-scene.ts`) et cliquent aux coordonnées qu'elle donne, jamais par des éléments de nœud ou d'arête.
- **e2e, choix de la fixture** : une spec reste sur acme-shop (plage `main...feat/promo-codes`) sauf si sa première ligne est `// @fixture <nom>`, où `<nom>` est un dossier de `tests/fixtures/` (`tiny`, `churn`, `wide`…). Le harnais (`tests/e2e/wdio.base.ts`) construit chaque fixture demandée une seule fois par run, dans `<tmp>/<nom>` (supprimé à la fin ; le dossier donne le nom de dépôt affiché), et lance l'app de chaque spec sur son dépôt (sans plage hors acme-shop). `RELIEF_E2E_REPO` pointe sur ce dépôt. `resetReliefData({ cache?: boolean })` (`tests/e2e/helpers/review-state.ts`) vide `.relief/state/`, et `.relief/cache/` avec `{ cache: true }`. Les fixtures « générées » (`wide`, 10 packages × 300 fichiers ; `dense`, 10 × 150 avec imports entre packages et 30 fichiers modifiés dans le working tree) déclarent `generate:` dans leur `fixture.yaml` : les fichiers sont écrits au build, jamais commités.
- **e2e, sélecteur de dossier** : le dialogue natif ne se pilote pas. `ReliefApiService.pickRepoFolder()` rend d'abord `window.__reliefE2ePicks.shift()` quand ce tableau de chaînes est non vide, sans ouvrir le dialogue ; une spec le pose avec `browser.execute` (`tests/e2e/tests/multi-repo-journey.e2e.ts`). Rien d'autre ne le pose : inactif hors e2e. Une spec peut aussi commencer par `// @fixtures a b` (fixtures construites côte à côte dans `<tmp>/<nom>`, sans espace ni dépôt par défaut ; `RELIEF_E2E_REPO` = `<tmp>`), avec `// @welcome` pour démarrer sans récent.
- Commandes d'un fichier : `cargo test -p <crate> --test <fichier>`, `npx --prefix web ng test --watch=false --include <fichier>` (depuis `src/ui/`), `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/<fichier>.e2e.ts`.
- Pas d'aléatoire ni d'horloge réelle dans le code testé : les fixtures ont des dates et auteurs fixes, donc des SHA stables.

## Doc utilisateur

- `docs/user/` (Starlight), français à la racine, anglais sous `en/`, publiable seule (la doc sera embarquée dans l'app, N08).
- Une page par fonctionnalité visible. Chaque ticket qui change ce que voit ou tape un utilisateur met à jour sa page dans les deux langues (étape 8 de `docs/dev/workflow.md`).
- Les captures sont produites par WebdriverIO (`docs/user/screenshots/*.shot.ts`) sur la fixture acme-shop, jamais à la main.

## Conventions

- `cargo fmt` et Prettier formatent le code ; `clippy -D warnings` est bloquant.
- Commits `<type>(<scope>): <résumé>` (feat, fix, refactor, test, docs, chore).
- Jamais de secret ni de fichier `.env` commité.
