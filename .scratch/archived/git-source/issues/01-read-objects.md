# Lire un dépôt : refs, arbres, blobs

Status: resolved
Type: task
Blocked by: F02
UI: non
Doc: aucune

Spec: `../spec.md`

## À faire

- `GitSource::open(path)` : trouve la racine du dépôt depuis un sous-dossier ; erreur claire hors d'un dépôt.
- `resolve(rev) -> CommitId` pour `HEAD`, branche, tag annoté ou non, SHA court/long ; erreur qui nomme la ref inconnue.
- `list_tree(commit) -> Vec<TreeEntry { path, blob, mode }>` récursif ; les submodules sont listés comme tels sans être suivis.
- `read_blob(blob) -> Bytes` ; `is_binary` par heuristique (octet nul dans les 8 premiers Ko).
- `repo_id()`.

## Critères d'acceptation

- [ ] Sur `tiny` : `list_tree` du dernier commit donne la liste attendue (littérale dans le test) ; `read_blob` d'un fichier redonne son contenu.
- [ ] `resolve` d'un SHA court ambigu ou inconnu échoue avec un message lisible.
- [ ] Aucun fichier du dépôt de fixture n'est modifié après les tests (comparaison de `git status --porcelain` et de l'horodatage de `.git/index`).

## Baseline

`just test-summary` (develop, 2945f48) : cargo: 52 passed, 0 failed ; web: 2 passed, 0 failed.

## Seams

