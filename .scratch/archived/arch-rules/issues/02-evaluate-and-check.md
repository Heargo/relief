# Évaluer les règles

Status: resolved
Type: task
Blocked by: A01, E03
UI: non
Doc: aucune (les violations ne deviennent visibles qu'avec A03)

Spec: `../spec.md` (Décisions : évaluation)

## À faire

- `violations(config, head, diff) -> Vec<Violation { rule, edge, introduced }>` : fonction pure de `relief-rules`.
- Ajout au `GraphDiff` et à `ReviewSummary` (contrat régénéré par `just contract`) ; `Session::review_summary` de `relief-app` les inclut, la commande Tauri `review_summary` les renvoie sans logique propre.
- Pas de sous-commande en ligne de commande : relief ne s'utilise que par l'app (`relief [path] [range]`).

## Critères d'acceptation

- [x] Sur acme-shop : 1 violation introduite (`web-sans-db` : `validateCodeLocally → findDiscountByCode`) et 1 existante (`routes-via-repos` : `listInvoices → invoicesTable`), test de la fonction pure et de `Session::review_summary`.
- [x] Sur une plage sans changement (`main~0..main`) : aucune violation introduite ; l'existante reste listée comme existante.
- [x] Commande Tauri `review_summary` : test `tauri::test` qui retrouve les deux violations.

## Baseline

`just test-summary` (develop, 1d5a0bb) : cargo 447 passed, 0 failed ; web 413 passed, 0 failed.

## Seams

- **Fonction pure `relief_rules::violations(config, head, diff)`** sur un graphe construit par `GraphBuilder` et sur les données d'acme-shop : attrape `from`/`deny` sur les chemins des fichiers source et cible, le filtre `kinds`, introduite (arête `added`) contre existante ; rate la lecture de la config et le transport.
- **Cas d'usage `Session::review_summary` de `relief-app` sur la fixture acme-shop** : attrape les 2 violations de la PR (1 introduite, 1 existante) et `main~0..main` sans introduite ; rate le transport Tauri.
- **Commande Tauri `review_summary` (`tauri::test`)** : attrape la sérialisation des violations dans le contrat ; rate la logique.

Doc utilisateur : aucune (ticket sans UI ; A03 rendra les violations visibles).

## Red

- Fichiers de test : `src/domain/relief-rules/tests/violations.rs` (+ dev-dependencies dans `src/domain/relief-rules/Cargo.toml`), `src/app/relief-app/tests/violations.rs`, `src/interfaces/relief-desktop/tests/commands.rs` (test ajouté) ; `src/app/relief-app/tests/use_cases.rs` : retrait de l'assertion `violations.is_empty()` devenue fausse.
- Lancer : `cargo test -p relief-rules --test violations ; cargo test -p relief-app --test violations ; cargo test -p relief-desktop --test commands review_summary_serializes`
- Forme d'API supposée : `relief_model::Violation { rule: String, edge: { from, to, kind }, introduced: bool }` (remplace `RuleViolation { rule, node }`), `relief_rules::violations(&Config, &GraphSnapshot, &GraphDiff) -> Vec<Violation>`, `ReviewSummary.violations: Vec<Violation>`.
- En échec : 8 tests
  - relief-rules `violations` (6 tests : introduite, existante, hors from/deny, filtre kinds, arête supprimée, acme-shop) — ne compile pas : `relief_rules::violations` et `relief_model::Violation` n'existent pas.
  - relief-app `violations` (2 tests : PR acme-shop 1 introduite + 1 existante ; `main~0..main` sans introduite) — ne compile pas : `Violation` n'a pas `edge` ni `introduced` (l'actuel `RuleViolation` a `rule`, `node`).
  - relief-desktop `review_summary_serializes_the_rule_violations` — `violations` est vide (attendu 2).
- Écart signalé : sur acme-shop, chaque violation attendue correspond à DEUX arêtes qui matchent les règles par défaut. `web-sans-db` : `Calls validateCodeLocally → findDiscountByCode` et `Imports PromoCodeInput.tsx (fichier) → findDiscountByCode` (head seulement). `routes-via-repos` : `References listInvoices → invoicesTable` et `Imports invoices.ts (fichier) → invoicesTable` (base et head). Le critère « 1 introduite + 1 existante » n'est donc tenu que si l'évaluation écarte les arêtes dont la source est un fichier (ou dédoublonne par couple fichier source/cible). Les tests suivent le critère du ticket et ne sont pas ajustés ; l'implémentation (ou le ticket) doit trancher.

## Décision (orchestrateur)

