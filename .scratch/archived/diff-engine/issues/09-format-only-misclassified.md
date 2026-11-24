# « Format seul » attribué à de vrais changements, et diff texte introuvable

Status: resolved
Type: bug
Blocked by: aucun
UI: oui
Doc: docs/user `review`

Spec: `../spec.md` (Décisions : format_only)

## Signalement (2026-11-24)

« Tout changement semble flag comme un changement de formatage et donc masqué. Et quand je clique sur afficher quand même le diff, ça n'affiche rien. »

## Cause

- `relief_diff::format_only_files` classe `format_only` tout fichier modifié pour git sans nœud ni arête changés (E05). Cette règle ne vaut que si un adapter de langage a analysé le fichier et que ses `content_hash` ignorent espaces et commentaires. Un fichier qu'aucun adapter ne lit (Rust, Go, JSON, HTML, CSS, YAML…), ou un changement hors de tout symbole qu'aucun hash ne couvre, passe donc pour un reformatage : sur un dépôt dans une langue non gérée, **tous** les changements sont masqués.
- Panneau de diff (`diff-panel`) : « Afficher quand même le diff texte » ne montre que les blocs des symboles changés. Un fichier sans symbole changé n'en a aucun, donc rien ne s'affiche.

## Comportement attendu

- `format_only` = le texte du fichier est identique des deux côtés une fois les blancs retirés (espaces, tabulations, retours à la ligne), **ou** le fichier est analysé par un adapter et aucun de ses nœuds/arêtes n'a changé (règle E05, qui couvre les commentaires). Un fichier non analysé dont le texte change vraiment n'est **pas** `format_only`.
- Un fichier modifié sans changement structurel mais qui n'est pas `format_only` reste visible comme changement de texte (liste des fichiers, ordre de lecture, carte selon ce qui existe déjà pour les fichiers changés).
- Panneau de diff d'un fichier sans symbole changé (format seul après « Afficher quand même », ou changement de texte) : le diff texte du fichier entier, base contre head.
- Monodépôt et espace de travail (chemins `repo:<nom>/…`).

## Critères d'acceptation

- [x] Cœur, sur un dépôt de fixture : un fichier non analysé (ex. `.rs` ou `.json`) dont le texte change n'est pas `format_only` ; le même fichier ne changeant que d'indentation l'est ; `client.ts` d'acme-shop (prettier) reste `format_only` (E05).
- [x] UI : « Afficher quand même le diff texte » sur un fichier `format_only` montre son diff texte ; un fichier changé sans symbole montre son diff texte sans clic.
- [x] e2e sur une fixture : un fichier non analysé modifié apparaît comme changé et son diff texte s'affiche.
- [x] Doc FR/EN (`review`, définition de « format seul »).

## Baseline

Après `cecc024` : cargo 822/0 ; web 1156/0 ; e2e 199 passés, 1 ignoré.

## Seams

- **API publique de `relief-diff` / cas d'usage `relief-app` sur un dépôt de fixture** : classement `format_only` (fichier non analysé changé vs reformaté seulement ; `client.ts` d'acme-shop inchangé). Rate l'UI.
- **Logique / composant `diff-panel`** (`diff-panel.logic.ts`, composant avec `TEST_PROVIDERS`, `ReliefApiService` mocké) : diff texte du fichier entier quand aucun symbole n'a changé, après « Afficher quand même » ou d'emblée pour un changement de texte. Rate la lecture réelle du code.
- **e2e** sur une fixture (une existante, ou une nouvelle avec un fichier non TS modifié) : le fichier apparaît changé et son diff texte s'affiche dans le panneau. Rate les cas limites.

## Red

