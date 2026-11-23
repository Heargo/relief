# Ordre de développement

Status: proposed (2026-11-18)

Tickets répartis en 17 features, chacune avec son code : `foundations/` (F), `graph-model/` (M), `git-source/` (G), `detectors/` (D), `lang-ts/` (T), `index/` (I), `diff-engine/` (E), `cli/` (C), `map-ui/` (U), `review-ui/` (R), `arch-rules/` (A), `explore/` (X), `scale/` (S), `languages/` (L), `native-app/` (N), `packaging/` (P), `multi-repo/` (K). `G02` = `.scratch/git-source/issues/02-*.md`.

L'ordre suit les lignes `Blocked by:`, et à l'intérieur :

1. **Un jalon utilisable le plus tôt possible**, en ligne de commande d'abord : relief doit marcher sur n'importe quel dépôt git avant de savoir lire le TypeScript.
2. **Le risque technique d'abord** : lecture git sans checkout, parsing tree-sitter et diff de graphes valident l'idée avant toute UI.
3. **Le cœur avant l'UI** : l'UI affiche ce que le cœur calcule ; chaque écran arrive quand ses données existent.
4. **Une seule fixture pour tout** : acme-shop (le faux repo de la maquette) sert aux tests d'intégration, aux tests e2e et aux captures de la doc.

Le prochain ticket est la première ligne non cochée dont tous les bloquants sont cochés. Cocher la ligne fait partie de l'étape 9 de `docs/dev/workflow.md`.

