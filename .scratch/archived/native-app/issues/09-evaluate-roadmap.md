# Réévaluer les tickets restants selon la nouvelle architecture

Status: resolved
Type: task
Blocked by: N04, N08
UI: non
Doc: non

Spec: `../spec.md` (Hors périmètre) ; ADR 0006 à 0008

## À faire

- Relire chaque ticket ouvert de `.scratch/ROADMAP.md` (R04 à L01) et sa spec, au regard de l'app native, de `relief-app` et de `.relief/` : routes `/api/*` à remplacer par des cas d'usage et des commandes Tauri, tests Playwright par WebdriverIO, `relief serve` par `relief <path>`, chemins à jour, critères devenus faux.
- Décider pour chaque point reporté par la spec (sous-commandes sans interface dont `relief check` d'A02, détachement du terminal, instance unique, paquets, événements poussés et surveillance des fichiers, MCP, VS Code) : ticket à créer, ligne « Plus tard », ou abandon.
- Décider du sort de `.scratch/cli/spec.md` (archivé, ou réécrit pour les sous-commandes si elles reviennent).
- Proposer les modifications à l'utilisateur (tickets réécrits, découpés, fusionnés, abandonnés, ordre de la roadmap) et ne les écrire qu'après son accord.

## Critères d'acceptation

- [x] Chaque ticket ouvert est relu, et marqué inchangé, réécrit, découpé ou `wontfix`, avec une ligne de raison dans ce ticket.
- [x] Plus aucun ticket ou spec ouvert ne cite `/api/`, `relief serve`, Playwright ou `~/.cache/relief` comme emplacement principal.
- [x] `.scratch/ROADMAP.md` reflète l'ordre validé par l'utilisateur.

## Proposition

Rien n'est écrit ailleurs que dans ce fichier. Les changements ci-dessous attendent l'accord de l'utilisateur (critère 3 du ticket). Bilan : 15 tickets relus, 2 inchangés (E07, R07), 12 réécrits, 1 découpé (A02), 0 fusionné, 0 `wontfix`. Trois tickets nouveaux : Z01, F06, W01.

Deux faits dirigent presque tous les changements :

- Il n'y a plus de route : un ticket qui ajoute une donnée ajoute un **cas d'usage `relief-app`** (méthode de `Session`, requête typée, `AppError`), une **commande Tauri** mince (`#[tauri::command]` enregistrée dans `register`, ajoutée à la capability `main`), une méthode de `ReliefApiService` (`invoke`), et régénère le contrat (`just contract`).
- Les e2e tournent sur l'app construite, avec une seule fixture (acme-shop, construite une fois dans un dossier temporaire par `wdio.base.ts`). Un ticket qui veut une autre fixture (`tiny`, `churn`, `wide`, `py-shop`) a besoin de F06 ; un ticket qui écrit dans `.relief/state/` doit remettre l'état à zéro entre deux specs.

### 1. Verdict par ticket

| Ticket | Verdict | Raison |
| --- | --- | --- |
| R04 Rayon d'impact dans l'UI | réécrit | `/api/impact` n'existe plus (il restait en 501) : il faut le cas d'usage et la commande. |
| E07 Ordre de lecture | inchangé | Fonction pure de `relief-diff` sur un `GraphDiff` ; aucun transport, aucun chemin cité. |
| R05 Ordre de lecture et « vu » | réécrit | `GET/PUT /api/review/state` devient deux cas d'usage ; l'état va dans `.relief/state/`. |
| R06 Ordre par commit et rejeu | réécrit | `/api/diff?range=` devient la commande `diff` ; tests API et e2e à changer. |
| R07 Focus PR et calques | inchangé | UI seule (Vitest + e2e) ; le e2e est déjà un e2e de l'app, seul l'outil a changé. |
| A01 Lecture de `relief.config.yaml` | réécrit | `relief-rules` est pure (sans I/O) : la lecture du blob et l'exclusion passent par `relief-app`. |
| A02 Règles et `relief check` | découpé | La partie calcul (A02a) et la sous-commande sans fenêtre (A02b, bloquée par Z01) n'ont pas les mêmes bloquants ; C02 (`relief diff`) a disparu. |
| A03 Règles dans l'UI | réécrit | « Voir le fichier » ne peut pas ouvrir un fichier (aucun plugin fs) : le texte doit venir d'un cas d'usage. |
| X01 Mode exploration et points d'entrée | réécrit | La détection des points d'entrée doit passer par le contrat `relief-adapter-api`, pas par l'index. |
| X02 Tracé de flux | réécrit | Il consomme l'impact de R04 : bloquant à ajouter, c'est la commande `impact`. |
| X03 Churn, complexité, hotspots | réécrit | Le churn dépend de la date : il ne peut pas vivre dans le snapshot mémorisé par la `Session` ; commande à part. |
| X04 Couplage logique | réécrit | Même raison que X03 ; e2e sur la fixture `tiny` demande F06. |
| S01 Sous-graphes au-delà de 2 000 nœuds | réécrit | `budget`, `expand` et `/api/search` deviennent des champs de requête et un cas d'usage ; coût de l'IPC à mesurer. |
| S02 Benchmarks | réécrit | Il mesure `/api/snapshot` et `relief diff`, qui n'existent plus ; les dépôts clonés auront leur `.relief/`. |
| L01 Adapter Python | réécrit | Changements de vocabulaire seulement (cas d'usage, composition root), mais les critères citent `relief diff`. |

### Changements par ticket réécrit

**R04** (`.scratch/review-ui/issues/04-impact-radius.md`)

- Bloquants : retirer N09 (fait) ; garder R01, E06, T04.
- « `/api/impact` (C03) branché » devient : `Session::impact(&ImpactRequest { range, seeds: Vec<NodeId>, direction, max_depth, follow_http })` dans `relief-app` (résout la plage, prend le snapshot head, appelle `relief_diff::impact`, ajoute `out_of_diff` et `tested`), commande Tauri `impact`, méthode `ReliefApiService.impact`. Types de requête et de réponse dans `relief-model`, contrat régénéré.
- Seams : le cas d'usage sur la fixture acme-shop (6 appelants sans HTTP, 10 avec) ; Vitest pour le business ; un e2e WebdriverIO.
- Critères : « Test API » devient « test du cas d'usage `Session::impact` » (le 10/6 y est vérifié, T04 est fait). L'e2e reste le même (`SessionStore.refresh` → « 10 appelants transitifs », décocher « via HTTP » → 6), en WebdriverIO.
- Case « via HTTP » mémorisée : `localStorage` de la webview, comme les autres préférences.
- Doc : page `review` (FR et EN) ; captures par `just docs-shots review`.

**R05** (`.scratch/review-ui/issues/05-reading-order-and-seen.md`)

- Persistance : `GET/PUT /api/review/state?range=` devient `Session::review_state(range)` et `Session::set_review_state(range, state)`, commandes `review_state` et `set_review_state`. Fichier `.relief/state/review/<clé de plage>.json` (via `DataDir::state_dir()`), repli `~/.cache/relief/<repo-id>/state/` pour un dépôt bare ou en lecture seule. La clé de plage est un hash du texte de la plage (le texte contient `/` et `...`) ; le fichier garde le texte de la plage en clair. Écriture atomique (fichier temporaire puis `rename`).
- Cas sans dossier de données (tests avec `data_dir: None`) : un code d'erreur stable (par exemple `no_data_dir`) ; l'UI garde alors l'état en mémoire et le dit. À fixer dans le ticket.
- Plusieurs process sur le même dépôt : dernière écriture gagnante ; l'UI relit l'état à l'ouverture d'une plage seulement. À écrire dans le ticket.
- Critères : « Test API » devient test du cas d'usage (PUT puis GET sur une **nouvelle** `Session` du même dossier de données redonne l'état ; une autre plage n'est pas mélangée). L'e2e « reste après rechargement de la page » devient `browser.refresh()` ; l'état doit venir du disque, pas du `localStorage`.
- Seam e2e : acme-shop est construite une fois pour toute la suite. Le ticket ajoute un helper qui vide `.relief/state/` avant chaque spec, sinon la progression fuit d'un test à l'autre.
- Doc : page `review` ; mention de `.relief/state/` (le travail de relecture à garder).

**R06** (`.scratch/review-ui/issues/06-commit-order-replay.md`)

- « `/api/diff?range=<parent>..<commit>` » devient la commande `diff` avec `RangeSpec` `<parent>..<commit>` (pas de nouveau cas d'usage). Vérifier que `RangeSpec::parse` accepte bien la forme à deux points pour un commit isolé.
- Critères : « Test API : diff d'un commit isolé (snapshot) » devient test de `Session::diff` sur acme-shop (snapshot `insta`). L'e2e passe en WebdriverIO.
- Le « vu » par commit réutilise l'état de R05 (aucun nouveau fichier).
- Pas de changement de bloquant (R05).

**A01** (`.scratch/arch-rules/issues/01-config-file.md`)

- Découper la responsabilité selon les couches : `relief-rules` (domaine, pur) parse des **octets** et ne lit pas git ; `relief-app` lit le blob `relief.config.yaml` à la ref head (via `relief-git`) et le donne au parseur. Le critère « lecture depuis le blob à une ref » devient « `Session::rules(range)` renvoie les règles du head ».
- `exclude:` : l'indexeur ne connaît plus ses extracteurs et ne doit pas lire la config ; la `Session` passe l'ensemble d'exclusion à `Indexer` (option). Le cache par blob n'est pas touché, l'exclusion s'applique après lecture du cache.
- Bloquant G01 : inchangé. Ajouter N03 (fait).
- Doc `rules` : le fichier reste à la racine du dépôt, versionné ; `.relief/` est local (ADR 0007). À dire dans la page.

**A02** : voir le découpage ci-dessous.

**A03** (`.scratch/arch-rules/issues/03-rules-in-ui.md`)

- Bloquants : A02a (calcul) et R03, pas A02b.
- « Voir le fichier (YAML) » : aucun plugin fs ni shell n'est permis. La section affiche le texte du fichier dans le panneau, fourni par `Session::rules` (champ `source` du résultat) ; elle n'ouvre rien à l'extérieur.
- Le reste (arêtes rouges, badges, calque) est de l'UI pure ; e2e en WebdriverIO. Critères inchangés.

**X01** (`.scratch/explore/issues/01-explore-mode.md`)

- « Détection des points d'entrée (cœur, ajoutée au snapshot) » : routes et pages sont des faits d'un langage. Le contrat `LanguageAdapter` (et `Detector` pour les scripts du `package.json`) gagne la façon de les marquer (champ de `Extraction` ou méthode), dans `relief-adapter-api`. `relief-index` les recopie dans le snapshot (`entry: true` et type, ajouts au modèle, contrat régénéré). Aucun adapter nommé dans l'index.
- Version du format d'extraction : monter `LanguageAdapter::version()` de TS pour invalider le cache par blob.
- La bascule « Relire la PR » / « Explorer le repo » est dans l'UI ; l'exploration est le `snapshot` de HEAD (déjà une commande). Pas de nouvelle commande.
- Critères : le test de snapshot sur acme-shop reste ; l'e2e passe en WebdriverIO.

**X02** (`.scratch/explore/issues/02-flow-trace.md`)

- Ajouter R04 aux bloquants : le tracé est la commande `impact` (direction `dependencies`) de R04. Aucun nouveau cas d'usage.
- Critère e2e inchangé, en WebdriverIO.

**X03** (`.scratch/explore/issues/03-churn-hotspots-risk.md`)

- « Ajoutés aux `metrics` du snapshot » : **non**. La `Session` mémorise les snapshots des commits réels ; le churn dépend de la date du jour (90 derniers jours) et le snapshot doit rester le même pour un commit donné. Nouveau cas d'usage `Session::metrics(&MetricsRequest { range ou ref, since_days })` et commande `metrics` ; l'UI fusionne les métriques avec le snapshot. Le champ `Metrics` du modèle reste le type de réponse.
- Complexité cyclomatique : méthode du contrat `LanguageAdapter` (par fichier, octets en entrée), valeur par défaut vide. Le calcul du churn (log git, spans) est dans `relief-git` pour la lecture et dans une fonction pure de `relief-diff` ou d'un module `domain` pour le calcul.
- Cache : le résultat se range dans `.relief/cache/` (jetable), clé = HEAD + période.
- Fixture `churn` : dans `tests/fixtures/`. Test sur cette fixture via `Session::metrics`. L'e2e reste sur acme-shop (le calque teinte et la section liste 6 symboles) : pas besoin de F06.

**X04** (`.scratch/explore/issues/04-co-change.md`)

- Les arêtes `co_change` sont calculées par un cas d'usage à part, `Session::co_change(&CoChangeRequest { ref, since, seuil })`, commande `co_change`, pour la même raison que X03 (dépend de l'historique, pas d'un snapshot). Résultat jetable dans `.relief/cache/`.
- Le mode générique (dépôt sans adapter) marche sans rien de plus : la `Session` fonctionne avec zéro adapter.
- Bloquants : X03 et F06 (l'e2e « fixture `tiny` » demande de lancer l'app sur une autre fixture).
- Seuil « configurable » : dans `relief.config.yaml` (A01), pas dans un argument de CLI ; si A01 n'est pas fait, constante dans le ticket.

**S01** (`.scratch/scale/issues/01-subgraph-budget.md`)

- `budget` et `expand=<id,…>` deviennent des champs de `SnapshotRequest` et `DiffRequest` ; `/api/search` devient `Session::search(&SearchRequest { range, query, limit })` et commande `search`. Le filtrage en sous-graphe se fait dans `relief-app` (aucune règle de diff, il appelle une fonction de `relief-model` ou `relief-diff`).
- Mémoire : la `Session` garde le snapshot complet ; le sous-graphe est découpé à la demande. Le ticket mesure aussi le coût de l'IPC (sérialisation JSON de `invoke`) pour un gros snapshot ; c'est la raison d'être du budget dans une app sans HTTP.
- Critères : « test API `/api/snapshot?budget=2000` » devient test de `Session::snapshot` sur `wide` (≤ 2 000 nœuds, comptes exacts). L'e2e sur `wide` demande F06 (fixture générée, plus grosse : construction dans le harnais, pas par acme-shop).

**S02** (`.scratch/scale/issues/02-benchmarks.md`)

- `just bench` mesure des cas d'usage de `relief-app` : `Session::open` + `snapshot` (froid : `.relief/cache/` supprimé, chaud : gardé), `Session::analyse` pour la plage fixe (ancien « `relief diff` »). Plus de `/api/snapshot`. Option : une mesure de bout en bout de l'`invoke` par WebdriverIO, seulement si S01 a trouvé le coût de l'IPC significatif.
- Dépôts clonés : dans un dossier de cache du bench (`$XDG_CACHE_HOME/relief-bench/`), jamais dans un `.relief/`. Chaque clone aura son propre `.relief/` créé par la `Session` : c'est voulu, et c'est lui qu'on supprime pour une mesure à froid.
- Sortie : `docs/bench.md` ; si Z01 existe, mesurer aussi `relief-cli diff` pour la CI.
- Les budgets (< 2 s à chaud pour 5 000 fichiers ; PR de 50 fichiers < 1 s) ne changent pas.

**L01** (`.scratch/languages/issues/01-python-adapter.md`)

- `relief-lang-python` implémente `LanguageAdapter` de `relief-adapter-api` (comparateur de signatures par `compare_signatures`, textes par `symbol_signatures`) et ne dépend ni de `relief-index` ni de `relief-app`. Il se déclare à la composition root (`relief-desktop`, et `relief-cli` s'il existe).
- Critère « `relief diff` trouve la signature cassante » devient « `Session::diff` sur `py-shop` » (snapshot `insta`). La fixture va dans `tests/fixtures/py-shop`.
- Critère « aucune modification de `relief-diff` ni de `src/ui/` » : ajouter `relief-app` à la liste (sauf la composition root, une ligne), vérifié par `git diff --stat`.
- Pas d'e2e : pas besoin de F06.

### Découpage d'A02

`.scratch/arch-rules/issues/02-evaluate-and-check.md` est cassé : il cite C02 (`relief diff`, disparu) et la sortie de `relief diff` comme lieu d'affichage.

- **A02a Évaluer les règles** : `violations(config, head, diff)` (fonction pure de `relief-rules`), ajout au `GraphDiff` et à `ReviewSummary` (contrat régénéré), `Session::review_summary` les inclut. Bloqué par A01, E03. Seam : fonction pure + `Session::review_summary` sur acme-shop. Critère : 1 violation introduite (`web-sans-db`) et 1 existante (`routes-via-repos`).
- **A02b `relief check`** : sous-commande sans fenêtre qui appelle `Session::analyse` et `violations` ; `relief check [range] [--strict] [--json]`, code 0/1/2, messages en anglais, liste lisible (règle, `fichier › symbole → fichier › symbole`). Bloqué par A02a et Z01. Critères : les trois codes de sortie du ticket actuel, testés par `assert_cmd` sur une fixture. Doc : pages `rules` (job GitHub Actions) et `cli`.
- Le GitHub Actions d'exemple doit dire : clone complet (`fetch-depth: 0`, pour le merge-base) et installer `relief-cli` (voir Z01), pas l'app.
- A03 dépend d'A02a seulement.

### 2. Specs ouvertes qui citent l'ancien monde

Le `grep` donne 10 fichiers hors `archived/`. Voici le sort de chacun.

| Fichier | Quoi changer |
| --- | --- |
| `.scratch/foundations/spec.md` (ligne 8) | « harnais e2e Playwright » devient « harnais e2e WebdriverIO + `tauri-driver` ». Spec de phase 1 déjà livrée : un seul mot à changer, pas de réécriture. |
| `.scratch/index/spec.md` (ligne 14) | Cache : `<racine du dépôt>/.relief/cache/index.sqlite`, repli `~/.cache/relief/<repo-id>/` (dépôt bare ou en lecture seule), `RELIEF_CACHE_DIR` pour forcer ; renvoyer à l'ADR 0007. |
| `.scratch/map-ui/spec.md` (ligne 8) | « L'UI de `relief serve` » devient « L'UI de l'app native `relief` ». |
| `.scratch/review-ui/spec.md` (lignes 12 et 18) | Ligne 12 : « `relief serve <range>` » devient « `relief <path> <range>` » ; « branches/tags de `/api/meta` » devient « de la commande `meta` ». Ligne 18 : déjà à jour sur `.relief/state/review/`, mais « via l'API » devient « via `Session::review_state` et la commande Tauri » ; le repli `~/.cache/relief/` y est cité comme repli, c'est correct. Ajouter les mentions « Décisions : impact » (cas d'usage `impact`). |
| `.scratch/cli/spec.md` | Voir la section 4. |
| `.scratch/native-app/spec.md` | Les mentions viennent de la section décrivant l'ancien monde (ce qu'on retire) : c'est voulu, on les garde. Ajouter à « Hors périmètre » un renvoi vers « Décisions de N09 » une fois l'accord donné. |
| `.scratch/native-app/issues/09-evaluate-roadmap.md` | Ce ticket cite les termes à titre de critère : pas à changer (il sera archivé). |
| `.scratch/review-ui/issues/04-impact-radius.md`, `05-...`, `06-...` | Réécrits comme ci-dessus. |
| `.scratch/arch-rules/issues/02-evaluate-and-check.md` | Découpé en A02a et A02b (fichiers `02a-evaluate-rules.md` et `02b-relief-check.md`) ; supprimer l'ancien. |
| `.scratch/scale/issues/01-subgraph-budget.md`, `02-benchmarks.md` | Réécrits comme ci-dessus. |
| `.scratch/ROADMAP.md` | Les lignes cochées des phases 4 et 6 citent `relief serve` et Playwright : ce sont des titres de tickets archivés, gardés. Le reste est mis à jour en section 5. |

Hors `.scratch` mais à noter : `docs/product/BRAINSTORM.md` (ligne 154) cite encore `~/.cache/relief/<repo-id>/index.sqlite` comme emplacement du cache. C'est un document de cadrage, pas une spec ouverte ; une ligne de renvoi vers l'ADR 0007 suffit.

### 3. Points reportés

| Point | Sort | Raison |
| --- | --- | --- |
| Sous-commande `relief check` (A02) | **Ticket Z01** (prérequis) puis A02b | La CI ne doit pas dépendre d'une fenêtre. Voir ci-dessous. |
| Sous-commande `relief diff` | Dans Z01 | Même squelette que `check`, quasi gratuit (`Session::analyse` existe), utile en script et en log de CI (`--json`). |
| Sous-commande `relief show` | Plus tard | Plus de jalon qui la demande ; l'UI montre le snapshot. À reprendre si un script en a besoin. |
| Détachement du terminal, `--wait` | Plus tard | `relief` au premier plan est correct pour l'usage actuel. Le `--wait` ne sert que pour `git difftool` ou un éditeur : à traiter avec l'intégration éditeur. |
| Instance unique | Plus tard | ADR 0006 : un process, un dépôt, une fenêtre. SQLite en WAL gère le multi-process. Seul risque connu : l'état « vu » (R05), traité par l'écriture atomique. |
| Paquets `.deb` et AppImage | Plus tard (ticket « Paquets Linux » à créer au moment de la v1) | `tauri build` sait le faire ; c'est de la diffusion, qui compte quand on partage à d'autres (BRAINSTORM : « usage perso d'abord »). Les e2e tournent déjà sous Linux. |
| Paquets `.dmg` et `.msi` | Plus tard, sans ticket | `tauri-driver` ne tourne pas sous macOS : aucun e2e possible ; pas de machine pour tester. À reprendre si quelqu'un en demande. |
| Surveillance du working tree | **Ticket W01** réduit, sans événement poussé | Pour « relire ce que l'IA vient d'écrire », un bouton « Recharger » et un rechargement à la prise de focus de la fenêtre suffisent. La `Session` recalcule déjà le working tree à chaque demande. UI seule. |
| Événements poussés par le cœur (progression, working tree modifié) | Plus tard | Utile seulement si S02 montre une indexation à froid longue. Un watcher devra ignorer `.relief/` et `.git/` (ADR 0007). À rouvrir avec les chiffres de S02. |
| Serveur MCP | Plus tard (garder la ligne) | Il demande un binaire sans fenêtre : on le fera sur le squelette de Z01, dans `src/interfaces/relief-mcp`, au-dessus de `relief-app`, quand impact, ordre de lecture et règles sont là (R04, E07, A02a). |
| Extension VS Code | Plus tard, après MCP | Elle appellera `relief <path> <range>` ou le MCP ; rien à préparer maintenant. |

**Z01 : sous-commandes sans interface** (`.scratch/cli/issues/01-headless-subcommands.md`, nouvelle feature `cli/` qui existe déjà comme dossier)

- Problème : `relief` est un binaire Tauri qui lie `webkit2gtk` dynamiquement. Un `relief check` dans le même binaire démarrerait sans fenêtre, mais un runner de CI sans `webkit2gtk-4.1` ne pourrait même pas le lancer. Installer ces paquets en CI coûte du temps et de la fragilité.
- Proposition : une crate `src/interfaces/relief-cli` (bibliothèque + binaire `relief-cli`), sans Tauri, avec clap : `relief-cli diff`, puis `check` (A02b). Elle reste mince : traduit les arguments en requêtes, appelle `relief-app`, affiche, code de sortie 0/1/2. La composition root (`default_detectors()` + `TsAdapter`) y est répétée comme dans le binaire desktop ; c'est voulu (ADR 0008 : la composition root est dans le binaire). En local, `relief check` marche aussi : `relief` détecte la sous-commande avant de créer la fenêtre et appelle la bibliothèque `relief-cli`. Un seul vocabulaire pour l'utilisateur, deux binaires pour la CI.
- Alternative, plus simple mais pire pour la CI : dispatch dans `relief-desktop` seulement, sans nouvelle crate. À prendre si l'utilisateur ne veut pas de deuxième binaire (question 1).
- Seams : `assert_cmd` sur `relief-cli` et une fixture (codes de sortie, sortie texte, `--json`) ; `layers.rs` vérifie que `relief-cli` ne dépend pas de `tauri`.
- Options : `--repo` abandonnée au profit d'un argument `[path]` comme `relief` ; `--no-cache` (CI : pas de `.relief/` dans un clone jetable) ; `--json` ; messages en anglais.
- Doc : page `cli` (FR et EN) gagne `relief diff` et `relief-cli`.
- Place : tête de la phase 8. Bloqué par N09 seulement. Peut aussi passer avant la phase 7 si la CI est voulue plus tôt.

**F06 : e2e, choisir la fixture par spec** (`.scratch/foundations/issues/06-e2e-fixture-per-spec.md`)

- `tests/e2e/wdio.base.ts` construit acme-shop une fois et lance l'app dessus. Il faut pouvoir demander `tiny`, `wide` (générée), `churn` par spec (une session par spec existe déjà). Helper pour vider `.relief/state/` (utile à R05 aussi).
- Place : avant X04 et S01 ; bloqué par N09.

**W01 : recharger quand le working tree change** (`.scratch/review-ui/issues/08-reload-worktree.md`)

- Bouton « Recharger » et rechargement à la prise de focus de la fenêtre, pour les plages qui touchent le working tree ou l'index. Aucun événement poussé, aucun watcher. Seam : business Vitest + un e2e (modifier un fichier de la fixture, revenir, voir le changement).
- Place : après R07 (jalon E). Bloqué par R01, R07.

### 4. Le sort de `.scratch/cli/spec.md`

**Réécrit, pas archivé.** Le texte actuel décrit `relief serve`, axum, `rust-embed` et `/api` : tout cela a disparu. Mais Z01 et A02b ont besoin d'une spec pour les sous-commandes.

- Archiver l'ancien texte tel quel sous `.scratch/archived/cli/spec-serve.md` (`git mv`), pour l'histoire des tickets archivés de `archived/cli/issues/`.
- Écrire un nouveau `.scratch/cli/spec.md`, court : sous-commandes sans fenêtre au-dessus de `relief-app` ; `diff` et `check` ; options `[path]`, `[range]`, `--json`, `--strict` (`check`), `--no-cache` ; codes de sortie 0 (rien), 1 (problème trouvé), 2 (erreur d'usage ou dépôt invalide) ; messages en anglais ; aucune fenêtre ni réseau ; décision du binaire (question 1) ; `show` hors périmètre.
- Si l'utilisateur refuse Z01 (question 1, option « rien »), archiver sans réécrire et mettre `check` en `wontfix` pour la CI.

### 5. Ordre proposé après la phase 6

Changements par rapport à l'ordre actuel en gras.

**Phase 7 : relire une PR (suite)**

| # | Ticket | Changement |
| - | --- | --- |
| 38 | R04 Rayon d'impact | réécrit ; N09 retiré des bloquants |
| 39 | E07 Ordre de lecture | inchangé |
| 40 | R05 Ordre de lecture et « vu » | réécrit |
| 41 | R06 Ordre par commit | réécrit |
| 42 | R07 Focus PR et calques | inchangé ; **Jalon E** |
| **42a** | **W01 Recharger le working tree** | **nouveau**, après R07 |

**Phase 8 : règles d'architecture**

| # | Ticket | Changement |
| - | --- | --- |
| **43a** | **Z01 Sous-commandes sans interface** | **nouveau**, en tête ; bloqué par N09 |
| 43 | A01 Lecture de `relief.config.yaml` | réécrit |
| 44a | A02a Évaluer les règles | **découpé** ; bloqué par A01, E03 (plus C02) |
| 44b | A02b `relief check` | **découpé** ; bloqué par A02a, Z01 |
| 45 | A03 Règles dans l'UI | réécrit ; bloqué par A02a, R03 ; **Jalon F** garde « en carte et en CI » (A02b) : A03 ne passe le jalon qu'avec A02b fait |

**Phase 9 : explorer un repo inconnu**

| # | Ticket | Changement |
| - | --- | --- |
| 46 | X01 | réécrit |
| 47 | X02 | réécrit ; **bloqué en plus par R04** |
| 48 | X03 | réécrit |
| **48a** | **F06 e2e par fixture** | **nouveau**, avant X04 |
| 49 | X04 | réécrit ; **bloqué en plus par F06** ; **Jalon G** |

**Phase 10 : passage à l'échelle.** S01 (réécrit ; **bloqué en plus par F06**), puis S02 (réécrit). Ordre inchangé. Option à discuter : faire un premier relevé de S02 avant S01 pour savoir si le budget de 2 000 nœuds est le bon (non retenu : S02 est bloqué par S01 dans ce plan).

**Phase 11 : second langage.** L01 réécrit. Inchangé en place. **Jalon H : relief v1.**

**Plus tard** (ligne de la roadmap « Intégration au terminal… » remplacée par) :

- Sous-commande `relief show`.
- Détachement du terminal et `--wait` ; instance unique.
- Paquets Linux (`.deb`, AppImage) à la v1 ; `.dmg` et `.msi` sur demande.
- Surveillance du working tree et événements poussés (à rouvrir avec S02).
- Serveur MCP (sur le squelette de Z01), puis extension VS Code.
- Le reste de la liste actuelle est inchangé (SCIP, Go, CI GitHub Actions, multirepo, git notes, résumés IA). La ligne CI y reste : A02b en écrit l'exemple, l'installation du dépôt lui-même en CI reste à faire (`just lint`, `just test`, `just e2e` sous Xvfb).

### 6. Questions à l'utilisateur

1. **Où vit `relief check` ?** Recommandation : crate `relief-cli` séparée, sans Tauri (CI sans `webkit2gtk`), et `relief check` en local qui l'appelle depuis le binaire desktop. Alternative : dispatch dans `relief-desktop` seulement (plus simple, mais la CI doit installer `webkit2gtk-4.1`). Choisir change le ticket Z01 et la doc de la CI.
2. **Faut-il rétablir `relief diff` en ligne de commande (dans Z01) ?** Recommandation : oui, c'est gratuit avec le squelette de `check` ; `show` reste « Plus tard ».
3. **Les paquets (`.deb`, AppImage) sont-ils nécessaires avant la v1 ?** Recommandation : non, Plus tard ; on installe par `cargo install` comme la doc « Commencer » le dit. Si oui : ticket « Paquets Linux » en phase 11, avant L01.
4. **Le rechargement du working tree (W01) suffit-il, sans surveillance de fichiers ?** Recommandation : oui (bouton et rechargement au focus) ; un watcher seulement si on le sent manquer à l'usage.

## Décisions de l'utilisateur (2026-11-20)

1. **Plus de CLI, uniquement l'app** : la seule commande est `relief [path] [range]`, qui ouvre l'app. Z01 n'est pas créé. Conséquences tirées par l'orchestrateur : `relief check` en CI est abandonné (pas seulement reporté) ; A02 n'est pas découpé, il devient « Évaluer les règles » (violations introduites ou existantes, exposées par un cas d'usage `relief-app` et une commande Tauri) sans `relief check` ; A03 montre les violations dans la carte ; le **Jalon F** devient « les violations d'architecture visibles dans la carte » ; `.scratch/cli/spec.md` est archivé tel quel (`.scratch/archived/cli/spec.md`), sans réécriture ; la ligne « Plus tard » ne garde aucune sous-commande.
2. `relief diff` en ligne de commande : non (couvert par 1).
3. **Paquets Linux avant la v1** : nouveau ticket P01 « Paquets `.deb` et AppImage » (bundler Tauri, `just package`, doc d'installation FR/EN), juste avant le Jalon H, qui passe sur P01 ; `.dmg` et `.msi` restent « Plus tard ».
4. **W01 suffit** (bouton « Recharger » et rechargement à la prise de focus), sans surveillance de fichiers ; surveillance et événements poussés restent « Plus tard ».

## Appliqué

Les décisions de l'utilisateur priment sur la proposition : pas de CLI, donc ni Z01, ni `relief check`, ni découpage d'A02.

- R04 : réécrit (cas d'usage `Session::impact`, commande `impact`, e2e WebdriverIO ; N09 retiré des bloquants).
- E07 : inchangé (aucune mention de l'ancien monde).
- R05 : réécrit (`review_state` / `set_review_state`, état dans `.relief/state/review/`, reset de l'état entre specs).
- R06 : réécrit (commande `diff` sur `<parent>..<commit>`, tests du cas d'usage).
- R07 : inchangé.
- A01 : réécrit (`relief-rules` pure, lecture du blob par `relief-app`, `exclude` passé à l'indexeur ; bloqué en plus par N03).
- A02 : réécrit, non découpé, devenu « Évaluer les règles » (`Session::review_summary`, sans `relief check`).
- A03 : réécrit (« Voir le fichier » via `Session::rules` ; Jalon F sans CI).
- X01 : réécrit (points d'entrée par le contrat `relief-adapter-api` ; bloqué en plus par N02).
- X02 : réécrit (commande `impact` ; bloqué en plus par R04).
- X03 : réécrit (`Session::metrics` hors du snapshot, résultat dans `.relief/cache/`).
- X04 : réécrit (`Session::co_change` ; bloqué en plus par F06).
- S01 : réécrit (`budget` et `expand` dans les requêtes, `Session::search`, mesure de l'IPC ; bloqué en plus par F06).
- S02 : réécrit (mesure des cas d'usage de `relief-app`, clones hors des `.relief/`).
- L01 : réécrit (`LanguageAdapter` de `relief-adapter-api`, `Session::diff`, fixture sous `tests/fixtures/`).
- Nouveaux : F06 (`foundations/issues/06-e2e-per-fixture.md`), W01 (`review-ui/issues/08-reload-worktree.md`), P01 (`packaging/issues/01-linux-packages.md` et `packaging/spec.md`).
- `.scratch/cli/spec.md` : archivé tel quel dans `.scratch/archived/cli/spec.md`.
- Specs mises à jour : `foundations`, `index`, `map-ui`, `review-ui`, `arch-rules`, `explore`, `scale`, `languages` ; ligne de renvoi dans `docs/product/BRAINSTORM.md`.
- ROADMAP : phases 7 à 11, W01 en 42a, F06 en 48a, P01 en 53 avec le Jalon H, Jalon F reformulé, « Plus tard » sans sous-commande ; la ligne de N09 reste non cochée.

## Answer

- 15 tickets relus : E07 et R07 inchangés ; R04, R05, R06, A01, A02 (sans `relief check`), A03, X01 à X04, S01, S02, L01 réécrits pour l'app native, `relief-app`, les commandes Tauri, WebdriverIO et `.relief/`. Nouveaux : W01 (recharger le working tree), F06 (e2e par fixture), P01 (paquets `.deb` et AppImage, Jalon H).
- Décisions de l'utilisateur : plus de ligne de commande du tout (seulement `relief [path] [range]`), donc `relief check` en CI abandonné et Jalon F « dans la carte » ; paquets Linux avant la v1 ; W01 sans surveillance de fichiers.
- `.scratch/cli/spec.md` archivé ; specs ouvertes nettoyées ; `.scratch/ROADMAP.md` réordonné (phases 7 à 11, « Plus tard », abandons) ; `docs/product/BRAINSTORM.md` renvoie à l'ADR 0007.
- Vérifié : le grep `/api/|relief serve|Playwright|relief-server|relief-cli` hors archives ne trouve plus que la spec native-app (qui décrit le retrait), ce ticket et l'historique de la roadmap. Pas de code touché, pas de suite à relancer.
