# Installation et premiers pas

Status: resolved
Type: task
Blocked by: F05, U02
UI: non
Doc: user-docs `getting-started`, `about`, README

Spec: `../spec.md`

## À faire

- Page `getting-started` (FR, EN) : installer (`cargo install --path crates/relief-cli` pour l'instant), lancer `relief serve` dans un dépôt, lire la carte (zoom, double-clic, clic), où est le cache.
- Captures générées sur acme-shop (`getting-started.shot.ts`).
- README : section « Installer et lancer », état du projet mis à jour.

## Critères d'acceptation

- [x] `just docs-build` passe ; la page a au moins deux captures par langue.
- [x] Suivre la page à la lettre dans un dossier vide + `git clone` d'un petit dépôt public donne une carte (vérifié à la main, noté dans `## Answer`).

## Baseline

`just test-summary` (develop, d9d43e7) : `cargo: 326 passed, 0 failed` ; `web: 79 passed, 0 failed`. `just e2e-summary` : `e2e: 27 passed, 0 failed`.

## Seams

Comportements : (a) la page `getting-started` FR/EN explique installer (`cargo install --path crates/relief-cli`, avec ce qu'il faut construire avant pour que l'UI et la doc soient embarquées), lancer `relief serve` dans un dépôt, lire la carte (zoom, double-clic, clic), où est le cache, avec au moins deux captures par langue générées par `getting-started.shot.ts` ; (b) `relief serve` montre la carte de n'importe quel dépôt (pas seulement acme-shop) ; (c) README « Installer et lancer » + état du projet. Pas d'UI nouvelle ; touche la doc utilisateur (`getting-started`, `about`, `cli` § serve) et le README.

1. **e2e Playwright, page de doc servie par `relief serve`** (`e2e/tests/docs.spec.ts`) : `/docs/getting-started/` et `/docs/en/getting-started/` contiennent au moins deux images chargées, la commande d'installation `cargo install --path crates/relief-cli`, `relief serve`, et l'emplacement du cache `~/.cache/relief`. Attrape : page incomplète, captures absentes ou cassées, une langue oubliée. Rate : la justesse de la prose (vérifiée à la main, étape 9).
2. **API HTTP sur un dépôt autre qu'acme-shop** (`Router` + `oneshot`, `crates/relief-server/tests/`, fixture `tiny` ou un dépôt de fixture dont la branche n'est pas `main`, sans plage) : `/api/meta` et l'endpoint de la carte répondent 200 avec des nœuds. Attrape : une hypothèse cachée sur acme-shop (branche `main`, packages npm, TS). Rate : le rendu dans le navigateur (vérifié à l'étape 7).
3. **CLI** (`assert_cmd`, `crates/relief-cli/tests/serve.rs`) : `relief serve --help` décrit la plage par défaut et `--port`/`--no-open` comme le dit la doc. Attrape : une doc qui décrit une CLI différente. Rate : le lancement réel (vérifié à la main).

## Red

- Fichiers de test : `e2e/tests/docs.spec.ts` (seam 1, 4 tests ajoutés), `crates/relief-server/tests/api.rs` (seam 2, 2 tests ajoutés), `crates/relief-cli/tests/serve.rs` (seam 3, 1 test ajouté)
- Lancer : `cd e2e && npx playwright test docs.spec.ts` (après `just build`) ; `cargo test -p relief-server --test api` ; `cargo test -p relief-cli --test serve`
- En échec : 4 tests (e2e uniquement)
  - `getting-started (French) shows at least two loaded screenshots` — la page n'a qu'une image (home.png), attendu au moins 2.
  - `getting-started (English) shows at least two loaded screenshots` — idem.
  - `getting-started (French) gives the install command, relief serve and the cache` — la page ne contient pas `cargo install --path crates/relief-cli` (ni `~/.cache/relief`).
  - `getting-started (English) gives the install command, relief serve and the cache` — idem.
- Déjà verts (comportement existant épinglé, aucun défaut révélé) : `meta_of_another_repository_answers_without_a_range`, `snapshot_of_another_repository_has_nodes` (tiny, branche renommée `trunk`, sans plage), `serve_help_documents_the_default_range_and_the_port`.
- Note : `cargo clippy --all-targets` échoue déjà sur les `unwrap` des tests existants (hors `just lint`) ; Prettier et fmt passent.

## Green