## Phase 1 : fondations

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 1 | **F01** Bootstrap du dépôt | git, workspace cargo, UI Angular, `just` : sans ça, pas de workflow. | aucun |
| ✓ | 2 | **M01** Types du graphe et ids stables | Le vocabulaire commun de toutes les crates. | F01 |
| ✓ | 3 | **F02** Constructeur de dépôts de fixture | Git n'est jamais mocké : tous les tests git en dépendent. | F01 |
| ✓ | 4 | **F03** Fixture acme-shop | La fixture de référence (maquette + PR #142) ; les critères des tickets suivants s'y réfèrent. | F02 |
| ✓ | 5 | **G01** Lire un dépôt : refs, arbres, blobs | Premier contact avec gix : le risque « lire sans checkout ». | F02 |
| ✓ | 6 | **D01** Detector générique | Le mode « n'importe quelle codebase ». | M01 |
| ✓ | 7 | **I01** Snapshot d'un commit | Assemble git + detector en graphe. | G01, D01 |
| ✓ | 8 | **C01** `relief show` | **Jalon A : `relief show` marche sur n'importe quel dépôt git** (dossiers et fichiers). | I01 |

## Phase 2 : TypeScript

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 9 | **D02** Detector npm, pnpm et yarn workspaces | Les systèmes d'un monorepo JS ; la table des packages sert à résoudre les imports. | D01 |
| ✓ | 10 | **T01** Symboles TS/TSX | Le risque « tree-sitter » ; les hashes de corps et de signature conditionnent tout le diff. | M01 |
| ✓ | 11 | **T02** Imports et résolution de modules | Les arêtes qui comptent le plus pour l'architecture. | T01, D02, I01 |
| ✓ | 12 | **T03** Appels, rendus JSX et références | Les arêtes fines dont l'impact a besoin. **Jalon B : la carte complète d'un dépôt TS en JSON.** | T02 |
| ✓ | 13 | **I02** Cache par blob | Avant le diff, qui indexe deux commits à chaque appel. | I01, T01 |

## Phase 3 : diff

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 14 | **G02** Plages, diff d'arbres et log | Merge-base, renommages, commits d'une plage. | G01 |
| ✓ | 15 | **G03** Commits virtuels | Relire ce que l'IA vient d'écrire avant de committer. | G02 |
| ✓ | 16 | **E01** Diff des nœuds | Le cœur du produit. | M01 |
| ✓ | 17 | **E03** Diff des arêtes et nouveaux couplages | « Le signal clé » du brainstorm. | E01 |
| ✓ | 18 | **E02** Diff des signatures | Cassante ou compatible, avec une raison calculée. | E01, T01 |
| ✓ | 19 | **E04** Déplacements et renommages | Sans lui, un déplacement ressemble à une suppression + un ajout + un faux couplage. | E03, G02 |
| ✓ | 20 | **E05** Reformatage seul | Retire le bruit du diff. | E01 |
| ✓ | 21 | **C02** `relief diff` | **Jalon C : `relief diff main...feature` dit ce qui a bougé structurellement.** | C01, E02, E04, E05, G03 |

## Phase 4 : la carte

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 22 | **M02** Contrat JSON et types TS générés | L'UI ne doit jamais réécrire les types à la main. | M01, E01 |
| ✓ | 23 | **C03** `relief serve` et l'API HTTP | Le pont vers l'UI. | C02, M02 |
| ✓ | 24 | **F04** Harnais e2e Playwright | Avant le premier écran, pour que chaque ticket d'UI ait son test e2e. | C03 |
| ✓ | 25 | **F05** Site de doc utilisateur et captures | Avant les écrans aussi : chaque ticket d'UI met sa page à jour. | F04 |
| ☑ | 26 | **U01** Coquille de l'UI | Panneaux redimensionnables, i18n, thème, client d'API. | C03, F04 |
| ☑ | 27 | **U02** Carte imbriquée et zoom sémantique | La décision UX centrale (boîtes qui s'ouvrent seules). | U01 |
| ✓ | 28 | **C04** Installation et premiers pas | **Jalon D : `relief serve` montre la carte de n'importe quel dépôt**, documenté. | F05, U02 |
| ☑ | 29 | **U03** Arêtes agrégées | Les dépendances visibles à chaque niveau. | U02 |
| ☑ | 30 | **U04** Disposition « moins de croisements » | Décidé à la revue de la maquette (197 → 60 croisements). | U03 |
| ✓ | 30b | **D03** Modules dans les packages d'un workspace, label par le chemin | Débloque U05 (fil d'Ariane `apps/api › auth/`). | D02 |
| ☑ | 31 | **U05** Recherche, fil d'Ariane et raccourcis | Navigation dans un vrai dépôt. | U02 |
| ☑ | 32 | **U06** Panneau d'un nœud | Le niveau 4 : le code. | U03 |
| ✓ | 32a | **U07** Barre du haut conforme à la maquette | `relief .` : contrôles Optimus non thémés, à ~16 px, plage et recherche hors maquette. | U01, U05 |
| ✓ | 32b | **U08** Panneau gauche conforme à la maquette | Sections, calques en interrupteurs, disposition sans chiffres de mise au point, bascule de mode. | U07 |
| ✓ | 32c | **U09** Étiquettes d'arêtes et en-têtes conformes | Des centaines de pastilles numérotées couvrent la carte ; libellés tronqués. | U03 |
| ✓ | 32d | **U10** Carte lisible à tous les niveaux de zoom | `relief .` sur relief : en-têtes superposés et libellés coupés aux zooms intermédiaires (dossiers imbriqués). | U09 |
| ✓ | 32e | **U11** Thème Optimus et contrôles de la barre du haut | Aucun preset Optimus : la liste de la plage s'affiche en texte nu ; plage vide sans `range` ; « Recharger » natif. | U07 |
| ✓ | 32f | **U12** Contrôles des panneaux conformes | Ordre de lecture et impact : boutons hors du style `.seg` / `.iconbtn`. | U08, U11 |
| ✓ | 32g | **U13** Masquer les dépendances externes | Les paquets tiers et leurs arêtes encombrent la carte ; interrupteur actif par défaut. | U08 |
| ✓ | 32h | **U14** Zoom : ouverture à la largeur, titre en étiquette sur le bord | U10 garde trop longtemps les modules fermés ; retour au zoom d'avant sans en-têtes recouverts (maquette v2, option A). | U10 |
| ✓ | 32i | **U15** Barre du haut : un bouton Paramètres | Thème, langue, raccourcis et doc dans un seul menu. | U11 |
| ✓ | 32j | **U16** Panneau gauche : outils du mode, puis affichage | Le panneau mêle tout ; la bascule de mode reste en haut. | U12 |
| ✓ | 32k | **U17** Panneau droit : inspecteur avec badge Nœud / Arête | On ne sait pas ce que montre le panneau droit. | U16 |
| ✓ | 32l | **U18** Les arêtes du nœud sélectionné ressortent | Ses arêtes se confondent avec les autres. | U09 |
| ✓ | 32m | **U19** Barre du haut : choisir base et head | Comparer deux branches ou deux commits quelconques ; commande `log` côté cœur. | U15 |
| ✓ | 32n | **U20** Inspecteur d'arête : les utilisations dans le code | Où et comment A se sert de ce qu'il importe de B. | U17 |
| ✓ | 32o | **U21** Utilisations d'arête : imports par défaut et `* as` | Ils affichaient « jamais utilisé » ; résolus comme à l'indexation (workspace compris). | U20 |
| ✓ | 32p | **U22** Un fichier ajouté n'apparaît pas sur la carte | Bug (retour du 2026-11-20). | aucun |
| ✓ | 32q | **U23** Choix base / head : quelle est la référence ? | On ne sait pas dans quel sens se lit la comparaison ; maquette d'abord. | U19 |
| ✓ | 32r | **U24** Masquer les dépendances internes du nœud sélectionné | Elles encombrent la sélection ; masquées à la sélection. | U18 |

## Phase 5 : relire une PR

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ☑ | 33 | **R01** Calque de diff sur la carte | Le diff sur la carte : la promesse du produit. | U03, C03, E04, E05 |
| ☑ | 34 | **R02** Panneau de diff structurel | Lire le code là où il faut. | R01, E02 |
| ☑ | 35 | **E06** Rayon d'impact et tracé de flux | Données de la vue d'ensemble et de l'impact. | E03 |
| ☑ | 36 | **R03** Vue d'ensemble et signaux | Ce que la PR change, sans IA. | R01, E06 |
| ☑ | 37 | **T04** Arêtes HTTP | L'impact traverse les services (décidé : oui, désactivable). | T03 |

## Phase 6 : refonte, app native et architecture propre

`relief <path>` ouvre une app native (Tauri) au lieu de `relief serve` ; une couche application, des sources rangées par couche sous `src/`, les données d'un dépôt dans son `.relief/`. ADR 0006, 0007, 0008 ; spec `.scratch/native-app/spec.md`.

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 37a | **N01** Arborescence par couches sous `src/` | Un déplacement sans code d'abord, pour que la suite s'écrive aux bons endroits. | aucun |
| ✓ | 37b | **N02** Contrats des extracteurs dans `relief-adapter-api` | Les adapters ne dépendent plus de l'index. | N01 |
| ✓ | 37c | **N03** Couche application `relief-app` et `Session` | Les cas d'usage hors du transport : la base de l'app native. | N02 |
| ✓ | 37d | **N04** Données du dépôt dans `.relief/` | Le cache et l'état « vu » (R05) vivent avec le dépôt. | N03 |
| ✓ | 37e | **N05** App Tauri : `relief <path>` ouvre la carte | Le nouveau point d'entrée. | N03 |
| ✓ | 37f | **N06** e2e et captures de doc sur l'app native | Avant de retirer HTTP, pour ne jamais rester sans e2e. | N05 |
| ✓ | 37g | **N07** Retirer le mode HTTP | Une seule façon de lancer relief. | N06 |
| ✓ | 37h | **N08** Doc utilisateur dans l'app | **Jalon : `relief <path>` ouvre l'app native, documentée.** | N07 |
| ✓ | 37i | **N09** Réévaluer les tickets restants | Les tickets suivants ont été écrits pour HTTP et Playwright. | N04, N08 |

## Phase 7 : relire une PR (suite)

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 38 | **R04** Rayon d'impact dans l'UI | « Qui appelle ce qui a changé ». Cas d'usage `Session::impact` et commande `impact`. | R01, E06, T04 |
| ✓ | 39 | **E07** Ordre de lecture | Données des trois modes de lecture. | E03, E04, G02 |
| ✓ | 40 | **R05** Ordre de lecture (fichier, symbole) et « vu » | Le parcours de relecture, progression persistante. | R01, E07 |
| ✓ | 41 | **R06** Ordre par commit et rejeu | Décidé à la revue de la maquette. | R05 |
| ✓ | 42 | **R07** Focus PR et calques | **Jalon E : relire la PR #142 d'acme-shop comme dans la maquette, sur un vrai dépôt.** | R01 |
| ✓ | 42a | **W01** Recharger quand le working tree change | Relire ce que l'IA vient d'écrire : bouton et rechargement au focus, sans surveillance de fichiers. | R01, R07 |

## Phase 8 : règles d'architecture

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 43 | **A01** Lecture de relief.config.yaml | Les règles et les exclusions ; `relief-rules` pure, lecture du blob par `relief-app`. | G01, N03 |
| ✓ | 44 | **A02** Évaluer les règles | Introduites vs existantes, par `Session::review_summary` ; pas de sous-commande, relief ne s'utilise que par l'app. | A01, E03 |
| ✓ | 45 | **A03** Règles dans l'UI | **Jalon F : les violations d'architecture visibles dans la carte.** | A02, R03 |

## Phase 9 : explorer un repo inconnu

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 46 | **X01** Mode exploration et points d'entrée | Le second usage du brainstorm ; les points d'entrée passent par le contrat des adapters. | U06, R01, N02 |
| ✓ | 47 | **X02** Tracé de flux | Suivre une requête de bout en bout. | X01, E06, R04 |
| ✓ | 48 | **X03** Churn, complexité, hotspots, risque | Où regarder en premier. | X01, G02, T01 |
| ✓ | 48a | **F06** e2e : choisir la fixture par spec | Les e2e de `tiny` et `wide` ; un état « vu » propre entre specs. | N09 |
| ✓ | 49 | **X04** Couplage logique (co-change) | Des arêtes pour **n'importe quel langage**, même sans adapter. **Jalon G : comprendre un repo inconnu.** | X03, F06 |

## Phase 10 : passage à l'échelle et performances

Brainstorm du 2026-11-20 : la carte rame sur un gros écran et les budgets de S02 ne sont pas tenus. Décisions dans `scale/spec.md` (« Phase 10 »). Mesurer avant d'optimiser : S05 fixe le budget de rendu.

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 50 | **S01** Sous-graphes au-delà de 2 000 nœuds | Les monorepos. | R01, I02, F06 |
| ✓ | 50a | **S03** Relecture d'un gros dépôt : l'UI lit le sous-graphe de relecture | Suite de S01 : les changés visibles sans zoom, budget IPC aussi en relecture. | S01 |
| ✓ | 51 | **S02** Benchmarks sur de vrais dépôts | Des budgets mesurés, pas supposés. | S01 |
| ✓ | 51a | **S04** Garder l'index de fichier en cache | Suite de S02 : les budgets à chaud et de diff ne sont pas tenus faute de cet index en cache. | S02 |
| ✓ | 51b | **S05** Mesurer le rendu de la carte | La carte rame sur un gros écran ; fixture `dense`, `just bench-ui` et budget de rendu. | S02 |
| ✓ | 51c | **S06** Caméra en un seul transform | Un pan ne recalcule plus rien ; le zoom recalcule au repos. | S05 |
| ✓ | 51d | **S07** Ne recalculer à chaque frame que ce qui suit la caméra | Modes, état des arêtes, emphase et étiquettes recalculés à chaque frame. | S05 |
| ✓ | 51e | **S08** Arêtes : hors de la vue et niveau de détail | Toutes les arêtes du niveau sont dans le DOM. | S06 |
| ✓ | 51f | **S09** Disposition et croisements hors du thread principal | Seulement si S05 trouve une longue tâche au chargement. | S05 |
| ✓ | 51g | **S10** Indexation parallèle | Indexation mono-thread : n8n 54 s à froid. | S04 |
| ✓ | 51h | **S11** Analyse incrémentale d'une plage | Diff d'une PR : 3,1 s et 65 s pour un budget de 1 s. | S04 |
| ✗ | 51i | **S12** Afficher la carte avant la fin de l'indexation | Seulement si un gros dépôt reste lent à froid après S10 et S11. | S10, S11 |
| ✓ | 51j | **S13** Sélection sous le budget | Mesure après S07 : ~160 ms pour 100, surtout hors marques (panneau, style). | S07 |
| ✓ | 51k | **S14** Refondre le rendu de la carte : canvas, WebGL ou autre | Après S08, le zoom (41 à 204 ms) et la sélection (~160 ms) restent hors budget : limite du DOM + SVG ; spike et ADR d'abord. | S08 |
| ✓ | 51l | **S15** API de scène de la carte, indépendante du moteur | Les e2e lisent le DOM de la carte, que le Canvas n'aura plus (ADR 0009). | S14 |
| ✓ | 51m | **S16** Migrer les e2e et les captures sur l'API de scène | ~29 specs et 2 captures lisent encore `map-node` / `map-edge`. | S15 |
| ✓ | 51n | **S17** Peintre Canvas : caméra, boîtes et texte | Premier morceau du moteur Canvas, à côté du DOM. | S15 |
| ✓ | 51o | **S18** Peintre Canvas : arêtes, étiquettes et co-changements | Parité des arêtes avec le SVG. | S17 |
| ✓ | 51p | **S19** Interactions sur le canvas : clic, survol, infobulles, clavier | Hit-testing par géométrie ; toute la suite e2e en Canvas. | S18, S16 |
| ✓ | 51q | **S20** Canvas seul rendu de la carte | Retrait du DOM de la carte ; budgets mesurés. | S19 |
| ✓ | 51r | **S21** Arêtes au franchissement de seuil sous une frame | 25 à 35 ms de calcul d'arêtes au seuil : 60 fps au zoom. | S20 |
| ✓ | 51s | **S22** Étiquettes d'arête sous une frame | Reste de S21 : ~20 ms p95 au zoom de `dense`, placement des étiquettes. | S21 |
| ☐ | 51t | **S23** `analyse` d'un très gros dépôt sous le budget | Reste de S11 : n8n 5,7 s pour 1 s ; base reconstruite, détecteur, `diff_graphs`. | S11 |

## Phase 11 : second langage et paquets

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ✓ | 52 | **L01** Adapter Python | Valide l'abstraction multi-langage. | T03, E02, I02 |
| ✓ | 53a | **D04** Fichiers hors système en dossiers, fixtures ignorées | `relief .` sur relief : une fixture `pyproject.toml` devient le système et tout le reste est à plat. | D03, L01 |
| ✓ | 53 | **P01** Paquets `.deb` et AppImage | Installer relief sans compiler (`tauri build`). **Jalon H : relief v1.** | L01 |
| ✓ | 53c | **P02** Construire et installer en une commande, sans admin | `./install.sh` : build Docker de la branche courante, installation dans le dossier de l'utilisateur, OS détecté. | P01 |
| ☐ | 53b | **N10** Icône cassée dans le gestionnaire de tâches | Icône générique sous KDE/Wayland (`app_id` ≠ `relief.desktop` ?). | aucun |

## Phase 12 : multirepo (nouvelles fonctionnalités)

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ☐ | 54 | **K01** Cadrer le multirepo | Un changement full stack sur plusieurs dépôts ; un niveau « dépôt » au-dessus du système. Spec `.scratch/multi-repo/spec.md`. | aucun |

## Phase 13 : confort de relecture (nouvelles fonctionnalités)

Brainstorm du 2026-11-20 (`quicknotes.md`) : en relecture on se perd dans les dépendances transitives, on veut garder ce qu'on pense en lisant et ranger la carte et les panneaux à sa main. Décisions dans `review-ui/spec.md` (« Phase 13 »). Volontairement en dernier : polir l'existant avant d'ajouter des fonctionnalités.

| ✓ | # | Ticket | Pourquoi maintenant | Bloqué par |
| - | - | --- | --- | --- |
| ☐ | 55 | **R09** Notes de relecture ancrées sur la carte | Garder ce qu'on pense en lisant ; note, question, à corriger. | R05 |
| ☐ | 56 | **R11** Suivre les dépendances transitives sans se perdre | Où suis-je, revenir à l'entrée en cours, « vérifié » hors diff. | R05, R04 |
| ✓ | 57 | **U25** Historique de navigation : précédent / suivant | Revenir au nœud d'avant après avoir suivi des arêtes. | U05 |
| ☐ | 58 | **R12** Profondeur du rayon d'impact sur la carte | Un symbole très utilisé rend toute la carte orange. | R04 |
| ☐ | 59 | **R15** Diff lisible : coloration et contexte | Le diff n'est pas coloré, son contexte est fixe. | R02 |
| ☐ | 60 | **R14** Naviguer depuis le code | Un appel dans le diff n'est que du texte. | R02, U20 |
| ☐ | 61 | **R13** Chemin entre deux nœuds | « Pourquoi A dépend de B » sans suivre les arêtes une à une. | E06 |
| ☐ | 62 | **U27** Masquer des éléments de la carte | Modules générés ou d'outillage qui encombrent. | U13 |
| ☐ | 63 | **R10** Exporter la relecture en Markdown | Coller notes et signaux dans la PR. | R09 |
| ☐ | 64 | **U26** Mini-carte | Savoir où on est, zoomé dans un gros dépôt. | U02, S06 |
| ☐ | 65 | **U28** Ranger la carte à la main | Disposition personnelle ; maquette d'abord. | U04, U27 |
| ☐ | 66 | **N11** Détacher un panneau dans sa propre fenêtre | Multi-écran : la carte d'un côté, le code de l'autre ; maquette d'abord. | N05 |

## Plus tard (pas encore de tickets)

Dans l'ordre probable, à transformer en specs quand la v1 est là :

- Précision `resolved` par SCIP (`scip-typescript`, puis les autres indexers).
- Adapter Go, puis Java.
- CI (GitHub Actions) dès que le dépôt a un remote : `just lint`, `just test`, `just e2e` (Linux, `tauri-driver`).
- Partage d'index par `git notes` ou artefact de CI.
- Paquets `.dmg` (macOS) et `.msi` (Windows) : `tauri-driver` ne tourne pas sous macOS, à reprendre sur demande.
- Détachement du terminal (`--wait`) et instance unique pour plusieurs fenêtres.
- Surveillance du working tree et événements poussés par le cœur (progression de l'indexation) : à rouvrir avec les chiffres de S02. Elle ignorera `.relief/` et `.git/`.
- Serveur MCP (les agents IA interrogent le graphe), puis extension VS Code, puis commentaire de PR GitHub : des adapters sous `src/interfaces/`, au-dessus de `relief-app`.
- Résumés IA par nœud, ancrés dans le graphe (ADR 0005 à rouvrir).

Abandonné par la refonte (N09) : toute sous-commande en ligne de commande (`show`, `diff`, `check`), donc aussi `relief check` en CI. relief ne s'utilise que par `relief [path] [range]`.
