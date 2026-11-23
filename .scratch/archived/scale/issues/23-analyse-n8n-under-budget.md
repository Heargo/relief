# S23 `analyse` d'un très gros dépôt sous le budget

Status: resolved
Type: task
Blocked by: S11
UI: non
Doc: aucune (`docs/bench.md` remis à jour)

Spec: `../spec.md` (Décisions : budgets)

## Constat

Après S11 (`docs/bench.md`, « After S11 »), `analyse` d'une PR de ~50 fichiers sur n8n prend 5,7 s pour un budget de 1 s : base indexée en entier dans un processus neuf (2,35 s), coûts fixes du head (le détecteur lit et hache les 35 000 blobs, clone des 157 000 nœuds, validation : 1,6 s), `diff_graphs` et signatures (1,2 s). excalidraw tient le budget (351 ms).

## Pistes (à mesurer, une à la fois)

- Le détecteur reprend les hashes de contenu de la base au lieu de relire tous les blobs.
- Persister le snapshot d'un commit dans `.relief/` pour ne pas reconstruire la base dans un processus neuf.
- Partager nœuds et arêtes entre snapshots (pas de clone) ; `diff_graphs` limité aux fichiers changés et à leurs voisins.

## Critères d'acceptation

- [x] `just bench` : `analyse` sur n8n sous 1 s, ou l'écart restant expliqué et accepté par l'utilisateur. **4,3 s, écart expliqué, accepté par l'utilisateur le 2026-11-23.**
- [x] Les tests de propriété de S11 passent sans changement.

## Baseline

`f7d60bd` : cargo 654 ; web 862 ; e2e 154 passés / 1 ignoré. `just bench` : `analyse` n8n 5,7 s, excalidraw 351 ms.

## Seams

- **Propriété (tests de S11, `incremental_graph.rs`, inchangés)** : incrémental = complet sur toutes les fixtures et le working tree. Attrape toute divergence introduite par une réutilisation ; rate le temps.
- **Compteur de travail sur fixture (`relief-index` / `relief-app`)** : pour une plage où un seul fichier change, le détecteur et l'indexeur ne lisent que les blobs changés (compteur public de blobs lus, comme `TsAdapter::parses()` en S04) ; même idée pour chaque piste retenue. Attrape un retour au travail complet ; rate le temps réel.
- **Banc (`just bench`, orchestrateur)** : `analyse` n8n mesuré après chaque piste ; excalidraw ne régresse pas.

## Red

- Fichiers de test : `src/app/relief-app/tests/detector_reads.rs`
- Lancer : `cargo test -p relief-app --test detector_reads 2>&1 | tail -30`
- API à créer (green) : `Indexer::detector_reads(&self) -> usize`, compteur cumulatif (atomique, comme `TsAdapter::parses()`) des blobs lus par les détecteurs via le `read_blob` que `build` et `package_dirs` leur passent. `snapshot_from` doit reprendre les hashes de la base pour les fichiers inchangés (le détecteur ne doit lire que les blobs changés ou ajoutés).
- En échec : 3 tests (le fichier ne compile pas : `detector_reads` n'existe pas sur `Indexer`)
  - a_full_snapshot_makes_the_detector_read_every_blob — attend 3 lectures (init de `tiny`) ; garde la validité du compteur
  - a_snapshot_from_a_base_makes_the_detector_read_only_the_changed_blobs — init→edit : 1 lecture (src/a.ts)
  - a_snapshot_from_a_base_reads_the_added_blobs_and_not_the_others — edit→reshape : 1 lecture (src/c.ts ajouté)

## Green

- Fichiers : `src/analysis/relief-adapter-api/src/lib.rs`, `src/analysis/relief-detect/src/{generic,workspaces,pyproject}.rs`, `src/analysis/relief-index/src/lib.rs`, `src/domain/relief-diff/src/lib.rs`, `docs/bench.md`
- Changement : `Detector::detect_with(.., known)` (défaut : `detect`) ; les trois détecteurs ne lisent pas les blobs dont le hash est connu. `build` fournit les `content_hash` des nœuds fichier de la base dont le blob est inchangé et compte les lectures (`Indexer::detector_reads`, atomique). `diff_edges` compare par référence et trie sans recherche linéaire par extrémité.
- Suite : cargo : tout passe sauf les 3 tests de `detector_reads.rs` (voir questions) ; web 862/0 ; lint propre. Banc n8n `analyse` 5,7 s -> 5,15 s (détecteur) -> 4,3 s (diff) ; excalidraw 351 -> 308 ms.
- Questions ouvertes : budget 1 s non atteint : le reste est la base reconstruite (2,35 s), qui demande la persistance du snapshot (non faite) ; clone des nœuds non retiré (gain ~0,2 s, change `GraphSnapshot`).

## Review

- Verdict : ship (sous réserve de la décision de l'utilisateur sur le budget n8n)
- Must fix : aucun
- Consider :
  - relief-index/src/lib.rs:~355 : `n.id.to_string()` + `split_once("::file:")` par nœud (35 000 allocations) ; `n.id.file_path()` existe déjà.
  - relief-detect : `detect` délègue à `detect_with(.., &|_| None)` dans generic/pyproject, mais le défaut du trait fait l'inverse ; choisir un seul sens.
  - docs/bench.md : le « ~2,2 s » avec snapshot persisté suppose un chargement de ~0,25 s non mesuré ; le dire.
  - Critère budget : à trancher par l'utilisateur (4,3 s mesuré, 2,2 s estimé avec persistance). Case non cochée.

## Answer

- Détecteur : `Detector::detect_with(.., known)` ; les détecteurs ne relisent plus un blob dont le hash est repris de la base (même chemin, même blob) ; `Indexer::detector_reads` le compte. `diff_edges` compare les arêtes par référence et trie les arêtes changées en un passage.
- `just bench`, `analyse` : n8n 5,7 → 5,15 s (détecteur) → 4,3 s (diff) ; excalidraw 351 → 308 ms.
- Budget de 1 s non tenu sur n8n. Reste (détail dans `docs/bench.md`, « After S23 ») : base indexée en entier dans un processus neuf 2,35 s, head 1,15 s, diff et suite ~0,7 s. Seule une persistance du snapshot dans `.relief/` retirerait la base (~2,2 s estimés, chargement non mesuré), sans atteindre 1 s. Non fait (format et invalidation hors périmètre) ; l'utilisateur accepte 4,3 s (2026-11-23), pas de ticket de persistance.
- Vérifié : 3 tests `detector_reads` ; tests de propriété de S11 inchangés et verts ; cargo 657, web 862 ; e2e 154 / 1 ignoré ; `just lint` propre.
