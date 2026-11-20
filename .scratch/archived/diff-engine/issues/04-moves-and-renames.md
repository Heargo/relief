# Déplacements et renommages

Status: resolved
Type: task
Blocked by: E03, G02
UI: non
Doc: aucune

Spec: `../spec.md` (Décisions : déplacement)

## À faire

- Fichier renommé par git (`FileChange::renamed`) : ses symboles passent de `removed` + `added` à `moved { from }` (ou `modified` en plus si leur contenu change).
- Symbole déplacé entre deux fichiers non renommés : même nom, même `content_hash`, supprimé ici et ajouté là → `moved`.
- Les imports réécrits à cause d'un déplacement (`../utils/format` → `@acme/shared/money`) ne comptent pas comme nouveau couplage : arête `removed` vers l'ancien id + `added` vers le nouveau = arête déplacée, marquée comme telle.

## Critères d'acceptation

- [x] Repris d'E03 : `diff_graphs` compare une arête dont une extrémité est `moved` avec l'id d'arrivée, pour qu'un déplacement ne crée ni arête ajoutée/supprimée ni nouveau couplage dans `coupling_changes` (test `GraphBuilder`).

- [x] Sur acme-shop : `formatPrice` est `moved` de `apps/web/utils/format.ts` vers `packages/shared/money/format.ts`, contenu identique ; `InvoicesPage` n'a qu'une arête déplacée (pas de nouveau couplage vers `shared` pour cette arête).
- [x] Test `GraphBuilder` : symbole déplacé ET modifié → `moved` avec `body: true`.

## Baseline

`just test-summary` sur `develop` (881779f) : cargo 244 passed, 0 failed ; web 2 passed, 0 failed.

## Seams

1. `relief_diff::diff_graphs` sur des snapshots `GraphBuilder` (plus, si l'API l'exige, la liste des renommages de fichiers venant de git passée en entrée, sans dépendre de `relief-git`) : attrape le symbole déplacé entre fichiers non renommés, déplacé + modifié (`body: true`), les symboles d'un fichier renommé, la comparaison des arêtes par id d'arrivée (ni ajout/suppression ni couplage dans `coupling_changes`). Rate la lecture réelle de git et l'indexation.
2. Fixture acme-shop (`relief-fixtures`) : index des deux refs + `diff_trees` (G02, renommages à 50 %) + `diff_graphs`, dans une crate de tests qui compose déjà git et index (pas de dépendance de `relief-diff` vers `relief-git`) : attrape `formatPrice` `moved` de `apps/web/utils/format.ts` vers `packages/shared/money/format.ts` et l'unique arête déplacée d'`InvoicesPage`. Rate les cas limites (couverts par le seam 1).

## Red

