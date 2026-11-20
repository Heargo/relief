# Doc utilisateur dans l'app

Status: resolved
Type: task
Blocked by: N07
UI: oui
Doc: `docs/user` « Commencer » (installer et lancer l'app)

Spec: `../spec.md` (Décisions : app native) ; ADR 0004, 0006

## À faire

- La doc construite (`docs/user/dist`) est embarquée dans l'app ; le lien « Aide » l'ouvre dans une seconde fenêtre, hors ligne, dans la langue de l'UI.
- Réactiver `describe.skip('docs in the app: N08')` de `tests/e2e/tests/docs.e2e.ts`.
- Réécrire « Commencer » en FR et EN : prérequis (dont `webkit2gtk-4.1` sous Linux), construire et installer depuis les sources, `relief <path> [range]`, le dossier `.relief/`.

## Critères d'acceptation

- [x] e2e : le lien « Aide » ouvre une fenêtre sur la page d'accueil de la doc, en français quand l'UI est en français.
- [x] `just docs-build` passe ; « Commencer » ne mentionne plus `relief serve`.

## Baseline

Après N07 (`f72a3ed`) : cargo 383, web 320, `just e2e-summary` → 38 passed, 20 skipped, 0 failed ; `just lint` et `just docs-build` propres.

## Décisions (orchestrateur)

- **Embarquement** : la doc garde `base: '/docs'`. `just build` copie `docs/user/dist/` dans `src/ui/dist/relief/browser/docs/` après `ng build` et avant `cargo build`, pour qu'elle fasse partie du `frontendDist` embarqué par Tauri. Pas d'entrée `assets` dans `angular.json` (un clone neuf sans doc construite casserait `ng build` et `just lint`). Conséquence acceptée : sous `just dev` (`ng serve`), le lien Aide n'a pas de doc ; le dire dans `docs/dev/rules.md`.
- **Seconde fenêtre** : nouvelle commande Tauri `open_docs { lang }` (`lang` = `fr` ou `en`, toute autre valeur → `bad_request`) qui ouvre une fenêtre de label `docs` sur `docs/` (français, racine) ou `docs/en/`, ou la ramène au premier plan et la renvoie à cette page si elle existe déjà. La capability `main` gagne `allow-open-docs` ; la fenêtre `docs` n'a aucune capability (aucune commande). Vérifier que Tauri résout `docs/<page>/` vers `index.html` ; sinon ouvrir `docs/index.html` / `docs/en/index.html` explicitement.
- **CSP** : les pages Starlight ont des scripts inline ; Tauri ajoute leurs empreintes à la CSP des HTML embarqués. Vérifier que les pages s'affichent, que le thème et la navigation marchent ; la recherche Pagefind peut demander `'wasm-unsafe-eval'` dans `script-src` : l'ajouter seulement si la recherche en a besoin, et le dire.
- **UI** : le lien « Aide » (`relief-page.component.html` et `map-page.component.html`) devient un bouton (ou un lien dont le clic est intercepté) qui appelle `ReliefApiService.openDocs(lang)` avec la langue courante de l'UI ; le libellé visible reste « Aide » / « Help ».
- **Doc** : « Commencer » réécrite en FR et EN : prérequis (Rust, Node, sous Linux `webkit2gtk-4.1` à l'exécution), construire et installer depuis les sources (`just build`, puis où trouver `target/release/relief` ou `cargo install --path src/interfaces/relief-desktop --features custom-protocol` si c'est ce qui marche ; à vérifier), `relief [path] [range]`, la doc dans l'app (Aide), le dossier `.relief/`. Captures inchangées sauf si la page en ajoute.
- **e2e** : `docs.e2e.ts` réactivé. Les visites de pages passent par la fenêtre de doc (ouverte par Aide, puis navigation dans cette fenêtre vers chaque page) ; le test du lien Aide vérifie qu'une seconde fenêtre s'ouvre sur l'accueil de la doc, en français quand l'UI est en français et en anglais quand elle est en anglais.

## Seams

1. **`ReliefApiService.openDocs` et le lien Aide en Vitest** : `invoke('open_docs', { lang })` avec la langue courante ; le composant appelle le service au clic. Attrape : le câblage UI. Rate : la fenêtre.
2. **Commande `open_docs` en `tauri::test`** (`relief-desktop/tests/commands.rs`) : `lang` invalide → `{ code: 'bad_request' }` ; `fr`/`en` acceptés (la création de fenêtre sous `MockRuntime` peut ne pas être observable : tester ce qui l'est, et le dire). Attrape : le contrat de la commande. Rate : le rendu.
3. **e2e `docs.e2e.ts` réactivé** sur l'app construite : le lien Aide ouvre la fenêtre de doc dans la langue de l'UI ; chaque page FR et EN a un seul `h1` ; « Commencer » a ses captures chargées et la commande d'installation. Attrape : l'embarquement, la CSP, la fenêtre. Rate : rien.

## Red

- Fichiers de test : `src/ui/src/app/core/services/relief-api.service.spec.ts`, `src/ui/src/app/core/components/relief-page/relief-page.component.spec.ts`, `src/ui/src/app/modules/map/components/map-page/map-page.component.spec.ts`, `src/interfaces/relief-desktop/tests/commands.rs`, `tests/e2e/tests/docs.e2e.ts`
- Lancer : `cargo test -p relief-desktop --test commands` ; `cd src/ui && npx ng test --watch=false --include src/app/<chemin>.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/docs.e2e.ts` (e2e non lancé : l'app n'embarque pas encore la doc)
- En échec :
  - service `openDocs invokes open_docs…` et `openDocs rejects…` (2) — `openDocs` n'existe pas (le bundle ne compile pas, tout le fichier est rouge)
  - `ReliefPageComponent help link` EN/FR (2) — le lien est un `<a href>`, `openDocs` n'est jamais appelé
  - `MapPageComponent` Help link EN/FR (2) — idem
  - `open_docs_with_an_unknown_language_is_bad_request`, `open_docs_accepts_french_and_english`, `open_docs_creates_one_window_labelled_docs` (3) — « Command open_docs not found ». `MockRuntime` permet de lister les fenêtres, pas de lire leur URL (laissée à l'e2e) ; la dernière assertion (une seule fenêtre `docs` après deux appels) est à confirmer en green.
  - `docs.e2e.ts` (réactivé, non exécuté) : 2 tests du lien Aide (EN/FR, fenêtre `docs`, `lang` de `<html>`), 14 pages, 4 tests des captures et du contenu de « Commencer » (`webkit2gtk-4.1`, `cargo install --path src/interfaces/relief-desktop`, `relief [path] [range]`, `.relief/`, pas de `relief serve`). Si green garde une autre commande d'installation, adapter cette attente.

## Green

- Fichiers : `src/interfaces/relief-desktop/{build.rs,capabilities/main.json,src/lib.rs,permissions/autogenerated/open_docs.toml}`, `src/ui/src/app/core/{services/relief-api.service.ts,business/docs.business.ts,components/relief-page/*}`, `src/ui/src/app/modules/map/components/map-page/map-page.component.{ts,html}`, `justfile`, `docs/dev/rules.md`, `docs/user/src/content/docs/{getting-started,en/getting-started}.md`, `tests/e2e/wdio.base.ts`
- Changement : commande `open_docs { lang }` (fenêtre `docs` unique ; si elle existe, elle est détruite puis recréée sur la bonne page, car une fenêtre dont le webview est fermé par le driver reste enregistrée ; repli sur navigation + focus si le runtime la garde, cas du MockRuntime). `ReliefApiService.openDocs`, `DocsBusiness.open()`, liens Aide gardés en `<a href="/docs/">` (les anciens tests de map-page l'exigent) dont le clic est intercepté. `just build` copie `docs/user/dist` dans `src/ui/dist/relief/browser/docs`. « Commencer » réécrite FR/EN. CSP inchangée (pages, thème, navigation OK ; la recherche Pagefind n'a pas été exercée, `'wasm-unsafe-eval'` non ajouté). `baseUrl: 'tauri://localhost'` ajouté à `wdio.base.ts` pour que `browser.url('/docs/…')` de `docs.e2e.ts` marche.
- Suite : cargo 386/0 (baseline 383), web 326/0 (320), e2e 11 specs passées, 1 skipped (zoom), 0 failed (un `node-panel` flaky vu une fois dans un run complet, vert ensuite et seul) ; clippy, prettier, `ng build`, `docs-build` propres.
- Questions ouvertes : `cargo fmt --check` échoue sur `tests/commands.rs` (test rouge indexé, ligne `assert_error(... "de" ...)` à reformater) : à corriger à l'étape review. `cargo install --path src/interfaces/relief-desktop --features custom-protocol` suffit (vérifié) à condition que l'UI et la doc soient construites et copiées d'abord ; la page « Commencer » le documente, pas d'écart avec l'e2e.

## Review

- Verdict : ship. Appliqué : formulation de « Commencer » (« `just build` construit la documentation et l'interface, copie la documentation, puis compile… » au lieu de « les trois premières étapes »).
- Consider (non traités) : `open_docs` détruit puis recrée une fenêtre `docs` existante (une fenêtre fermée par le driver reste enregistrée dans Tauri), au lieu de la ramener au premier plan : un clic sur Aide perd la page et le défilement de la doc ; l'attente de destruction (50 × 20 ms) est un nombre magique ; un échec de `open_docs` n'est visible que dans la console ; la recherche Pagefind n'est pas exercée (CSP sans `'wasm-unsafe-eval'`), à vérifier à la main.

## Answer

- La doc construite (`docs/user/dist`) est copiée par `just build` dans `src/ui/dist/relief/browser/docs/` et embarquée dans l'app ; elle n'existe pas sous `just dev` (dit dans `docs/dev/rules.md`).
- Commande `open_docs { lang }` (`fr` ou `en`, sinon `bad_request`) : ouvre la fenêtre `docs` sur `docs/` ou `docs/en/` ; la fenêtre n'a aucune capability. Le lien Aide (page d'accueil et carte) reste un `<a href="/docs/">` dont le clic est intercepté par `DocsBusiness.open()`, qui appelle `ReliefApiService.openDocs` avec la langue de l'UI.
- « Commencer » réécrite en FR et EN : prérequis (Rust, Node, `webkit2gtk-4.1`), construction pas à pas puis `cargo install --path src/interfaces/relief-desktop --features custom-protocol` (vérifié dans un dossier temporaire), `relief [path] [range]`, Aide, `.relief/`.
- `docs.e2e.ts` réactivé : lien Aide en FR et EN (seconde fenêtre, page d'accueil, `lang`), chaque page FR et EN, « Commencer ». Le harnais gagne `baseUrl: 'tauri://localhost'`.
- Vérifié : cargo 386, web 326, `just e2e-summary` deux fois → `58 passed, 1 skipped, 0 failed`, `just lint` et `just docs-build` propres. CSP inchangée.