- Fichiers : `user-docs/src/content/docs/getting-started.md`, `user-docs/src/content/docs/en/getting-started.md`, `user-docs/src/content/docs/cli.md`, `user-docs/src/content/docs/en/cli.md`, `user-docs/screenshots/getting-started.shot.ts`, `user-docs/src/assets/screens/{fr,en}/getting-started-files.png`, `README.md`
- Changement : pages `getting-started` réécrites (prérequis, build de `web/dist` et `user-docs/dist` avant `cargo install --path crates/relief-cli`, `relief serve` avec plage/`--port`/`--no-open`/`--repo`, lecture de la carte d'après l'UI actuelle dont « clic simple sans effet », cache et `RELIEF_CACHE_DIR`/`--no-cache`) ; une 2e capture par langue (niveau fichiers) ; `cli` § serve alignée sur `--help` ; README : état et « Installer et lancer ». `about` est exact, inchangé.
- Suite : e2e docs 19/19 (dont les 4 rouges) ; cargo 329 passed, 0 failed ; web 79 passed, 0 failed ; lint propre ; `just docs-build` passe.
- Questions ouvertes : le critère « suivre la page dans un dossier vide + clone public » (`## Answer`) et `cargo install` réel n'ont pas été exécutés (vérification manuelle restante).

## Review

- Verdict : fix first, puis **ship** après revérification (Must fix traité ; README précisé avec `<repo-id>`).
- Must fix : critère d'acceptation 2 — suivre la page à la lettre dans un dossier vide + `git clone` d'un petit dépôt public, et le noter dans `## Answer`. Traité par l'orchestrateur (vérification manuelle, pas de code) : voir `## Answer`.
- Consider :
  - Cache : `analysis::cache_dir` honore aussi `XDG_CACHE_HOME`. Appliqué (correction d'une ligne) : `getting-started` FR/EN et README mentionnent `$XDG_CACHE_HOME/relief/<repo-id>/`.
  - `getting-started.shot.ts` : `waitForTimeout(800)` attend l'animation du cadrage ; préférer une attente sur un état observable (`data-level="2"`). Non appliqué.
  - `api.rs` : les tests sur `tiny` épinglent un comportement déjà vert (assumé au Red) ; le test `branches == ["trunk"]` couple au nom de branche de la fixture. Non appliqué.
- Vérifié contre le code : options de `serve`, plage par défaut HEAD → arbre de travail, rust-embed de `web/dist/relief/browser` et `user-docs/dist` (gitignorés, d'où le build préalable), gestes de la carte (molette, `+ − ⤢`, double-clic, glisser, touches `0`–`3`, clic simple sans effet), symétrie FR/EN, README exact.

## Answer

- Construit : pages `getting-started` FR/EN réécrites (prérequis Rust/Node/git ; build de `web/dist` et `user-docs/dist` puis `cargo install --path crates/relief-cli` ; `relief serve` avec plage par défaut, `A...B`, `--port`, `--no-open`, `--repo` ; lecture de la carte ; cache `~/.cache/relief/<repo-id>/` ou `$XDG_CACHE_HOME`, `RELIEF_CACHE_DIR`, `--no-cache`) ; seconde capture par langue (`getting-started-files.png`, carte au niveau fichiers) produite par `getting-started.shot.ts` ; `cli` § serve FR/EN alignée sur `relief serve --help` ; README : état du projet et « Installer et lancer » (la ligne `relief check`, non implémentée, retirée). `about` était exact, inchangé.
- Tests : e2e `docs.spec.ts` (images chargées ≥ 2, commande d'installation, `relief serve`, cache, FR et EN) ; API sur `tiny` avec branche `trunk` et sans plage (déjà vert, épinglé) ; `relief serve --help` (déjà vert, épinglé).
- Vérification manuelle (critère 2) : dans un dossier vide du scratchpad, `git clone` du dépôt relief (local, HEAD), `npm --prefix web install && npm --prefix web run build`, `npm --prefix user-docs install && npm --prefix user-docs run build`, `cargo install --path crates/relief-cli --root <tmp>` (`--root` temporaire au lieu de `~/.cargo`, seul écart), puis `git clone https://github.com/lukeed/clsx` : `relief show` → 18 fichiers, 16 symboles, 17 arêtes ; `relief --no-cache serve --no-open` sur clsx → onglet « clsx · relief », carte (`src/`, `test/`, `bench/`…), double-clic sur `src/` ouvre le niveau fichiers, EN et FR, 1280 et 1024 px, aucune erreur console ; `/docs/` servi par le binaire installé, images chargées.
- Navigateur sur acme-shop (`relief-acme`) : carte et page `/docs/getting-started/` servies, aucune erreur console. Suite finale : cargo 329/0, web 79/0, e2e 31/0 (baseline 326, 79, 27).
- Dette de doc restante (pour un ticket de suivi) : `cli` § `show` (C01, T02, T03 : `relief show [ref]`, `--json`, arêtes et nœuds `external`) ; `cli` § `diff` (C02, G02, G03 : plages `A..B`/`A...B`/`WORKTREE`/`INDEX`, `--staged`) ; `cli` § cache détaillé (I02 : `index.sqlite`) ; `review` (E02 à E05 : signatures et `reason`, couplages, `moved`, reformatage seul) ; doc contributeurs `just e2e` / `just e2e-summary` / `E2E_ALL_BROWSERS=1` (F04). Couvert ici : `getting-started` et `cli` § serve (C03, F04), cache de base (I02, partiel).
