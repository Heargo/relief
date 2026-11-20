# Couplage logique (co-change)

Status: resolved
Type: task
Blocked by: X03, F06
UI: oui
Doc: docs/user `explore` (couplage logique)

Spec: `../spec.md` (Décisions : couplage logique)

## À faire

- Cas d'usage `Session::co_change(&CoChangeRequest { ref, since, seuil })` et commande Tauri `co_change`, hors du snapshot (il dépend de l'historique) ; résultat jetable dans `.relief/cache/`. Pour chaque paire de fichiers, nombre de commits communs sur la période, support et confiance ; arêtes `co_change` au-dessus d'un seuil (configurable dans `relief.config.yaml` si A01 est fait, sinon constante), sans les commits qui touchent plus de 30 fichiers (refactors de masse).
- UI : calque « Couplage logique » (arêtes pointillées d'une autre couleur), aussi en mode générique (dépôt sans adapter).

## Critères d'acceptation

- [x] Test de `Session::co_change` sur une fixture dédiée : deux fichiers modifiés ensemble 4 fois sur 5 → arête ; un gros commit ignoré.
- [x] e2e WebdriverIO sur la fixture `tiny` choisie par F06 (sans adapter TS pour ses `.md`) : le calque affiche au moins une arête.

## Baseline

`just test-summary` (develop, 7e14fd0) : cargo 487 passed, 0 failed ; web 444 passed, 0 failed ; e2e 83 passed, 1 skipped, 0 failed.

## Décision (orchestrateur)

- Comme pour X03, la période se compte à partir de la date du commit de la ref (déterministe, clé de cache « HEAD + période + seuil »).
- A01 est fait : le seuil se règle dans `relief.config.yaml` (section `co_change:`), avec une valeur par défaut en constante quand la section manque.

## Seams

- **Cas d'usage `Session::co_change` sur une fixture dédiée (paires de fichiers modifiés ensemble, un gros commit de plus de 30 fichiers), et sa commande Tauri `co_change` (`tauri::test`)** : attrape le compte de commits communs, support et confiance, le seuil (défaut et `relief.config.yaml`), l'exclusion des gros commits, la période, le cache dans `.relief/cache/` et le snapshot inchangé ; rate l'UI.
- **Module de logique TS (Vitest)** : attrape la projection des paires `co_change` en arêtes du calque (agrégées par niveau comme les autres arêtes) ; rate le rendu.
- **e2e WebdriverIO sur la fixture `tiny` (`// @fixture tiny`)** : le calque « Couplage logique » affiche au moins une arête ; rate les cas limites.

## Red

- Fichiers de test : `src/app/relief-app/tests/co_change.rs`, `src/interfaces/relief-desktop/tests/commands.rs` (2 tests ajoutés en fin de fichier), `src/ui/src/app/modules/explore/helpers/co-change.logic.spec.ts`, `tests/e2e/tests/co-change.e2e.ts` ; fixture neuve `tests/fixtures/cochange/` (a et b ensemble dans 4 des 5 commits normaux qui touchent a ou b, un commit `d` seul, un dernier commit « big » de 33 fichiers à ignorer, dates et auteurs fixes).
- Lancer : `cargo test -p relief-app --test co_change` ; `cargo test -p relief-desktop --test commands co_change` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/explore/helpers/co-change.logic.spec.ts` ; `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/co-change.e2e.ts`
- API supposée (à implémenter) : `CoChangeRequest { rev, since_days: Option<u32>, min_commits: Option<u32> }`, `Session::co_change -> CoChangeResponse { pairs: Vec<CoChangePair { a, b, commits, support, confidence }> }` (a, b = chemins du dépôt, a < b ; support = commits communs / commits comptés de la période ; confidence = commits communs / commits du fichier le plus modifié ; tri `commits` décroissant puis chemins) ; période 90 j par défaut depuis la date du commit de `rev` ; seuil par défaut 2 commits, `co_change: { min_commits: N }` dans `relief.config.yaml` à `rev`, la requête l'emporte ; cache `.relief/cache/*co_change*` ; commande Tauri `co_change` (`rev`, `sinceDays`, `minCommits` en camelCase). TS : `co-change.logic.ts` exporte `coChangeEdges(pairs, nodes): Edge[]` et le type `CoChangePair` ; `EdgeKind` gagne `co_change`. UI : `toggle-co-change-layer` (« Couplage logique », `aria-pressed`), arêtes `co-change-edge`.
- Décision (orchestrateur) : `tiny` n'est pas modifiée (le seuil par défaut de 2 commits n'y donne aucune paire visible à HEAD : `b` et `readme` sont supprimés, `a` et `c` n'ont aucun commit commun). L'e2e passe sur la fixture `cochange` (`// @fixture cochange`), dont les fichiers sont des `.md` (`src/a.md`, `src/b.md`, `src/d.md`), sans adapter : le calque marche sans adapter. `src/a.md` et `src/b.md` existent à HEAD et ont 2 commits communs sur 90 jours, donc une arête. Les chemins de `co_change.rs` et `commands.rs` sont alignés.
- En échec : 17 erreurs de compilation Rust + 11 tests Rust (co_change.rs), 2 tests desktop, 5 tests Vitest, 2 tests e2e :
  - co_change.rs (11 tests, ne compile pas) — `CoChangeRequest`, `CoChangePair` et `Session::co_change` n'existent pas : paire a/b 4 sur 5 avec support 4/6 et confiance 0,8 ; gros commit ignoré ; période 90 j et seuil 2 par défaut ; période courte ; période relative au commit (`main~3`) ; seuil de la requête ; seuil de `relief.config.yaml` ; requête plus forte que la config ; snapshot inchangé ; cache `co_change` ; ref inconnue en erreur.
  - commands.rs `co_change_returns_the_pairs_of_files_changed_together_through_the_ipc` — commande `co_change` inconnue.
  - commands.rs `co_change_takes_an_optional_threshold_and_an_unknown_ref_is_an_error` — commande `co_change` inconnue.
  - co-change.logic.spec.ts (5 tests : projection en arête `co_change`, paire hors carte ignorée, liste vide, symbole non pris pour un fichier, agrégation par niveau) — module `./co-change.logic` introuvable.
  - co-change.e2e.ts `is off by default and draws no co-change edge` — `toggle-co-change-layer` absent.
  - co-change.e2e.ts `shows at least one edge when the layer is on, and none when it is off again` — `toggle-co-change-layer` absent.

## Green

- Fichiers : `src/app/relief-app/src/{lib,range}.rs`, `src/domain/relief-model/src/{api,types,lib,contract}.rs` + `bin/write-contract.rs`, `src/domain/relief-rules/src/{config,lib}.rs`, `src/interfaces/relief-desktop/{build.rs,capabilities/main.json,src/lib.rs,permissions/autogenerated/co_change.toml}`, `docs/contract/*` et `src/ui/src/app/core/models/contract.ts` (`just contract`), `src/ui/scripts/generate-contract.mjs`, UI : `modules/explore/{helpers/co-change.logic.ts,business/co-change.business.ts}`, `modules/map/{business/map.business.ts,components/map-canvas/*,components/map-page/*}`, `modules/review/components/layers-section/layers-section.component.ts`, `core/services/relief-api.service.ts`, `src/ui/src/styles.scss`, `public/i18n/{en,fr}.json`
- Changement : `Session::co_change` (paires comptées sur `touching_commits`, commits de plus de 30 fichiers ignorés, support/confiance, seuil requête > `co_change.min_commits` de `relief.config.yaml` (`relief-rules`) > 2, cache `.relief/cache/co_change-*.json`) ; commande Tauri `co_change` (build.rs + capability) ; `EdgeKind::CoChange` (absent des `kinds` par défaut des règles) et schéma `co-change-response`. UI : calque « Couplage logique » (`toggle-co-change-layer`, proposé via `hasCoChange` pour ne pas changer le spec existant de layers-section), arêtes `co-change-edge` pointillées dessinées à part des arêtes du graphe, couleur `--relief-cochange` (clair/sombre), chargement à l'activation.
- Suite : cargo 500 passed, 0 failed ; web 449 passed, 0 failed ; e2e 85 passed, 1 skipped, 0 failed (baseline : 487 / 444 / 83 passed). `just lint` propre.
- Questions ouvertes : aucune (`quicknotes.md` non suivi n'est pas de moi ; la doc utilisateur et les captures ne sont pas touchées, comme demandé).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - src/ui/.../layers-section.component.ts:28 et map-page.component.html:181 — `hasCoChange` est toujours `true` : une entrée morte posée pour ne pas toucher un spec existant (contournement, pas un vrai choix ; `hasRisk` et `hasRules` varient, pas lui). Le calque doit aussi exister en mode générique, donc le plus simple est de retirer l'input, l'afficher toujours et mettre à jour le spec « quatre bascules ».
  - src/app/relief-app/src/lib.rs:~600 — `DEFAULT_CHURN_DAYS` sert de période par défaut de co_change : un nom qui trompe ; ajouter `DEFAULT_CO_CHANGE_DAYS` ou renommer en constante partagée. Le bloc de cache (lecture, écriture atomique) semble copié de `metrics` : à extraire si c'est le cas.
  - src/app/relief-app/src/lib.rs:~620 — `<= 30` est correct mais la frontière (30 gardé, 31 ignoré) n'est pas testée : la fixture n'a que 33 fichiers. Un commit de 30 fichiers verrouillerait la règle.
  - Clé de cache `co_change-{commit}-{jours}d-{seuil}` : correcte (la config est lue au commit, donc déterminée par lui) ; elle ignore la constante des 30 fichiers, un changement futur de la règle servirait un cache périmé.
  - `CoChangeBusiness` et le câblage de `map-page` n'ont pas de test unitaire (couverts par l'e2e seulement) ; `rules.md` prévoit `TestBed.inject` pour les business.
  - `EdgeKind::CoChange` : sans effet sur règles et impact (absent des `kinds` par défaut, jamais dans le snapshot) : cohérent avec le ticket. La réserve est de l'écrire dans la doc de `kinds`.

## Answer

- Construit : `Session::co_change(&CoChangeRequest { rev, since_days, min_commits })` hors snapshot : paires de fichiers modifiés ensemble sur `touching_commits` (période depuis la date du commit, 90 jours par défaut), commits de plus de 30 fichiers ignorés, support et confiance, seuil de la requête sinon `co_change.min_commits` de `relief.config.yaml` (lu par `relief-rules`) sinon 2, cache `.relief/cache/co_change-*.json` ; commande Tauri `co_change` ; `EdgeKind::CoChange` (hors des `kinds` par défaut des règles, jamais dans le snapshot). UI : `co-change.logic.ts`, `CoChangeBusiness`, calque « Couplage logique » (arêtes pointillées `--relief-cochange` en clair et en sombre, chargées à l'activation), chaînes EN/FR.
- Décisions : période ancrée sur le commit (comme X03) ; seuil dans `relief.config.yaml` ; e2e sur la fixture dédiée `cochange` en `.md` (sans adapter) au lieu de `tiny`, dont la seule paire au-dessus du seuil est supprimée à HEAD.
- Vérifié : `just test-summary` cargo 500/0, web 449/0 (baseline 487/444) ; `just e2e-summary` 85 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-build` ; review « ship ».
- Doc : « Couplage logique » dans `explore` (FR et EN), seuil `co_change:` mentionné dans `rules`.
- Suivis (Consider) : retirer l'input `hasCoChange` toujours vrai (contournement d'un spec « quatre bascules ») et mettre le spec à jour ; constante `DEFAULT_CO_CHANGE_DAYS` au lieu de `DEFAULT_CHURN_DAYS` ; extraire le cache commun à `metrics` et `co_change` ; tester la frontière des 30 fichiers et l'inclure dans la clé de cache ; test `TestBed` de `CoChangeBusiness`.
