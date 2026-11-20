# Site de doc utilisateur et captures

Status: resolved
Type: task
Blocked by: F04
UI: non
Doc: user-docs (création)

Spec: `../spec.md`, `docs/adr/0004-doc-utilisateur-starlight.md`

## À faire

- `user-docs/` : Starlight (versions épinglées), `base: '/docs'`, français à la racine, anglais sous `en/`, logo de la maquette.
- Barre latérale : Commencer (`getting-started`), La carte (`map`), Relire une PR (`review`), Règles d'architecture (`rules`), Explorer un repo (`explore`), Référence CLI (`cli`), À propos (`about`). Chaque page existe en FR et EN avec un plan de titres et « À venir » là où la fonctionnalité n'existe pas encore.
- `user-docs/screenshots/` : config Playwright qui réutilise le `webServer` de `e2e/`, un `*.shot.ts` par page, images dans `src/assets/screens/<lang>/`. Un premier script qui capture l'écran d'accueil.
- `relief serve` sert le build de la doc sous `/docs` (le build est embarqué comme l'UI).
- Recettes `just docs-dev`, `just docs-build`, `just docs-shots [page]`.

## Critères d'acceptation

- [x] `just docs-build` passe ; les deux langues ont les 7 pages.
- [x] `just docs-shots getting-started` produit `src/assets/screens/fr/` et `en/` sans erreur.
- [x] Test e2e : le lien « Aide » de l'UI ouvre `/docs/` servi par `relief serve`.

## Baseline

`just test-summary` (develop, ed9706b) : `cargo: 320 passed, 0 failed` / `web: 3 passed, 0 failed`. e2e : 1 test (smoke, F04).

## Seams

1. **API HTTP** (`Router` de `relief-server` + `oneshot`) : `GET /docs/`, `GET /docs/en/` et une page profonde (`/docs/getting-started/`) renvoient le HTML embarqué du build de doc, un asset sous `/docs/` a le bon type MIME, une page de doc absente renvoie 404 (pas le `index.html` de l'UI). Attrape le routage et l'embarquement ; rate le contenu réel des pages et le build Starlight lui-même.
2. **e2e Playwright** (`e2e/`, contre `relief serve` sur acme-shop) : le lien « Help »/« Aide » de l'UI mène à `/docs/` ; les 7 pages (`getting-started`, `map`, `review`, `rules`, `explore`, `cli`, `about`) répondent en FR (racine) et en EN (`/docs/en/…`) avec un titre de niveau 1. Attrape le build Starlight, `base: '/docs'`, les deux langues et l'embarquement de bout en bout ; rate le rendu visuel.

Les captures (`just docs-shots getting-started`) sont vérifiées à la main à l'étape 8 (commande + présence des images), pas par un test : c'est un outil de production de doc, pas un comportement du produit.
Pas d'écran avant U01 : le seul ajout d'UI est un lien d'aide minimal dans le shell (`App`), avec ses clés i18n EN/FR.

## Red

- Fichiers de test : `crates/relief-server/tests/docs.rs`, `e2e/tests/docs.spec.ts`
- Contrat HTTP : `ServerOptions` gagne `docs_dir: Option<PathBuf>` (le test l'utilise avec un dossier de fixture écrit à la main) ; quand il est défini, `/docs` est servi depuis ce dossier au lieu du build embarqué (`user-docs/dist`, embarqué comme `web/dist`, absent toléré). `/docs` et `/docs/` -> `index.html` ; `/docs/<dir>` avec ou sans `/` final -> `<dir>/index.html` ; assets avec leur type MIME ; chemin absent sous `/docs` -> 404 (jamais l'`index.html` de l'UI). Les tests existants construisant `ServerOptions` sans `..Default::default()` devront être adaptés par green.
- Lancer : `cargo test -p relief-server --test docs` ; `cd e2e && npm exec playwright test tests/docs.spec.ts`
- En échec : 6 tests Rust (ne compilent pas : `ServerOptions` n'a pas de champ `docs_dir`, comptés comme rouge) :
  - docs_root_serves_the_french_home, docs_without_trailing_slash_serves_the_home, docs_english_home_is_served_under_en, docs_deep_page_serves_its_index_html, docs_asset_has_its_mime_type, missing_docs_page_is_a_404_not_the_ui_index — champ/route `/docs` manquants
- En échec : 15 tests e2e :
  - the Help link of the UI opens the docs served by relief serve — pas de lien « Help »/« Aide » dans le shell
  - docs page <slug> answers in French (root) with a level-1 heading (7 : getting-started, map, review, rules, explore, cli, about) — `/docs/<slug>/` n'est pas servi (pas de h1)
  - docs page <slug> answers in English (/en) with a level-1 heading (7, mêmes slugs) — `/docs/en/<slug>/` n'est pas servi (pas de h1)

## Green

- Fichiers : `crates/relief-server/src/docs.rs` (nouveau), `crates/relief-server/src/{lib.rs,}`, `crates/relief-server/Cargo.toml`, `crates/relief-cli/src/main.rs`, `crates/relief-server/tests/api.rs` (adapté : `..Default::default()`), `user-docs/` (Starlight, 7 pages x 2 langues + accueil, logo, `screenshots/`, `package-lock.json`), `e2e/web-server.ts` + `e2e/playwright.config.ts` (webServer partagé), `justfile`, `.gitignore`, `web/.../relief-page.component.{html,scss}`, `web/public/i18n/{en,fr}.json`
- Changement : `ServerOptions.docs_dir` et `/docs` servi depuis ce dossier ou depuis `user-docs/dist` embarqué (absent toléré, 404 sinon, sans repli sur l'UI) ; site Starlight `base: '/docs'`, FR racine, EN sous `en/` ; config Playwright des captures réutilisant le `webServer` de `e2e/` ; recettes `docs-dev`, `docs-build`, `docs-shots`, `build` construit la doc d'abord ; lien « Help/Aide » dans l'écran d'accueil.
- Suite : cargo 326 passés / 0 échoué (baseline 320 + 6 docs), web 3/0, e2e 16/0 (baseline 1 + 15).
- Questions ouvertes : aucune

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `getting-started.md` (FR/EN) : la page disait que l'écran d'accueil « affiche le nom du dépôt » alors qu'il affiche le nom et le slogan de relief. **Appliqué** par l'orchestrateur à l'étape 8 (le nom du dépôt est dans le titre de l'onglet).
  - `crates/relief-server/src/docs.rs` : le rejet des chemins `..` n'est couvert par aucun test ; ajouter un cas `/docs/../Cargo.toml` → 404. Non appliqué (le code est correct) ; à reprendre par un ticket de suivi via tdd-red.
  - `crates/relief-server/Cargo.toml` : `mime_guess` déclaré en plus de la feature `mime-guess` de `rust-embed`. Acceptable.
  - `docs.rs` : le calcul des `candidates` pourrait passer par une petite fonction « nom d'index pour ce chemin ».

## Vérification dans le navigateur

Non faite : pas d'écran avant U01 (`UI: non`). Le seul ajout visible, le lien « Help »/« Aide » de l'accueil, est couvert par `e2e/tests/docs.spec.ts`.

## Documentation

Site créé (7 pages × FR/EN, « À venir » là où la fonctionnalité manque). Page `getting-started` : capture de l'accueil (`just docs-shots getting-started`), wording corrigé. `just docs-build` : 17 pages, Complete.

Dette de doc reprise des tickets archivés, non écrite ici (F05 ne demande que la structure) — pour un ticket de suivi :
- `cli` § `show` : `relief show [ref]`, options globales `--repo`, `--json` (C01) ; arêtes `imports`/`calls`/`renders`/`references`, nœuds `external` quand `TsAdapter` sera branché (T02, T03).
- `cli` § `diff` : `relief diff`, plages `A..B` / `A...B` / `WORKTREE` / `INDEX`, défaut WORKTREE vs HEAD (C02, G02, G03).
- `cli` § cache : `--no-cache`, `~/.cache/relief/<repo-id>/index.sqlite`, `RELIEF_CACHE_DIR` (I02).
- `getting-started` / `cli` § `serve` : `relief serve [range]`, plage par défaut, `--port`, `--no-open`, titre d'onglet `<repo> · relief` (C03, F04).
- `review` : signatures cassantes/compatibles et `reason` (E02), nouveaux couplages (E03), symboles `moved` (E04), fichiers « reformatage seul » (E05).
- Doc contributeurs (hors site) : `just e2e` / `just e2e-summary`, `E2E_ALL_BROWSERS=1` (F04).

## Answer

- `user-docs/` : Starlight 0.43.1 / Astro 7.4.13 épinglés (lockfile commité), `base: '/docs'`, FR à la racine, EN sous `en/`, logo de la maquette, barre latérale des 7 pages.
- `user-docs/screenshots/` : config Playwright qui réutilise le `webServer` de `e2e/` (extrait dans `e2e/web-server.ts`), `getting-started.shot.ts` → `src/assets/screens/{fr,en}/home.png`.
- `relief serve` sert `/docs` depuis `user-docs/dist` embarqué (rust-embed, absence tolérée) ou depuis `ServerOptions.docs_dir` ; dossier → `index.html`, 404 sans repli sur l'UI, `..` refusé.
- Lien « Help »/« Aide » sur l'écran d'accueil (`home.help` en EN/FR).
- `justfile` : `docs-dev`, `docs-build`, `docs-shots [page]` ; `build` construit la doc ; `setup` et `lint` couvrent `user-docs/` et `e2e/`.
- Vérifié : cargo 326/0 (baseline 320), web 3/0, e2e 16/0 (baseline 1), `just lint` propre, `just docs-build` et `just docs-shots getting-started` passent ; aucun processus restant, rien dans `~/.cache/relief`.
