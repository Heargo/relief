# 0008. Une couche application et des sources rangées par couche sous `src/`

Status: accepted (2026-11-19, refonte)

## Contexte

Les couches de `docs/dev/rules.md` sont saines, mais le code s'en écarte à quelques endroits :

- Les cas d'usage (résoudre une plage, indexer, calculer le diff, textes de signatures) vivent dans `relief_server::analysis`, un module de transport ; la CLI dépend de la crate HTTP pour les appeler.
- `relief-lang-ts` dépend de `relief-index` pour le seul trait `LanguageAdapter`.
- L'adapter TS est câblé dans l'orchestration, pas dans le binaire.
- Les handlers reçoivent des `HashMap<String, String>` et refont chacun la validation.
- Chaque appel rouvre le dépôt et reconstruit les snapshots.
- La racine mélange sources, outillage, doc produit et doc développeur ; les crates sont à plat, sans que le sens des dépendances se voie.

## Décision

- **Une crate `relief-app`** porte les cas d'usage : ouvrir un dépôt (une `Session`), snapshot, diff, résumé de relecture, code d'un nœud, et la suite (impact, ordre de lecture, « vu »). Elle reçoit des requêtes typées, renvoie les types de `relief-model` ou une `AppError`, et détient `DataDir` (ADR 0007). Elle n'a aucune règle de diff propre : elle appelle les couches du dessous.
- **Une crate `relief-adapter-api`** porte les contrats des extracteurs : `LanguageAdapter`, `Detector`, `Extraction`, `LinkContext`. Les adapters et detectors dépendent d'elle et de `relief-model`, jamais de `relief-index`.
- **Une seule composition root** : le binaire (`relief-desktop`) choisit les adapters et les passe à `relief-app`. Aucune crate de bibliothèque ne choisit ses dépendances concrètes.
- **Les interfaces sont minces** : elles traduisent une entrée en requête, appellent `relief-app`, convertissent `AppError`. Aucune logique métier.
- **Pas d'abstraction à une seule implémentation.** `GitSource` reste un type concret : git n'est jamais mocké (ADR 0003), un trait n'aurait qu'une implémentation.
- **Arborescence** : toutes les sources sous `src/`, les crates rangées par couche, les tests transverses sous `tests/`, la doc sous `docs/` :

  ```
  relief/
  ├─ docs/
  │  ├─ adr/
  │  ├─ contract/
  │  ├─ dev/            rules.md, workflow.md, agents/
  │  ├─ product/        BRAINSTORM.md, maquette/
  │  ├─ user/           doc utilisateur (Starlight)
  ├─ src/
  │  ├─ domain/         relief-model, relief-diff, relief-rules (pur, sans I/O)
  │  ├─ analysis/       relief-git, relief-adapter-api, relief-detect, relief-index, lang/relief-lang-ts
  │  ├─ app/            relief-app
  │  ├─ interfaces/     relief-desktop (Tauri, binaire `relief`)
  │  ├─ ui/             Angular
  ├─ tests/
  │  ├─ e2e/            WebdriverIO + tauri-driver
  │  ├─ fixtures/       définitions des dépôts de test
  │  ├─ relief-fixtures/
  ├─ Cargo.toml  justfile  README.md  CLAUDE.md  (et les configs d'outils)
  ```

  Une dépendance d'une couche vers une couche du dessus (`domain/` vers `app/`, `analysis/` vers `interfaces/`) se voit dans le chemin et est refusée en review.

## Conséquences

- Le déplacement se fait par `git mv`, dans un commit sans changement de code, pour garder l'historique.
- Les tickets archivés gardent les anciens chemins : ce sont des archives.
- `docs/dev/rules.md`, `docs/dev/workflow.md`, `CLAUDE.md`, le `justfile` et les agents `tdd-*` suivent la nouvelle arborescence.
