# E08 Changements répétitifs

Status: resolved
Type: task
Blocked by: aucun
UI: non
Doc: aucune (contrat JSON)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Une migration ou un renommage de masse fait le même changement dans N fichiers (même import ajouté, même symbole retiré ou renommé). La relecture les traite un par un.

## Comportement

- `relief-diff` regroupe les fichiers modifiés par la **signature** de leur changement : ensemble des arêtes ajoutées et supprimées vues depuis le fichier (sorte + cible), ensemble des symboles ajoutés / supprimés / renommés par nom. Deux fichiers sont dans le même groupe si leurs signatures sont égales ; un groupe compte au moins 3 fichiers.
- Chaque groupe a un **représentant** (le premier dans l'ordre de lecture), la liste des membres et un résumé calculé (« +import sceneNode, +import waitForScene ; −`map-node` »).
- Exposé dans `ReviewSummary` (`repeated: [{ representative, members, summary }]`), sans changer le reste du résumé.

## Critères d'acceptation

- [x] Fixture : une plage où 4 fichiers ajoutent le même import et 2 autres un import différent : un groupe de 4, pas de groupe pour les 2.
- [x] Déterministe : même groupe et même représentant d'un run à l'autre.
- [x] Types TS générés à jour (`just contract`).

## Baseline

`a70b35b` (develop) : cargo 665 ; web 913 ; e2e 167 passés / 1 ignoré.

## Seams

- **Fonction pure de `relief-diff`** (graphes en mémoire, `relief-model::testing::GraphBuilder`) : groupes, représentant, résumé, seuil de 3, déterminisme. Attrape la règle ; rate git.
- **Cas d'usage `Session::review_summary` sur une fixture (`relief-fixtures`)** : une plage où 4 fichiers ajoutent le même import et 2 un autre : `repeated` contient un groupe de 4 et rien pour les 2 ; types TS générés à jour (`just contract`). Attrape le câblage et le contrat ; rate l'UI.

## Red

- Fichiers de test : `src/domain/relief-diff/tests/repeated_changes.rs`, `src/app/relief-app/tests/repeated_changes.rs`, fixture `tests/fixtures/repeated-imports/` (base + migrate, branche `feat/migration`, plage `main...feat/migration`)
- Lancer : `cargo test -p relief-diff --test repeated_changes` et `cargo test -p relief-app --test repeated_changes`
- En échec : 15 tests (12 + 3), aucun ne compile — symboles manquants
  - relief-diff (12) : `relief_diff::repeated_changes` et `relief_model::{RepeatedChange, RepeatedChangeItem}` n'existent pas
  - relief-app (3) : `ReviewSummary.repeated` n'existe pas
- API à implémenter : `relief_diff::repeated_changes(&GraphDiff, &GraphSnapshot) -> Vec<RepeatedChange>` ; dans `relief-model` (api.rs, schéma JSON) `RepeatedChange { representative: NodeId, members: Vec<NodeId>, summary: Vec<RepeatedChangeItem> }` et `RepeatedChangeItem::{EdgeAdded{kind,target}, EdgeRemoved{kind,target}, SymbolAdded{name}, SymbolRemoved{name}, SymbolRenamed{from,to}}` (enum tagué, champ `target` en JSON) ; `ReviewSummary.repeated: Vec<RepeatedChange>` ; `Session::review_summary` l'alimente. Candidats = fichiers de l'ordre de lecture (File) ; groupes ordonnés par position du représentant ; résumé : arêtes ajoutées, supprimées, symboles ajoutés, supprimés.

## Green

- Fichiers : `src/domain/relief-diff/src/lib.rs`, `src/domain/relief-model/src/{api,id,lib}.rs`, `docs/contract/review-summary.schema.json`, `src/ui/src/app/core/models/contract.ts`
- Changement : `relief_diff::repeated_changes` regroupe les fichiers de l'ordre de lecture par signature (arêtes ajoutées/supprimées ramenées au fichier cible via le nouveau `NodeId::file_id`, symboles ajoutés/supprimés par nom), seuil de 3, représentant = premier membre ; `review_summary` l'appelle. `RepeatedChange` / `RepeatedChangeItem` (sans `SymbolRenamed`) et `ReviewSummary.repeated` (`#[serde(default)]`, donc `repeated?:` en TS pour ne pas casser un spec existant) ; `just contract` rejoué.
- Suite : cargo 680 passés / 0 échoué (baseline 665 + 15) ; web 913 / 0 (identique).
- Questions ouvertes : `just lint` échoue uniquement sur `cargo fmt --check` des deux fichiers de test rouges (`relief-app/tests/repeated_changes.rs`, `relief-diff/tests/repeated_changes.rs`), non formatés par rustfmt et figés ; à formater à l'étape review. Clippy et le reste du lint ne signalent rien dans mon code.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - relief-diff/src/lib.rs `change_signature` : rescanne `diff.edges` et `diff.nodes` en entier par fichier (parse de `file_path()` à chaque ligne), soit O(fichiers x (arêtes+nœuds)). `reading_order` fait déjà de même pour les nœuds, mais l'ajout double le coût et ajoute les arêtes ; sur une migration de milliers de fichiers (n8n a 35 000 fichiers, seuls les modifiés comptent) cela peut peser. Indexer arêtes et nœuds par chemin en une passe.
  - relief-diff/src/lib.rs `change_signature` : `e.to.file_id()` ramène toute cible au fichier. Les imports sont fichier à fichier, donc sans effet ; mais `f1` appelant `util::a` et `f2` appelant `util::b` partagent la signature « calls util.ts » : faux regroupement, et le résumé masque la différence. Le ticket dit « cible » sans trancher ; garder la cible symbole pour les non-imports ou ajouter un test qui fige le choix.
  - Ticket / api.rs : `SymbolRenamed` du spec et du Red est absent (rename vu comme −ancien +nouveau, donc non groupé si les noms diffèrent par fichier). Écart assumé dans Green, à consigner dans le spec Phase 14.
  - lib.rs `sort_by_key` avec `to.to_string()` et `format!("{kind:?}")` : allocations dans le tri ; trier sur un tuple dérivé `Ord` si disponible.
  - `serde(default)` / `repeated?:` : correct pour rétro-compatibilité, mais le front devra gérer `undefined` ; à resserrer quand l'UI consommera le champ.
  - Déterminisme : correct (HashMap utilisé seulement comme index, ordre des groupes issu de `reading_order`, signatures triées). Couches : relief-diff reste pur, sans git.

## Answer

- `relief_diff::repeated_changes` regroupe les fichiers de l'ordre de lecture par signature de changement : arêtes ajoutées et supprimées (sorte + cible ; la cible d'un `imports` est ramenée au fichier, celle des autres arêtes reste le symbole) et symboles ajoutés ou supprimés par nom ; au moins 3 fichiers ; représentant = premier dans l'ordre de lecture ; résumé structuré (`RepeatedChangeItem`), formaté par l'UI. Exposé dans `ReviewSummary.repeated` (`serde(default)`, `repeated?:` côté TS). Arêtes et nœuds indexés par fichier en une passe.
- Écart avec le ticket : pas de variante « renommé » (rien ne la produit ; un renommage compte comme −ancien +nouveau).
- Review : ship ; corrigés à sa demande : faux regroupement des appels vers des symboles différents (test ajouté), coût en O(fichiers × arêtes).
- Vérifié : cargo 682, web 913 ; `just lint`. Pas d'UI (R18).