- Fichiers de test : `crates/relief-diff/tests/moves.rs` (seam 1, 9 tests), `crates/relief-diff/tests/acme_moves.rs` (seam 2, 2 tests)
- Lancer : `cargo test -p relief-diff --test moves` puis `cargo test -p relief-diff --test acme_moves`
- API supposée (à créer) : `relief_diff::FileRename { from: String, to: String }` ; `relief_diff::diff_graphs_with_renames(base, head, files, texts, renames: &[FileRename])` ; `NodeStatus::Moved { from: NodeId, body: bool }` ; `EdgeStatus::Moved` (l'`EdgeChange` porte les ids d'arrivée). `diff_graphs` détecte aussi les déplacements (même nom + même `content_hash`) sans renommage.
- En échec : 11 tests, tous à la compilation (`NodeStatus::Moved`, `EdgeStatus::Moved`, `FileRename`, `diff_graphs_with_renames` n'existent pas) :
  - moves : un symbole de même nom et hash déplacé entre fichiers est `moved` ; un nom différent n'est pas un déplacement ; un hash différent entre fichiers non renommés n'est pas un déplacement ; les symboles d'un fichier renommé sont `moved` ; déplacé + modifié → `moved` `body: true` ; symbole ajouté / retiré dans un fichier renommé reste `added` / `removed` ; arête vers un symbole déplacé = une arête `Moved` ; aucun couplage new/gone (File, Module, System) ; arête vers un symbole vraiment supprimé reste `Removed`
  - acme_moves : `formatPrice` `moved` de `apps/web/utils/format.ts` vers `packages/shared/money/format.ts` ; `InvoicesPage` n'a qu'une arête `Moved` et aucun nouveau couplage fichier

## Green

- Fichiers : `crates/relief-diff/src/lib.rs`, `crates/relief-model/src/diff.rs`, `crates/relief-model/src/id.rs`
- Changement : `NodeStatus::Moved { from, body }`, `EdgeStatus::Moved`, `FileRename`, `diff_graphs_with_renames` ; `detect_moves` (fichiers renommés par nom de symbole, puis même nom + même `content_hash`, appariement 1:1) ; `diff_edges` réécrit les arêtes retirées vers les ids d'arrivée et émet une arête `Moved` si la tête la contient. `NodeId::symbol_key()` ajouté.
- Suite : cargo 255 passed, 0 failed (baseline 244/0) ; web 2/0 ; lint propre ; aucun fichier de test modifié.
- Questions ouvertes : `just contract` répond « not available yet (ticket M02 ) » : contrat non régénéré, à faire quand M02 existera.

## Review

- Verdict : ship
- Must fix : aucun. Les trois critères sont couverts (`moves.rs`, `acme_moves.rs`) et implémentés, rien hors ticket. À noter pour M02 : `NodeStatus::Moved` et `EdgeStatus::Moved` changent le schéma JSON ; `just contract` n'existe pas encore, le contrat sera régénéré avec M02.
- Consider :
  - `detect_moves` (`crates/relief-diff/src/lib.rs`) : recherche O(fresh×gone) ; indexer `gone` par `(symbol_key, content_hash)` et par `symbol_key`. L'appariement 1:1 prend le premier candidat dans l'ordre du snapshot (déterministe mais arbitraire si plusieurs symboles ont même nom et même hash) : un test fixerait ce comportement.
  - `diff_graphs_with_renames` recopie le `compare` par défaut de `diff_graphs`, et aucune API ne combine renommages et signatures : fusionner, ou passer à une struct d'options plutôt qu'une 4e variante.
  - `FileRename { from: String, to: String }` : chemins en `String`, acceptable tant que `FileChange` fait pareil.
  - `diff_edges` : logique `rewritten` / `moved` / `done` dense ; une fonction `moved_edge_keys` commentée aiderait.
  - Limites connues hors périmètre : hash TS qui ignore les guillemets, ids de module provisoires.

## Documentation

Ticket interne (moteur de diff, aucune commande ni écran nouveau) : pas de doc utilisateur. Quand le calque de diff (R01) et `relief diff` (C02) exposeront `moved`, leur page devra expliquer qu'un symbole déplacé (fichier renommé, ou même nom et même contenu) apparaît comme déplacé, éventuellement modifié, et que les imports réécrits par un déplacement ne comptent pas comme nouveau couplage.

## Answer

- Construit : `NodeStatus::Moved { from, body }`, `EdgeStatus::Moved`, `relief_diff::FileRename` et `diff_graphs_with_renames` (les renommages git arrivent en entrée, `relief-diff` ne dépend pas de `relief-git`), `NodeId::symbol_key()`. Détection : symboles d'un fichier renommé appariés par nom, puis même nom + même `content_hash` entre fichiers non renommés (1:1). Les arêtes retirées sont réécrites vers les ids d'arrivée et deviennent `Moved` si la tête les contient, sans entrée dans `coupling_changes`.
- Vérifié : `cargo test -p relief-diff --test moves --test acme_moves` (11 tests), `just test-summary` cargo 255/0 (baseline 244/0), web 2/0, `just lint` propre, review `ship`.
- Non fait : contrat JSON non régénéré (`just contract` arrive avec M02).