- **API publique de `relief-git` sur une fixture** (`crates/relief-git/tests/read_objects.rs`, dépôt `tiny` construit par `relief-fixtures` dans un dossier temporaire) : `GitSource::open` depuis un sous-dossier et hors dépôt, `resolve` (HEAD, branche, tag annoté/léger, SHA court/long, inconnu, ambigu), `list_tree` (liste littérale, submodule listé sans être suivi), `read_blob`, `repo_id`, et l'absence d'écriture dans le dépôt (`git status --porcelain` + mtime de `.git/index`). Attrape : tout le comportement git réel. Rate : le repli sur le binaire `git`.
- **`relief_git::is_binary(&[u8])`**, fonction publique pure, testée sans git (test unitaire ou d'intégration) : octet nul dans les 8 premiers Ko → binaire, après 8 Ko ou absent → texte, entrée vide. Attrape : les bords de l'heuristique. Rate : rien de git.

## Red

- Fichiers de test : `crates/relief-git/tests/read_objects.rs` (13 tests), `crates/relief-git/tests/is_binary.rs` (7 tests) ; `crates/relief-git/Cargo.toml` (dev-dependencies `relief-fixtures`, `tempfile`)
- Lancer : `cargo test -p relief-git --test read_objects` et `cargo test -p relief-git --test is_binary`
- En échec : 20 tests, tous faute de compilation
  - `read_objects.rs` (13 tests) — `relief_git::GitSource` n'existe pas (E0432)
  - `is_binary.rs` (7 tests) — `relief_git::is_binary` n'existe pas (E0432)
- API supposée par les tests : `GitSource::open(&Path) -> Result<GitSource, E>` (struct, méthodes inhérentes), `resolve(&self, &str) -> Result<CommitId, E>` (`CommitId: Display`, SHA complet), `list_tree(&self, &CommitId) -> Result<Vec<TreeEntry>, E>` (`TreeEntry { path: Display/PartialEq<&str>, blob: BlobId, mode: u32 }`, octal git : 0o100644, 0o160000 pour un submodule, trié par chemin), `read_blob(&self, &BlobId) -> Result<impl Deref<[u8]>, E>`, `repo_id(&self) -> Result<impl PartialEq<&str> + Display, E>` (chaîne SHA), `is_binary(&[u8]) -> bool`. Messages d'erreur : « not a git repository » hors dépôt ; la ref inconnue est nommée ; « ambiguous » + le préfixe pour un SHA court ambigu.

## Green

- Fichiers : `crates/relief-git/src/lib.rs`, `crates/relief-git/Cargo.toml` (gix, thiserror), `Cargo.toml` (lint `err_expect = "allow"`), `clippy.toml` (`allow-unwrap-in-tests`), `Cargo.lock`
- Changement : `GitSource` (gix : `open` via `discover`, `resolve`, `list_tree` récursif trié avec submodules en 0o160000, `read_blob`, `repo_id` = racine de l'historique de HEAD), types `CommitId`/`BlobId`/`TreeEntry`, `GitError` (thiserror), `is_binary` (NUL dans les 8 premiers Ko). Les deux réglages clippy permettent `--all-targets -D warnings` avec les tests rouges (unwrap/`.err().expect`).
- Suite : cargo 47 réussis / 2 échoués (baseline 52/0 ; les 18 nouveaux tests verts = 7 is_binary + 11 read_objects) ; web 2/0.
- Questions ouvertes :
  - `resolve_ambiguous_short_sha_fails_readably` : le flux fast-import du test est invalide avec git 2.56 (`from refs/heads/many^0` rejeté, broken pipe avant toute lecture par relief) ; l'ambiguïté vérifiée à la main sur un dépôt valide (message « ambiguous revision '030f' … »). Test à corriger (retirer les lignes `from`).
  - `reading_never_modifies_the_repository` : échoue car le `git status --porcelain` final du test réécrit lui-même `.git/index` juste après la fixture (mtime change aussi sans relief) ; test à corriger (ex. `sleep` avant, ou mtime pris après un second status).

Note de l'orchestrateur : les deux tests signalés ci-dessus ont été corrigés ensuite par tdd-red (flux fast-import sans `from`, baseline de l'index prise après rafraîchissement) ; `cargo test -p relief-git` : 7 + 14 + 1 réussis.

## Review

- Verdict : ship (seconde passe ; les deux Must fix de la première passe visaient l'état antérieur aux corrections des tests et étaient déjà résolus).
- Must fix : aucun.
- Consider :
  - `Cargo.toml` racine : retirer `err_expect = "allow"` (assouplissement global pour les seuls tests) au profit de `let Err(err) = r else { panic!(..) }` ou d'un `Debug` sur `GitSource` + `unwrap_err()`.
  - `clippy.toml` (`allow-unwrap-in-tests = true`) : à garder, idiomatique et cohérent avec `docs/rules.md`.
  - `crates/relief-git/src/lib.rs` : la détection d'ambiguïté par `format!("{err:?}").contains("ambiguous")` est fragile ; préférer un match sur la variante d'erreur de gix.
  - `repo_id` suit le premier parent seulement : à documenter.
  - `mode: u32` primitive (un `FileMode` ou `is_submodule()` serait plus clair) ; `crate_name()` résiduel.
  - `gix` avec ses features par défaut (environ 1 700 lignes de `Cargo.lock`) : essayer `default-features = false`.
- Sécurité : RAS. Doc : aucune.

## Documentation

Ticket purement interne (bibliothèque `relief-git`, aucune commande ni écran) : la doc utilisateur ne change pas.

## Answer

- Construit : `relief_git::GitSource` (gix) avec `open` (découverte depuis un sous-dossier, erreur « not a git repository » hors dépôt), `resolve` (HEAD, branche, tag léger/annoté, SHA court/long ; erreurs qui nomment la ref inconnue ou signalent un préfixe ambigu), `list_tree` récursif trié (submodules listés en mode `0o160000` sans être suivis), `read_blob`, `repo_id` (SHA du premier commit) ; types `CommitId`, `BlobId`, `TreeEntry`, `GitError` (thiserror) ; `is_binary` (octet nul dans les 8 premiers Ko).
- Décisions : lints `err_expect = "allow"` (workspace) et `clippy.toml` `allow-unwrap-in-tests` ajoutés pour que les tests passent clippy ; le premier est à revoir (Consider).
- Vérifié : `cargo test -p relief-git` (22 tests verts, dont l'absence d'écriture dans la fixture : `git status --porcelain`, mtime et octets de `.git/index`) ; `just test-summary` : cargo 73/0, web 2/0 (baseline 52/0, 2/0) ; `just lint` propre. Pas d'UI, pas de vérification navigateur.
