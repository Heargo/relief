# K02 ADR : espace de travail et ids de dépôt

Status: resolved
Type: task
Blocked by: K01
UI: non
Doc: `docs/adr/0010-espace-de-travail-multidepot.md`

Spec: `../spec.md` (Décisions)

## À faire

- ADR 0010 : espace de travail (`<nom>.relief.json` + `.relief/`), préfixe `repo:<nom>/` des ids en multidépôt seulement, une plage par dépôt, arêtes entre dépôts par les adapters ; alternatives écartées (manifeste dans un dépôt, dossier parent implicite, préfixe partout).
- `relief-model` : construire et décomposer un id préfixé (`NodeId::in_repo`, `NodeId::repo`), sans changer les ids sans préfixe ; tests.

## Critères d'acceptation

- [x] ADR écrit, `GLOSSARY.md` à jour (espace de travail, dépôt membre).
- [x] Tests du modèle : aller-retour d'un id préfixé, id sans préfixe inchangé, contrat JSON inchangé en monodépôt.

## Baseline

Après K06 (`dd747ea`) : cargo 706/0 ; web 1088/0 ; e2e 187 passés, 1 ignoré.

## Seams

- **Fonctions publiques de `relief-model`** (`NodeId::in_repo`, `NodeId::repo`, et ce qui décompose un id préfixé), testées directement : aller-retour d'un id préfixé pour chaque genre de nœud, id sans préfixe inchangé (et `repo()` vide), noms de dépôt invalides refusés. Rate le contrat JSON.
- **Contrat JSON de `relief-model`** (sérialisation existante d'un snapshot construit par `GraphBuilder`, snapshot `insta` ou comparaison au contrat de `docs/contract/`) : inchangé en monodépôt. Rate l'usage par l'index (K08).

## Red

- Fichiers de test : `src/domain/relief-model/tests/node_id_repo.rs`
- Lancer : `cargo test -p relief-model --test node_id_repo`
- En échec : le fichier ne compile pas (rouge par symboles manquants : `NodeId::in_repo(self, &str) -> Result<NodeId, _>`, `NodeId::repo(&self) -> Option<&str>`, `NodeId::without_repo(&self) -> NodeId`, et `FromStr` qui accepte `repo:<nom>/…`). 10 tests :
  - prefixes_an_id_with_its_repo — `in_repo` absent
  - prefixed_id_round_trips_for_every_node_kind — `in_repo`/`repo`/`without_repo` absents
  - id_without_prefix_is_unchanged_and_has_no_repo — `repo`/`without_repo` absents
  - repo_name_with_dashes_dots_and_spaces_round_trips — `in_repo` absent
  - same_local_id_in_two_repos_gives_distinct_ids — `in_repo` absent
  - prefixed_id_keeps_its_accessors — `in_repo` absent
  - refuses_invalid_repo_names — `in_repo` absent (nom vide et `a/b` refusés)
  - rejects_a_prefix_with_an_empty_repo_name — le parse de `repo:/…` devra échouer
  - prefixed_id_serializes_as_a_plain_json_string — `in_repo` absent
  - single_repo_graph_json_has_no_prefix — `in_repo` absent (le contrat JSON monodépôt existant est déjà couvert par `json_shape.rs`, qui passe)

## Green

- Fichiers : `src/domain/relief-model/src/id.rs`, `src/domain/relief-model/tests/node_id_repo_root.rs` (nouveau)
- Changement : `NodeId` porte un `repo: Option<String>` ; ajout de `in_repo`, `repo`, `without_repo`, `repo_root` ; `Display`/`FromStr` gèrent `repo:<nom>/…` et `repo:<nom>` ; nom vide ou contenant `/` refusé. Ids sans préfixe et JSON inchangés.
- Suite : `cargo test --workspace` sans échec (baseline cargo 706/0, plus 10 tests rouges et 2 tests `repo_root`) ; lint propre.
- Questions ouvertes : aucune

## Review

Verdict initial : fix first. Corrigé : double préfixe `repo:a/repo:b/…` refusé (`parse_local`), `repo:api/` refusé, `in_repo` sur un id préfixé en erreur, id vide factorisé, tests d'ordre et de nom avec `:`/espaces ; ADR précisé (noms valides, forme canonique `repo:<nom>`). Laissé : `Option<String>` plutôt que `Option<Arc<str>>`, à mesurer en K08.

## Answer

- ADR 0010 (`docs/adr/0010-espace-de-travail-multidepot.md`) : espace de travail (`<nom>.relief.json` + `.relief/`), préfixe `repo:<nom>/` en multidépôt seulement, nœud dépôt `repo:<nom>`, une plage par dépôt, arêtes entre dépôts par les adapters ; alternatives écartées.
- `GLOSSARY.md` créé : dépôt, monodépôt, espace de travail, dépôt membre, multidépôt, étiquette, source, destination, comparaison.
- `relief-model` : `NodeId::in_repo`, `repo`, `without_repo`, `repo_root` ; `Display`/`FromStr` gèrent le préfixe ; ids sans préfixe et JSON inchangés (`json_shape.rs` passe).
- Vérifié : `just test-summary` et `just lint` (voir le commit). Pas d'UI, pas de doc utilisateur (changement interne).
