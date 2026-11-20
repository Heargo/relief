# Arêtes HTTP entre front et API

Status: resolved
Type: task
Blocked by: T03
UI: non
Doc: user-docs `review` (impact via HTTP)

Spec: `../spec.md`

## À faire

- Côté serveur : routes déclarées par `app.get|post|put|patch|delete("<chemin littéral>", …)` et `router.<verbe>(…)` (Fastify, Express) → le symbole qui déclare la route reçoit `subkind: route` et une métadonnée `route: "POST /checkout"`.
- Côté client : appels `fetch("<littéral>", { method })`, et wrappers qui reçoivent un chemin littéral (heuristique : fonction dont le nom contient `get|post|put|patch|delete|fetch|request` et dont le premier argument est une chaîne commençant par `/`).
- Correspondance verbe + chemin (paramètres `:id` et `${…}` traités comme jokers) → arête `http` du symbole client vers la route. Précision `syntactic`.
- Les correspondances incertaines (verbe inconnu) sont gardées avec un drapeau `heuristic: true`.

## Critères d'acceptation

- [ ] Sur acme-shop : `useInvoice → getInvoice`, `useCheckoutTotals → postCheckout`, `PromoCodeInput → postPromoValidate` (test littéral).
- [ ] Un `fetch(url)` avec une variable ne produit aucune arête.

## Report de E06

- [ ] Sur acme-shop (head), `impact` des appelants de `SessionStore.refresh` avec `follow_http: true` en donne 10 (6 sans HTTP, testé par `crates/relief-diff/tests/impact_acme.rs`).

## Baseline

`just test-summary` (develop, 9cd63de) : cargo 367 passed, 0 failed ; web 308 passed, 0 failed.

## Seams

- `TsAdapter` (`extract` / `link`) sur des sources littérales : attrape la déclaration de route (`subkind: route`, `route: "POST /checkout"`, Fastify et `router.<verbe>`), la détection des appels client (`fetch` + `method`, wrappers heuristiques), les jokers `:id` / `${…}`, le drapeau `heuristic`, l'absence d'arête pour `fetch(variable)` ; rate l'intégration au dépôt réel.
- `Indexer` sur la fixture acme-shop : attrape les trois arêtes `http` attendues entre apps/web et apps/api et la sérialisation (contrat, cache) ; rate les cas limites de motifs.
- `relief_diff::impact` sur acme-shop (head) : attrape les 10 appelants de `SessionStore.refresh` avec `follow_http: true` contre 6 sans ; rate la détection elle-même.

## Fixture acme-shop

Décision : la fixture n'est pas modifiée. La maquette atteint 10 appelants parce que `getInvoice` y appelle `requireAuth` (6 + `useCheckoutTotals`, `CheckoutPage`, `useInvoice`, `InvoicesPage`). Dans la fixture l'auth passe par `{ preHandler: requireAuth }` dans `registerInvoiceRoutes`, non modélisé : `useInvoice -> getInvoice` n'atteint pas `refresh`. Le test attend donc la valeur réelle, 8 avec HTTP (6 + `useCheckoutTotals` + `CheckoutPage`), 6 sans. Suivi possible : modéliser `preHandler`. Le couplage `apps/web/components -> apps/api/routes` (arête http `PromoCodeInput -> postPromoValidate`) porte le test de R03 à 4 couplages ajoutés : un couplage HTTP entre modules est réel.

E2E de R03 (`e2e/tests/structural-overview.spec.ts`) : 4 lignes `new-coupling` au lieu de 3, dont `apps/web/components → apps/api/routes` (arête http), pour la même raison que le test serveur.

## Red

- Fichiers de test : `crates/relief-lang-ts/tests/http_edges.rs` (nouveau), `crates/relief-diff/tests/impact_acme.rs` (un test ajouté)
- Lancer : `cargo test -p relief-lang-ts --test http_edges` ; `cargo test -p relief-diff --test impact_acme`
- En échec : 
  - `http_edges.rs` (17 tests) — ne compile pas : `Node.route: Option<String>` et `Edge.heuristic: bool` n'existent pas (le rouge est ce symbole manquant) ; une fois les champs ajoutés, les tests attendent `subkind: route` sur le handler passé à `app.<verbe>` / `router.<verbe>`, les arêtes `http` (jokers, verbe de fetch / du wrapper, `heuristic` si verbe inconnu, rien pour `fetch(variable)`), la survie au cache et les 4 arêtes acme.
  - `refresh_has_ten_callers_when_following_http` — échoue à l'assertion : 6 appelants trouvés au lieu de 10 (pas d'arête `http`).

## Green

