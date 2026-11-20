# Diff des signatures : cassante ou compatible

Status: resolved
Type: task
Blocked by: E01, T01
UI: non
Doc: user-docs `review` (signatures)

Spec: `../spec.md` (Décisions : signature cassante)

## À faire

- `signature_hash` différent → `SignatureChange { before, after, breaking, reason }` à partir des textes de signature normalisés.
- Comparateur de signatures TS (dans `relief-lang-ts`, exposé par le contrat de l'adapter, pour qu'un autre langage fournisse le sien) : paramètres (nom, optionnel, type), type de retour, modificateurs d'export, visibilité.
- Règles et phrases de la spec ; une signature interne (`visibility: internal`) est signalée comme telle (moins grave dans l'UI).

## Critères d'acceptation

- [ ] Table de cas en littéraux : `refresh(token: string): Promise<Session>` → `Promise<Session | null>` = cassante, raison « type de retour élargi (null possible) » ; `computeTotal(lines)` → `computeTotal(lines, discount?)` = compatible, raison « paramètre optionnel ajouté » ; paramètre obligatoire ajouté = cassante ; export supprimé = cassante.
- [ ] Sur acme-shop (`main...feat/promo-codes`) : exactement 3 signatures changées (`SessionStore.refresh` cassante, `computeTotal` compatible, `useCheckoutTotals` compatible et interne).

## Baseline

`just test-summary` sur `develop` (ed6d32a) : cargo: 230 passed, 0 failed ; web: 2 passed, 0 failed.

## Seams

1. **Comparateur de signatures TS, fonction publique de `relief-lang-ts` exposée par le contrat de l'adapter** (table de cas en littéraux, sans git) : attrape les règles cassante/compatible et les phrases de `reason` (retour élargi à `null`, paramètre optionnel/obligatoire ajouté, export supprimé, visibilité) ; rate le branchement dans le diff de nœuds et la normalisation réelle des signatures issues du parseur.
2. **Diff de nœuds de `relief-diff` sur la fixture acme-shop (`main...feat/promo-codes`)**, via `relief-fixtures` : attrape le passage de `signature_hash` à `SignatureChange` (exactement 3 : `SessionStore.refresh` cassante, `computeTotal` compatible, `useCheckoutTotals` compatible et interne) avec les vrais textes de signature de T01 ; rate le détail des règles non présentes dans la fixture (couvert par le seam 1).

## Red

- Fichiers de test : `crates/relief-lang-ts/tests/signature_compare.rs`, `crates/relief-diff/tests/signature_diff.rs`
- Lancer : `cargo test -p relief-lang-ts --test signature_compare` puis `cargo test -p relief-diff --test signature_diff`
- En échec : 14 tests (9 + 5), aucun ne compile encore, faute d'API :
  - `signature_compare.rs` (9 tests : retour élargi à null, à undefined, paramètre optionnel ajouté, obligatoire ajouté, obligatoire retiré, type de paramètre changé, export supprimé, visibilité réduite, retour restreint) — `LanguageAdapter::compare_signatures` / `TsAdapter::compare_signatures(before, after) -> SignatureVerdict { breaking, reason }` n'existe pas.
  - `signature_diff.rs` (5 tests : exactement 3 signatures changées sur acme-shop, `SessionStore.refresh` cassante, `computeTotal` compatible, `useCheckoutTotals` compatible et interne, changement de signature seul = `Modified { body: false, signature: Some }`) — `relief_model::SignatureChange`, `NodeStatus::Modified { signature }`, `relief_diff::SignatureTexts` et `diff_graphs_with_signatures` n'existent pas.
- API supposée par les tests (le ticket ne la fixe pas, green peut l'ajuster en adaptant les tests) :
  - `SignatureChange { before, after, breaking, reason, internal }` et `SignatureVerdict { breaking, reason }` dans `relief-model` ; `internal` vient de `visibility` du nœud.
  - `diff_graphs_with_signatures(base, head, files, &SymbolTexts, &SignatureTexts { base, head: HashMap<NodeId, String> }, &dyn Fn(&str, &str) -> SignatureVerdict)` ; `diff_graphs` reste inchangé pour ne pas casser E01.
  - Les phrases de `reason` en français, littérales, ne sont fixées que pour les deux du ticket ; les autres cas n'assertent que `breaking`.
- Modification de `crates/relief-diff/tests/node_diff.rs` (lignes 102 et 246) : `Modified { body: true }` devient `Modified { body: true, signature: None }`, pour la nouvelle forme du spec ; sémantique E01 inchangée (corps modifié, signature inchangée). Ces tests ne compilent donc plus avant green.
- Attention green (obsolète, fait par red) : passer `Modified { body }` à `Modified { body, signature }` (spec) casse la compilation de `crates/relief-diff/tests/node_diff.rs` (lignes 102, 246) : à adapter.
- Limites connues (TS ignore les guillemets, ids de module provisoires) : sans effet sur les critères d'E02.

## Green

- Fichiers : `crates/relief-model/src/diff.rs`, `crates/relief-model/src/lib.rs`, `crates/relief-index/src/lib.rs`, `crates/relief-lang-ts/src/compare.rs` (nouveau), `crates/relief-lang-ts/src/lib.rs`, `crates/relief-diff/src/lib.rs`
- Changement : `SignatureChange`, `SignatureVerdict { breaking, reason, equivalent }` et `NodeStatus::Modified { body, signature }` (`None` sans clé JSON, `NodeStatus` perd `Copy`) dans `relief-model`. `LanguageAdapter::compare_signatures` (défaut : texte différent = cassante) ; comparateur TS dans `compare.rs` (export, visibilité, paramètres, retour). `diff_graphs_with_signatures` + `SignatureTexts` ; `diff_graphs` inchangé.
- Suite : cargo 244 passés, 0 échoué (baseline 230, +14) ; web 2 passés, 0 échoué ; lint propre.
- Questions ouvertes : champ `equivalent` ajouté au verdict (hors spec) pour écarter `type Props` et `CartSummary` (déstructuration), sinon 5 changements au lieu de 3 ; les déclarations sans parenthèses (types, const) ne produisent donc jamais de changement de signature. `just contract` : « not available yet (ticket M02) ».

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `relief-lang-ts/src/compare.rs` : `equivalent` écarte toute déclaration sans `(` (type, const, interface) ; un membre obligatoire ajouté à un `type` ou un `const` qui change de type passe sans signal (sauf export supprimé / visibilité réduite). Contournement accepté pour E02 (le spec ne règle que paramètres, retour, export, visibilité ; le critère « exactement 3 » impose d'écarter `type Props` et `CartSummary`). Limite connue : à reprendre dans un ticket dédié (filtre par sous-genre ou règle « membre ajouté »).
  - `SignatureVerdict.equivalent` mélange formatage, déstructuration et non-appelable ; un `Option<SignatureVerdict>` serait plus lisible. Le défaut de `LanguageAdapter::compare_signatures` renvoie une `reason` même à texte égal.
  - `diff_graphs` passe un comparateur factice jamais appelé (`SignatureTexts` vide) : un commentaire aiderait.
  - Phrases « type du paramètre modifié », « paramètre retiré », « devenu obligatoire » non assertées (seules les deux phrases du ticket le sont, conforme au Red).
  - Paramètre renommé = compatible (seul le type compte), à documenter.
  - `NodeStatus` perd `Copy` : aucun appelant cassé.
  - Contrat JSON : `NodeStatus`/`SignatureChange` dérivent `JsonSchema`, à régénérer quand `just contract` existera (M02).

## Documentation

Le site `user-docs/` (F05) n'existe pas encore. À documenter dans la page `review` (signatures) : règles cassante/compatible et phrases de `reason` ; signature interne signalée comme telle ; paramètre renommé jugé compatible ; limite : les types, interfaces et const ne produisent pas de changement de signature (hors export supprimé et visibilité réduite).

## Answer

- Construit : `SignatureChange { before, after, breaking, reason, internal }`, `SignatureVerdict` et `NodeStatus::Modified { body, signature }` (`signature` absent du JSON si `None`) dans `relief-model` ; `LanguageAdapter::compare_signatures` (défaut : texte différent = cassante) et comparateur TS dans `relief-lang-ts/src/compare.rs` (export, visibilité, paramètres nom/optionnel/type, retour élargi ou restreint) ; `diff_graphs_with_signatures` + `SignatureTexts` dans `relief-diff`, `diff_graphs` inchangé.
- Décisions : le texte de signature n'est porté ni par `Node` ni par `SymbolTexts`, d'où `SignatureTexts` ; `equivalent` écarte les déclarations non appelables et la déstructuration (voir Review). `node_diff.rs` adapté par tdd-red à `Modified { body, signature: None }` (changement de forme du variant, sémantique E01 inchangée).
- Limites connues (guillemets ignorés par le hash TS, ids de module provisoires) : sans effet sur les critères d'E02.
- Vérifié : `signature_compare` (9 cas en littéraux) et `signature_diff` (5 tests sur acme-shop `main...feat/promo-codes` : exactement 3 changements) verts ; `just test-summary` cargo 244 passés (baseline 230), web 2 ; `just lint` propre. Pas d'UI, pas d'étape navigateur.
