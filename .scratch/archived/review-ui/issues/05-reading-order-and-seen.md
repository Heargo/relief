# Ordre de lecture (fichier, symbole) et marquage « vu »

Status: resolved
Type: task
Blocked by: R01, E07
UI: oui
Doc: docs/user `review` (ordre de lecture, progression)

Spec: `../spec.md` (Décisions : ordre de lecture, vu)

## À faire

- Section « Ordre de lecture » : sélecteur Fichier (défaut) / Symbole (Commit arrive en R06), liste numérotée avec statut, raisons, case « vu », progression.
- « Vu » par symbole : marquer un fichier marque ses symboles changés ; un fichier est vu quand tous le sont. Boutons « Marquer vu » et « Vu, suivant → », touches `v`, `n`, `p`.
- Persistance par le cœur : cas d'usage `Session::review_state(range)` et `Session::set_review_state(range, state)` dans `relief-app`, commandes Tauri `review_state` et `set_review_state`, méthodes de `ReliefApiService`.
- Stockage : `.relief/state/review/<clé de plage>.json` (`DataDir::state_dir()` ; repli `~/.cache/relief/<repo-id>/state/` pour un dépôt bare ou en lecture seule). La clé est un hash du texte de la plage ; le fichier garde le texte en clair. Écriture atomique (fichier temporaire puis `rename`).
- Sans dossier de données (tests avec `data_dir: None`) : erreur au code stable (`no_data_dir`) ; l'UI garde l'état en mémoire et le dit.
- Plusieurs process sur le même dépôt : dernière écriture gagnante ; l'état est relu à l'ouverture d'une plage.
- Les nœuds vus sont atténués sur la carte ; les conteneurs affichent « x/y vus ».
- Helper de harnais e2e qui vide `.relief/state/` avant chaque spec (acme-shop est construite une fois pour toute la suite).

## Critères d'acceptation

- [x] Test du cas d'usage : un `set_review_state` puis un `review_state` sur une **nouvelle** `Session` du même dossier de données redonnent le même état ; l'état d'une autre plage n'est pas mélangé ; sans dossier de données, le code `no_data_dir`.
- [x] e2e WebdriverIO : `n` sélectionne le premier fichier de l'ordre, `v` le marque vu, la progression passe à 1/14 et reste après `browser.refresh()`.
- [x] e2e : en mode Symbole, la liste a 22 entrées (19 dans la maquette : valeur réelle retenue par E07) et marquer `computeTotal` ne marque pas tout `invoice.ts`.
- [x] Page `review` (FR et EN) à jour ; elle dit que la progression est dans `.relief/state/`.

## Baseline

`just test-summary` (develop, 2381a24) : cargo 410 passed, 0 failed ; web 348 passed, 0 failed.

## Seams

- **Cas d'usage de `relief-app` sur la fixture acme-shop avec un dossier de données temporaire** : `Session::review_state` / `set_review_state` (relecture par une nouvelle `Session`, plages séparées, `no_data_dir`, écriture atomique) et l'ordre de lecture exposé à l'UI (par `Session::review_summary` ou un cas d'usage `Session::reading_order` qui appelle `relief_diff::reading_order`) ; rate le transport Tauri et l'UI.
- **Module de logique TS `reading-order.logic.ts` (Vitest)** : attrape la règle « vu » par symbole (marquer un fichier marque ses symboles changés, un fichier est vu quand tous le sont), la progression, le suivant/précédent et « x/y vus » d'un conteneur ; rate le rendu et la persistance.
- **e2e WebdriverIO sur l'app construite et acme-shop** : `n`, `v`, progression 1/14 qui survit à `browser.refresh()`, mode Symbole à 22 entrées et `computeTotal` qui ne marque pas tout `invoice.ts` ; attrape les commandes Tauri, `ReliefApiService` et le helper qui vide `.relief/state/` ; rate les cas limites de la logique.

## Red

