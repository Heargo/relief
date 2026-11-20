# 0007. Les données d'un dépôt dans son dossier `.relief/`

Status: accepted (2026-11-19, refonte ; remplace la règle « relief n'écrit jamais dans le dépôt analysé »)

## Contexte

Le cache d'index vit aujourd'hui dans `~/.cache/relief/<repo-id>/`, et relief n'écrit jamais dans le dépôt analysé. On veut que les données liées à un dépôt (cache, état de relecture, et plus tard d'autres données) vivent avec lui, à côté de son `.git` : on les trouve, on les supprime avec le dépôt, et d'autres outils pourront y lire et écrire.

## Décision

- Quand relief ouvre un dépôt, il crée `<racine du worktree>/.relief/` s'il n'existe pas :

  ```
  .relief/
  ├─ cache/          jetable : index.sqlite (extractions par blob)
  ├─ state/          à garder : « vu », progression de relecture par plage
  ├─ .gitignore      « * »
  ├─ relief.json     version du format, repo-id, version de relief qui l'a créé
  ```

- `.relief/.gitignore` contient `*` : le dossier s'ignore lui-même. relief ne modifie jamais le `.gitignore` de l'utilisateur, ni aucun fichier suivi, ni `.git/`. Il n'écrit que sous `.relief/`.
- `.relief/` est **exclu en dur** de tout ce que relief lit : le working tree (commit virtuel), l'index et les arbres des commits, même si quelqu'un l'a commité. Le futur surveillant de fichiers l'ignore aussi, sinon chaque écriture du cache déclencherait une réindexation.
- Un `.relief/` **par worktree** : dans un worktree lié (`git worktree add`), `.git` est un fichier, et `.relief/` est à côté. Le cache est alors en double, ce qui est accepté.
- **Repli** sur `~/.cache/relief/<repo-id>/` (ou `$XDG_CACHE_HOME`) quand `.relief/` est impossible : dépôt bare, dossier en lecture seule. `RELIEF_CACHE_DIR` force un dossier ; l'absence de cache reste possible pour les tests.
- `relief.json` porte un numéro de version du format. Un format plus ancien est migré ; un format plus récent que le binaire est refusé avec un message clair, sans rien écraser.
- Plusieurs process peuvent ouvrir le même dépôt : les bases SQLite sont en journal WAL avec un délai d'attente sur les verrous.
- `relief.config.yaml` (règles d'architecture) reste à la racine du dépôt, versionné : il est partagé par l'équipe, alors que `.relief/` est local.
- Le choix de l'emplacement est porté par un seul type de `relief-app`, `DataDir`.

## Conséquences

- Le premier `relief <path>` sur un dépôt y crée un dossier, invisible pour git.
- Supprimer `.relief/cache/` est toujours sans risque ; `.relief/state/` contient le travail de relecture de l'utilisateur.
- Le repo-id (hash du premier commit) ne sert plus qu'au repli et à `relief.json`.