- Fichiers de test : `src/app/relief-app/tests/format_only_unanalysed.rs` (nouveau), `src/ui/src/app/modules/review/components/diff-panel/diff-panel.component.spec.ts` et `src/ui/src/app/modules/review/helpers/diff-panel.logic.spec.ts` (modifiés), `tests/e2e/tests/unanalysed-text-change.e2e.ts` + fixture `tests/fixtures/unanalysed/` (nouveaux)
- Contrat attendu : `DiffResponse.format_only_paths: Vec<String>` (TS `formatOnlyPaths?: string[]`, chemins comme `diff.files`, `repo:<nom>/…` en espace de travail) ; l'UI ne masque le texte que pour ces chemins.
- Lancer :
  - `cargo test -p relief-app --test format_only_unanalysed`
  - `cd src/ui && npx ng test --watch=false --include "**/diff-panel.component.spec.ts"` puis `--include "**/diff-panel.logic.spec.ts"`
  - `cd tests/e2e && timeout 600 xvfb-run -a npx wdio run wdio.conf.ts --spec tests/unanalysed-text-change.e2e.ts`
- En échec :
  - Rust, 9 tests (java changé, java indentation, java reflow, html changé, commentaire, md changé, md indentation, client.ts acme, espace de travail `repo:api/…`/`repo:web/…`) — ne compilent pas : champ `format_only_paths` absent de `DiffResponse`.
  - diff-panel.component.spec — « shows the text diff of the whole file without any click » et « does not hide it when another file is the format-only one » : le panneau masque tout fichier sans symbole changé.
  - diff-panel.logic.spec — « is null for a changed file the API does not list as format-only » : renvoie 2 au lieu de null.
  - e2e « a changed file no adapter reads » : `diff-format-only` affiché pour le template `.html` réellement modifié.

## Green

- Fichiers : src/domain/relief-model/src/api.rs, src/app/relief-app/src/lib.rs, src/ui/src/app/modules/review/helpers/diff-panel.logic.ts, docs/contract/diff-response.schema.json, src/ui/src/app/core/models/contract.ts, docs/user/src/content/docs/review.md et en/review.md, snapshots insta commit_diff__auth_commit_diff et python_diff__py_shop_diff
- Changement : `DiffResponse.format_only_paths` ; `Session::mark_text_changes` (relief-app) marque d'un NodeChange `Modified` le nœud fichier d'un fichier sans changement structurel, non lu par un adapter (`handles(lang)`), dont le texte diffère une fois les blancs retirés, donc toutes les sorties (résumé, ordre de lecture, par commit, espace de travail) suivent ; `formatOnlyHiddenLines` ne masque que les chemins de `formatOnlyPaths` (repli ancien comportement si le champ est absent) ; doc FR/EN.
- Suite : cargo 831/0, web 1159/0 (baseline 822/0, 1156/0) ; e2e `unanalysed-text-change` et `diff-layer` passent ; lint propre.
- Questions ouvertes : deux snapshots insta existants acceptés (seule ligne ajoutée `"formatOnlyPaths": []`) ; le repli sur champ absent évite de toucher `diff-workspace-paths.logic.spec.ts`.

## Review

Verdict : ship. Correction orchestrateur du test rouge : indentation Java 3/3 lignes (la ligne `}` ne change pas). Considers appliqués : plus de repli « champ absent → ancien comportement » (absent = rien de masqué) ; test de composant avec le nœud fichier `Modified` réel (`diff-panel-text-change.component.spec.ts`) ; un seul `list_tree` par côté. Suivi : code de haut niveau d'un fichier analysé encore classé format seul (E10). Snapshots `insta` : une ligne `"formatOnlyPaths": []` ajoutée.

## Answer

- Cœur : `Session::mark_text_changes` marque `Modified` le nœud fichier d'un fichier sans changement structurel qu'aucun adapter ne lit (`adapter.handles(lang)`) et dont le texte diffère une fois les blancs retirés ; il n'est donc plus `format_only` (résumé, ordre de lecture, badges, lecture par commit, espace de travail suivent). `DiffResponse.format_only_paths` (contrat régénéré).
- UI : seul un chemin de `formatOnlyPaths` est masqué ; un fichier sans symbole changé montre le diff texte du fichier entier, sans clic ou après « Afficher quand même ».
- Fixture `tests/fixtures/unanalysed` (Java, template Angular) ; tests Java, `.html`, `.md`, espace de travail.
- Vérifié : cargo 831/0, web 1160/0, e2e 200 passés / 1 ignoré, lint propre, docs-build.
- Doc : `review` FR/EN (définition de « format seul »).