- Fichiers de test : `src/app/relief-app/tests/review_state.rs`, `src/ui/src/app/modules/review/helpers/reading-order.logic.spec.ts`, `tests/e2e/tests/reading-order.e2e.ts` (+ helper `tests/e2e/helpers/review-state.ts`, et `RELIEF_E2E_REPO` exporté dans `tests/e2e/wdio.base.ts`)
- Lancer : `cargo test -p relief-app --test review_state` ; `cd src/ui && npx --prefix web ng test --watch=false --include src/app/modules/review/helpers/reading-order.logic.spec.ts` ; `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/reading-order.e2e.ts` (build release à jour requis)
- API attendue (Rust) : `relief_model::ReviewState { seen: Vec<NodeId> }` (Default, PartialEq), `Session::review_state(&RangeSpec)`, `Session::set_review_state(&RangeSpec, &ReviewState)`, `Session::reading_order(&ReadingOrderRequest { range, granularity: relief_diff::Granularity }) -> ReadingOrderResponse { items: Vec<ReadingItem> }`, code `no_data_dir`
- API attendue (TS) : `reading-order.logic.ts` exporte `ChangedSymbols` (fichier -> symboles changés), `isSeen`, `toggleSeen`, `progress`, `step`, `nextUnseen`, `containerProgress`
- Contrat e2e : `data-testid` `reading-order`, `reading-mode-file`, `reading-mode-symbol`, `reading-row` (`data-node-id`, `data-seen`), `reading-progress` ; touches `n`, `v`
- En échec : 26 tests
  - Rust, 8 tests (`review_state.rs`, ne compile pas) — `ReviewState`, `ReadingOrderRequest`, `Session::review_state`, `set_review_state`, `reading_order` n'existent pas : a_new_session_reads_back_what_was_saved, a_range_never_saved_has_an_empty_state, the_state_of_another_range_is_not_mixed, the_last_write_wins, the_file_lives_in_state_review_with_the_range_text_in_clear_and_no_temp_left, without_a_data_dir_the_error_code_is_no_data_dir, reading_order_by_file_has_14_files, reading_order_by_symbol_has_22_symbols_including_compute_total
  - Vitest, 16 tests (`reading-order.logic.spec.ts`, module `./reading-order.logic` absent) : règle « vu » par symbole (7), progression (2), step/nextUnseen (5), progression de conteneur (2)
  - e2e, 2 tests — section `reading-order` absente : n/v/1 sur 14 persistant après refresh ; mode Symbole à 22 entrées et `computeTotal`

## Green

- Fichiers : `src/domain/relief-model/src/{api,lib,contract}.rs`, `src/domain/relief-model/src/bin/write-contract.rs`, `src/app/relief-app/src/{lib,error,range}.rs`, `src/app/relief-app/Cargo.toml`, `src/interfaces/relief-desktop/{src/lib.rs,build.rs,capabilities/main.json,permissions/autogenerated/*}`, `docs/contract/*`, `src/ui/src/app/core/{models/contract.ts,services/relief-api.service.ts}`, `src/ui/src/app/modules/review/{business/reading-order.business.ts,helpers/reading-order.logic.ts,components/reading-order-section/*}`, `src/ui/src/app/modules/map/{components/map-page/*,components/map-canvas/*,helpers/shortcuts.logic.ts}`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `ReviewState`, `ReadingOrderResponse` (types du contrat) ; `Session::review_state` / `set_review_state` (`state/review/<hash FNV-1a>.json`, écriture atomique, `no_data_dir`) et `Session::reading_order` ; commandes Tauri `review_state`, `set_review_state`, `reading_order` (+ permissions). UI : `reading-order.logic.ts`, `ReadingOrderBusiness`, section « Ordre de lecture » (Fichier/Symbole, boutons, progression), touches `n`/`p`/`v`, nœuds vus atténués et « x/y vus » sur les conteneurs. `changedSymbols` ajoute l'id du fichier à ses propres symboles quand ses lignes changées dépassent celles des symboles (sinon `invoice.ts` serait vu après `computeTotal`, ce que l'e2e refuse).
- Suite : cargo 418 réussis / 0 échoué (baseline 410) ; web 364 / 0 (baseline 348) ; e2e 61 réussis, 1 ignoré, 0 échoué.
- Questions ouvertes : (1) `just lint` échoue sur `cargo fmt --check` à cause de `src/app/relief-app/tests/review_state.rs` (assertion de `reading_order_by_symbol...` non formatée) ; je ne peux pas modifier ce fichier, à corriger par red. (2) Tests `tauri::test` des commandes `review_state`, `set_review_state`, `reading_order` non écrits (fichiers de test interdits) : à faire écrire par red dans `src/interfaces/relief-desktop/tests/commands.rs` (sonde manuelle OK : `reading_order` renvoie 14 fichiers, `review_state` sans dossier de données renvoie `no_data_dir`). (3) `changedSymbols` (logic TS) n'a pas de test unitaire : à faire écrire par red. (4) La doc utilisateur et les captures restent à faire (orchestrateur).

### Tests ajoutés après coup (verts d'emblée, aucun échec)

- `src/interfaces/relief-desktop/tests/commands.rs` (`cargo test -p relief-desktop --test commands`, 20 passed) : `reading_order_returns_14_files_by_file_and_22_symbols_by_symbol`, `reading_order_with_an_unknown_granularity_is_bad_request`, `review_state_round_trips_through_the_ipc` (harnais `harness_with(true)` avec dossier de données), `review_state_without_a_data_dir_is_no_data_dir`. Tous verts : les commandes existent déjà.
- `reading-order.logic.spec.ts`, bloc `changedSymbols` (3 tests, 19 passed au total) : fichier couvert par ses symboles, fichier avec lignes hors symbole (son id est ajouté), fichier sans symbole (liste vide). Tous verts : la règle actuelle les satisfait.