Sur acme-shop, chaque violation est portée par deux arêtes : l'arête fine depuis le symbole (`Calls validateCodeLocally → findDiscountByCode`, `References listInvoices → invoicesTable`) et l'import depuis le fichier (`PromoCodeInput.tsx → findDiscountByCode`, `invoices.ts → invoicesTable`). Une seule violation par couple (règle, fichier source, nœud cible), en gardant l'arête dont la source est un symbole quand il y en a une (sinon l'import du fichier). Un import suivi d'un appel est un seul manquement à la règle. Le critère « 1 introduite + 1 existante » est donc tenu tel quel.

## Green

- Fichiers : `src/domain/relief-rules/src/violations.rs` (nouveau), `src/domain/relief-rules/src/lib.rs`, `src/domain/relief-model/src/api.rs`, `src/domain/relief-model/src/lib.rs`, `src/app/relief-app/src/lib.rs`, `docs/contract/review-summary.schema.json`, `src/ui/src/app/core/models/contract.ts`, `src/ui/src/app/modules/review/components/{signals-section,structural-overview}/*.component.html`, `src/ui/src/app/modules/review/helpers/review-summary.logic.spec.ts`
- Changement : `RuleViolation` remplacé par `Violation { rule, edge: ViolationEdge { from, to, kind }, introduced }`. `relief_rules::violations(config, head, diff)` parcourt les arêtes du head (règle, glob from/deny sur les chemins de fichier, filtre kinds), dédoublonne par (règle, fichier source, nœud cible) en préférant l'arête dont la source est un symbole, `introduced` = arête `added` du diff. `Session::review_summary` lit la config du head et remplit `violations`. UI : les templates lisent `violation.edge.from` à la place de `violation.node`.
- Suite : cargo 456 passés / 0 échoué (baseline 447), web 413 / 0 (baseline 413), e2e 69 passés, 1 ignoré, 0 échoué ; `just lint` propre.
- Questions ouvertes : le type TS exige de changer la fixture `violations` de `review-summary.logic.spec.ts` (ligne 52, ancien `{ node, rule }`), seul fichier de test touché hors des tests rouges, sans quoi `ng build` échoue au typage ; `GraphDiff` n'a pas reçu de champ (le ticket le mentionnait), seul `ReviewSummary` porte les violations.

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `src/domain/relief-rules/src/violations.rs:28` — `GraphDiff` n'a pas reçu les violations : pas un manque réel (la fonction prend le diff, `ReviewSummary` les porte, critères tenus) ; en revanche `ReadingReason::Violation` (`relief-diff/src/lib.rs:802`) reste jamais produite, alors que le ticket E07 la renvoie à A02 : la brancher (ou la retirer) dans un suivi, `reading_order` ne reçoit pas les violations.
  - `signals-section.component.html:15` et `structural-overview.component.html:47` — `summary.violations` contient désormais les violations existantes, affichées comme les introduites (le libellé dit « introduite ») ; filtrer sur `introduced` en attendant A03.
  - `src/app/relief-app/src/lib.rs:271` — une config invalide est ignorée sans trace (`c.ok()`) ; acceptable tant que R03 n'expose pas l'erreur.
  - `src/domain/relief-rules/tests/violations.rs` — aucun test unitaire de la préférence symbole contre import de fichier (couverte seulement par acme-shop), et `edge.kind` jamais asserté ; le test acme-shop lit un `relief.config.yaml` du disque avec repli `include_bytes!` (deux chemins).

## Answer

- Construit : `relief_model::Violation { rule, edge: ViolationEdge { from, to, kind }, introduced }` (remplace `RuleViolation`) ; `relief_rules::violations(config, head, diff)` (globs `from`/`deny` sur les chemins des fichiers source et cible, filtre `kinds`, introduite = arête `added`, une violation par règle, fichier source et nœud cible en préférant l'arête de symbole) ; `Session::review_summary` lit la config du head et remplit `violations`, renvoyées par la commande Tauri `review_summary`. Contrat régénéré ; templates UI adaptés au nouveau type.
- Décisions : dédoublonnage (voir « Décision (orchestrateur) ») ; les violations ne sont pas ajoutées à `GraphDiff`, seulement à `ReviewSummary` (la review juge que ce n'est pas un manque pour les critères).
- Vérifié : cargo 456/0, web 413/0 (baseline 447/413) ; e2e 69 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; review « ship ». Pas de doc utilisateur (A03).
- À traiter dans A03 : les sections Signaux et Vue d'ensemble listent et comptent désormais aussi les violations existantes comme des introduites ; les séparer (introduites en avant, existantes discrètes).
- Suivis : brancher `ReadingReason::Violation` de l'ordre de lecture (E07) sur les violations, ou la retirer ; test unitaire de la préférence symbole contre import et assertion de `edge.kind` ; config invalide ignorée sans trace dans `review_summary`.
