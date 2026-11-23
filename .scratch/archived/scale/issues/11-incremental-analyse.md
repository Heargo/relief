# S11 Analyse incrémentale d'une plage

Status: resolved
Type: task
Blocked by: S04
UI: non
Doc: aucune (`docs/bench.md` remis à jour)

Spec: `../spec.md` (Décisions : budgets)

## Constat

S02 : le diff d'une PR d'environ 50 fichiers prend 3,1 s (excalidraw) et 65 s (n8n), budget 1 s. `analyse` indexe base et head en entier alors qu'ils ne diffèrent que de quelques fichiers.

## À faire

- Construire head à partir de base : seuls les fichiers changés (`diff_trees`) sont réextraits ; seuls ces fichiers et ceux dont la résolution d'import peut changer (importeurs d'un fichier ajouté, supprimé ou déplacé ; changement de `tsconfig.json` ou `package.json` = réindexation complète) sont reliés à nouveau.
- Même chose pour le rechargement du working tree (W01) : HEAD connu, seuls les fichiers modifiés sont relus.

## Critères d'acceptation

- [x] `just bench` : `analyse` sous 1 s sur excalidraw, et l'écart restant sur n8n expliqué.
- [x] Un test de propriété sur acme-shop et les fixtures : graphe incrémental = graphe complet, pour chaque commit de la fixture et pour le working tree.

## Triage

Après S10 (`docs/bench.md`) : `analyse` 0,37 s sur excalidraw (budget tenu) et 6,2 s sur n8n (budget 1 s non tenu). Les deux côtés sont encore lus et reliés en entier ; seul le parse est partagé. Toujours justifié pour n8n.

## Baseline

`4c736cb` : cargo 635 ; web 853 ; e2e 154 passés / 1 ignoré.

## Seams

- **Propriété sur fixtures (`relief-app` ou `relief-index`, `relief-fixtures`)** : pour chaque commit de acme-shop et des autres fixtures, le graphe construit à partir du commit parent (incrémental) est égal, octet pour octet sérialisé, au graphe indexé en entier ; idem pour le working tree à partir de HEAD (fichiers modifiés, ajoutés, supprimés, déplacés, `tsconfig.json` / `package.json` modifiés). Attrape les liens périmés ; rate le temps.
- **Cas d'usage `Session::analyse` sur fixture** : le résultat d'`analyse` sur une plage est identique à celui d'avant (snapshots existants inchangés). Attrape les régressions du diff ; rate le temps.
- **Banc (`just bench`, orchestrateur)** : `analyse` sous 1 s sur excalidraw, écart restant sur n8n mesuré et expliqué. Attrape le temps ; rate la justesse.

## Red