## Review

- Verdict : ship
- Must fix : aucun (doc utilisateur et captures reportées à l'orchestrateur)
- Consider :
  - `src/ui/src/app/modules/review/helpers/reading-order.logic.ts` (`changedSymbols`) — la règle compare les lignes du fichier à la somme des lignes des raisons des symboles. Un symbole ajouté, supprimé ou déplacé n'a pas de raison `lines` (voir `reading_order` dans `relief-diff/src/lib.rs`, `New`/`Removed`/`MovedIdentical`), alors que ses lignes comptent dans le fichier : un fichier modifié qui gagne une fonction reçoit donc son propre id, à tort. Conséquence : en mode Symbole, tous les symboles vus ne rendent pas le fichier vu, et « x/y vus » diverge entre les deux modes. Piste : faire porter le compte de lignes hors symbole par le cœur (champ dans `ReadingItem`) ou sommer aussi les lignes des symboles ajoutés/supprimés. À ajouter au spec : fichier avec un symbole `New`.
  - Fichier sans symbole : correct, marquable sur son propre id, compté dans la progression (test présent).
  - `relief-app/src/lib.rs` `set_review_state` — fichier temporaire au nom fixe : deux process simultanés peuvent se marcher dessus (dernier gagnant accepté par le ticket, mais le contenu peut se mélanger). Suffixer par le pid.
  - `reading-order.business.ts` `load` — un échec de `review_state` laisse `_seen` de la plage précédente ; vider `_seen` quand `state` est null.

### Tests ajoutés après la review (défaut `Lines` des symboles New/Removed)

- Rouge : `src/domain/relief-diff/tests/reading_order.rs::symbol_mode_gives_added_and_removed_symbols_their_lines_too` (`cargo test -p relief-diff --test reading_order`) — le symbole `New` n'a que `[New]`, attendu `[New, Lines { added: 5, removed: 0 }]` (idem `Removed`).
- Rouge : `src/ui/src/app/modules/review/business/reading-order.business.spec.ts` — après l'échec de `review_state` sur une nouvelle plage, l'état « vu » de la plage précédente reste (`_seen` non vidé dans `load`).
- Vert d'emblée : `reading-order.logic.spec.ts`, « a file whose only change is a new symbol does not get its own id » (la logique est correcte quand les données portent `Lines`; le défaut est côté cœur).

### Corrections de review

- `relief-diff` `reading_order` (mode Symbole) : les symboles ajoutés et supprimés portent aussi `Lines`. `relief-app` `set_review_state` : fichier temporaire suffixé par le pid. `ReadingOrderBusiness.load` : `_seen` vidé quand `review_state` échoue.
- Vérifié : `cargo test --workspace` sans échec, specs `reading-order*` (21) vertes, `just lint` propre, e2e `reading-order` 2/2.

## Answer

- Construit : `ReviewState` et `ReadingOrderResponse` dans le contrat ; `Session::review_state` / `set_review_state` (fichier `state/review/<hash>.json` avec la plage en clair, écriture atomique avec fichier temporaire suffixé par le pid, code `no_data_dir`) et `Session::reading_order` (appelle `relief_diff::reading_order`) ; commandes Tauri `review_state`, `set_review_state`, `reading_order` ; section « Ordre de lecture » (Fichier/Symbole, liste numérotée avec raisons, case « vu », progression, « Marquer vu », « Vu, suivant → »), touches `n`/`p`/`v`, nœuds vus atténués et « x/y vus » sur les boîtes ; état en mémoire signalé sans dossier de données ; helper e2e `clearReviewState`.
- Décisions : 22 symboles (valeur réelle d'E07) ; ordre de lecture exposé par un cas d'usage dédié `Session::reading_order` ; un fichier changé hors de ses symboles (import) a une entrée de plus à marquer, pour que marquer `computeTotal` ne marque pas tout `invoice.ts` ; dans `relief-diff`, les symboles ajoutés et supprimés portent aussi `Lines` (sinon cette entrée apparaissait à tort).
- Review : « ship », puis trois remarques corrigées avec tests (lignes des symboles ajoutés/supprimés, état vidé si `review_state` échoue, fichier temporaire par pid).
- Vérifié : `just test-summary` cargo 423/0, web 369/0 (baseline 410/348) ; `just e2e-summary` 61 passés, 1 ignoré (préexistant), 0 échec ; `just lint` ; `just docs-shots review` puis lecture des captures `review-reading-order` FR et EN (badges de raison coupés au milieu des mots, corrigé dans la feuille de style, recapturé) ; `just docs-build`.
- Doc : sections « Ordre de lecture » et « Marquer comme vu » de `review` (FR et EN), qui disent que la progression est dans `.relief/state/review/`.