- Fichiers : `crates/relief-lang-ts/src/{http.rs,refs.rs,lib.rs}`, `crates/relief-model/src/{types.rs,testing.rs}`, `crates/relief-index/src/{lib.rs,cache.rs}`, `crates/relief-detect/src/{generic,workspaces}.rs`, `docs/contract/*.schema.json`, `web/src/app/core/models/contract.ts`, snapshots insta.
- Changement : `Node.route` et `Edge.heuristic` (omis par défaut) ; `http.rs` détecte `app|router.<verbe>("/…", …, handler)` (handler en `subkind: route`) et les appels client (`fetch`, wrappers dont le nom contient verbe/fetch/request, premier argument littéral en `/`) ; `LinkContext.routes` alimente `link` (jokers `:id` / `${…}`, `heuristic` si verbe inconnu). `SCHEMA_VERSION` du cache = 3 ; `adapter_version` reste 2 (test `content_hash` l'exige) ; `is_followed` inchangé.
- Snapshots régénérés (`diff__diff_acme_{json,text}`, `api__api_diff_acme`, `review_summary__review_summary_acme`) : seuls les ajouts dus aux arêtes `http` (kind `http`, `route`, `heuristic`) et le couplage `apps/web/components -> apps/api/routes` apparaissent, aucun `Retry*`.
- R03 : `couplingsAdded` passe de 3 à 4 (`apps/web/components -> apps/api/routes`), le reste est inchangé.
- Carte (UI) : affichage des arêtes http non vérifié dans le navigateur ; recherche par route de U05 atteignable (`Node.route` exposé), non implémentée.
- Suite : cargo 386 passed, 0 failed (baseline 367/0) ; web non relancé ; lint propre.
- Questions ouvertes : aucune.

## Review

- Verdict : fix first (doc seulement ; code et tests jugés bons, tests relancés au vert sur relief-lang-ts, relief-diff, relief-index).
- Must fix :
  - `user-docs/src/content/docs/review.md` et `en/review.md` : doc manquante (« Doc : user-docs `review` (impact via HTTP) »). Ne pas remplir « Rayon d'impact » (« Coming soon », l'impact UI n'existe pas). Signaux : dire qu'un appel front → API (`fetch` ou wrapper à chemin littéral) crée un couplage HTTP entre modules (acme-shop : `apps/web/components → apps/api/routes`, 4 nouveaux couplages). Dépendances : mentionner les arêtes HTTP (heuristiques si le verbe est inconnu). Les appelants des signatures modifiées restent sans HTTP : ne chiffrer ni 8 ni 10.
- Consider :
  - `crates/relief-lang-ts/src/http.rs` (branche `member_expression`) : `api.post("/orders", payload)` marque `payload` comme route si un symbole homonyme existe dans le fichier (client axios-like). Écart accepté, noté pour suivi.
  - `relief-index/src/cache.rs` : `SCHEMA_VERSION` 3 invalide tous les caches ; adapter laissé à 2, cohérent.
  - Défaut de T03 (paramètre homonyme → fausse `references`) non aggravé. `link_http` trie `ctx.routes` par client (O(clients × routes)) : à surveiller.
  - Pas de test d'ambiguïté (`GET /x/:id` et `GET /x/new`) : le client atteint les deux.
- Réponses : écart fixture (8 contre 10 de la maquette, `preHandler: requireAuth` non modélisé) justifié, modélisation du preHandler en suivi (rouvrirait le critère 10 d'E06). Couplage R03 3 → 4 légitime (`coupling_changes` agrège toutes les arêtes, seul l'impact coupe HTTP). `relief-detect` et `relief-model/testing.rs` : initialisations mécaniques des nouveaux champs. « Désactivable » : `ImpactOptions.follow_http` suffit. Carte : `edges.logic.ts` gère déjà `kind === 'http'`. U05 : recherche par route atteignable (`Node.route`), à noter.

Must fix (doc) corrigé par green : `user-docs` `review` FR/EN (arêtes HTTP dans « Dépendances », couplages HTTP dans « Signaux », exemple `apps/web/components → apps/api/routes`), captures `review` régénérées (`just docs-shots review`), `docs-build` vert. Consider acceptés et notés ci-dessous.

## Answer

- Construit : `relief-lang-ts/src/http.rs` détecte les routes serveur (`app.<verbe>` / `router.<verbe>` à chemin littéral : le handler reçoit `subkind: route` et `route: "VERBE /chemin"`) et les appels client (`fetch(littéral, { method })`, wrappers `get|post|put|patch|delete|fetch|request` à premier argument `/…`). `link` crée une arête `http` client → route (jokers `:id` et `${…}`, précision `syntactic`, `heuristic: true` si le verbe est inconnu). `fetch(variable)` ne produit rien. Nouveaux champs `Node.route` et `Edge.heuristic` (omis par défaut), contrat JSON régénéré, cache `SCHEMA_VERSION` 3 (adapter laissé à 2).
- acme-shop : `useInvoice → getInvoice`, `useCheckoutTotals → postCheckout`, `PromoCodeInput → postPromoValidate`.
- Impact : appelants de `SessionStore.refresh` = 8 avec HTTP (6 + `useCheckoutTotals`, `CheckoutPage`), 6 sans. Le « 10 » d'E06 venait de la maquette, où `getInvoice` appelle `requireAuth` ; dans la fixture l'auth passe par `{ preHandler: requireAuth }`. Décision : on n'ajuste pas la fixture au test (l'ajout `useRetryCheckout`/`RetryBanner` de red a été retiré), critère fixé à la valeur réelle.
- R03 : couplages ajoutés 3 → 4 (`apps/web/components → apps/api/routes`, via `PromoCodeInput → postPromoValidate`) ; snapshot `review_summary`, test cargo et e2e `structural-overview` alignés. Les appelants de R03 ne bougent pas (`follow_http: false`). Snapshots diff/api : seules les arêtes `http` s'ajoutent.
- Vérifié : `just test-summary` cargo 386/0 (baseline 367), web 308/0 ; `just e2e-summary` 58/0 ; `just lint` ; `just docs-build`. Navigateur non lancé : la carte gère déjà `kind === 'http'` (`edges.logic.ts`) et la capture `review-signals` régénérée montre le nouveau couplage.
- Suivis : (1) modéliser `preHandler` (arête vers `requireAuth`) donnerait les 10 de la maquette et rouvrirait le critère d'E06 ; (2) la recherche par route de U05 devient atteignable via `Node.route` ; (3) la désactivation passe seulement par `ImpactOptions.follow_http` (défaut `true`), sans option CLI ni réglage UI ; (4) Consider de la review : faux positif `api.post("/x", payload)`, routes ambiguës, coût `link_http`.