- Fichiers de test : `src/app/relief-app/tests/incremental_graph.rs`
- Lancer : `cargo test -p relief-app --test incremental_graph`
- API nommée pour green : `Indexer::snapshot_from(&self, source: &GitSource, base_commit: &CommitId, base: &IndexedSnapshot, commit: &CommitId) -> Result<IndexedSnapshot, IndexError>` (diff d'arbres interne ; repli sur l'indexation complète si un `tsconfig*.json` ou un `package.json` change). Le test compare `serde_json::to_string(&graph)` et les champs stables de `meta` (hors `parsed_files` / `cached_files`) à ceux de `snapshot(commit)` sur un indexeur neuf.
- En échec : 1 fichier, 19 tests (ne compile pas) — `Indexer::snapshot_from` n'existe pas (E0599). Couvre : chaque commit avec son parent sur acme-shop, tiny, churn, cochange ; `main` vers `feat/promo-codes` ; working tree avec fichier modifié, import modifié, ajouté, supprimé, déplacé, importeur inchangé d'un fichier ajouté / supprimé / renommé, fichier qui masque une résolution, `tsconfig.base.json` et `tsconfig.json` modifiés, `package.json` modifié.
- Seam `Session::analyse` : couvert par les snapshots existants (inchangés) et `incremental_analyse.rs` (S04) ; pas de nouveau test. Le branchement de `Session` (exclusions `relief.config.yaml` incluses, d'où sans doute une variante `snapshot_from_excluding`) reste à faire en green.

## Green

- Fichiers : `src/analysis/relief-index/src/lib.rs`, `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/lang/relief-lang-ts/src/lib.rs`, `src/analysis/lang/relief-lang-python/src/lib.rs`, `src/app/relief-app/src/lib.rs`, `docs/bench.md`
- Changement : `IndexedSnapshot` garde en privé, par fichier, extraction, index et liens ; `Indexer::snapshot_from` / `snapshot_from_excluding` ne réextraient que les fichiers dont le blob change et ne relient que ceux dont un lien pointe dans un fichier changé ou que l'adapter juge touchés (nouveaux hooks `link_input` et `link_affected`, défaut conservateur) ; repli sur l'indexation complète si le détecteur, les packages ou une config lue par le link changent. `Session` l'utilise pour `analyse` (head et commits de la plage depuis la base) et le working tree, exclusions comprises.
- Suite : cargo 653 réussis / 0 échoué (baseline 635, +18 du ticket), web 853 / 0 ; lint propre. Bench : excalidraw analyse 356 ms (budget tenu), n8n 5,66 s (6,2 s avant ; budget 1 s non tenu).
- Questions ouvertes : n8n reste hors budget : base indexée en entier (2,35 s, nouveau processus), détecteur qui lit et hache les 35 000 blobs (0,77 s par côté), clones des 157 000 nœuds, diff 1,2 s (détail dans `docs/bench.md`, « After S11 ») ; pistes : hash du détecteur repris de la base, snapshot persisté sur disque.
- Rechargement du working tree (W01) : il passe par `Session::analyse` (le worktree est `sides.new`, HEAD la base) ; il n'y a pas d'autre appelant de `snapshot_from`.
- Review : `link_input` du TS (reçoit `paths` et `read` du nouvel arbre) = `tsconfig*.json`, `jsconfig*.json`, `package.json` + chaîne des `extends` relatifs, calculée sur head seulement (ajouter ou retirer un `extends` modifie le tsconfig, déjà entrée de lien) ; l'hôte appelle `link_affected` pour tout fichier inchangé dont les liens ne pointent pas dans un fichier changé (défaut `true` = relier à nouveau).

## Review

- Verdict 1 : fix first. `link_input` TS trop étroit (un `extends` vers `./paths.json` ignoré) : test ajouté (red) et corrigé. Défaut de `link_affected` non conservateur pour un adapter sans hook : l'hôte appelle maintenant le hook pour tout fichier inchangé, défaut `true` (tout relier à nouveau).
- Orchestrateur : le premier correctif (« tout `.json` est une entrée de lien ») faisait réindexer n8n en entier à cause de `en.json` (i18n) : 6,9 s. Règle précise : `tsconfig*.json`, `jsconfig*.json`, `package.json` et la chaîne de leurs `extends` relatifs.

## Answer

- `Indexer::snapshot_from` (et `snapshot_from_excluding`) construit head à partir de base : seuls les fichiers dont le blob change sont réextraits ; sont reliés à nouveau ceux dont un lien pointe dans un fichier changé, ou que l'adapter juge touchés (`LanguageAdapter::link_input` et `link_affected`, défaut conservateur ; TS et Python implémentés). Réindexation complète si le détecteur, les packages, les adapters ou une entrée de lien changent. `Session::analyse` s'en sert pour head et les commits de la plage depuis la base, et pour le working tree depuis HEAD (c'est aussi le chemin du rechargement W01 ; pas d'autre appelant).
- Vérifié : 19 tests de propriété (chaque commit de 5 fixtures depuis son parent, `main` → branche d'acme-shop, 13 cas de working tree dont ajouts qui masquent une résolution, `tsconfig` / `package.json` modifiés, `extends` vers un `.json` quelconque) : incrémental = complet, et le graphe change vraiment ; cargo 654, web 853 ; e2e 154 / 1 ignoré ; `just lint` propre.
- `just bench` : `analyse` excalidraw 365 → 351 ms (budget 1 s tenu) ; n8n 6,2 → 5,7 s (budget non tenu). Écart expliqué dans `docs/bench.md` (« After S11 ») : base indexée en entier dans un processus neuf (2,35 s), coûts fixes du head (détecteur qui lit et hache 35 000 blobs, clone de 157 000 nœuds, validation : 1,6 s), `diff_graphs` et signatures (1,2 s). Suite : S23.
- Consider : le gain est faible tant que la base est reconstruite ; ne pas ajouter de complexité ici avant S23.
