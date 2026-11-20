# U19 Barre du haut : choisir base et head

Status: resolved
Type: task
Blocked by: U15
UI: oui
Doc: user-docs `review` (choisir ce qu'on compare), captures

Spec: `../spec.md` (« Retours du 2026-11-20 ») ; référence visuelle : `docs/product/maquette/v2.html`, sujet 2

## Constat

La plage se choisit dans une seule liste de plages toutes faites (`rangeChoices`). On ne peut pas comparer deux branches quelconques, ni deux commits.

## À faire

**Cœur**
- `Session::log(rev, limit, query) -> Vec<LogEntry { sha, short, subject, author, time }>` sur `relief-app`, appuyé sur `log` de `relief-git` (premier parent, plus récent d'abord, filtre sur sha et sujet). Commande Tauri `log`, types du contrat générés (`just contract`).
- Le nombre de commits d'une plage (pour l'affichage) : réutiliser ce que l'ordre de lecture calcule, ou `log(range).len()`.

**UI**
- Le `p-select` de plage devient un contrôle `base ··· head ⇄` (`data-testid="range-base"`, `range-head`, `range-mode`, `range-swap`) suivi du nombre de commits.
- Chaque côté ouvre un popover : champ de filtre, raccourcis (base : `main`, `HEAD~1`, dernier tag ; head : Working tree, HEAD), onglets Branches / Tags / Commits. L'onglet Commits liste le log de head avec un rail : les commits de la plage surlignés, l'autre extrémité marquée BASE ou HEAD.
- Head propose « Working tree » (la valeur `WORKTREE_RANGE` actuelle). Base ne le propose pas ; ⇄ est désactivé quand head est le working tree.
- `···` bascule entre `base...head` (depuis l'ancêtre commun, défaut) et `base..head` (diff direct), avec une infobulle qui dit la différence.
- Clavier : `b` et `h` ouvrent chaque côté ; flèches, Entrée, Tab (onglet suivant), Échap.
- La plage reste une chaîne envoyée à `review.setRange` : rien ne change en aval. Une plage passée en argument (`relief . a..b`) s'affiche décomposée dans le contrôle.
- Logique pure : `parseRange(range) → { base, head, mergeBase }`, `formatRange(...)`, `inRange(log, base, head)`.

## Critères d'acceptation

- [ ] cargo : `Session::log` sur une fixture renvoie les commits attendus, filtre par sujet et par sha, respecte `limit`.
- [ ] Vitest : `parseRange` / `formatRange` (`...`, `..`, working tree, ref seule) ; `inRange`.
- [ ] e2e sur acme-shop : choisir base = un commit, head = une branche, par le popover ; la carte charge ce diff ; ⇄ inverse ; `···` passe à `..`. Tests `topbar-range-list` et `diff-layer` migrés et verts.
- [ ] Captures EN et FR du contrôle et du popover ouvert (onglet Commits).

## Seams

1. **relief-app** (cargo) : `Session::log`.
2. **Logique TS** (Vitest) : analyse et format de plage, plage dans le log.
3. **e2e** : parcours de choix.

## Baseline

Après U18 (2026-11-20) : cargo 578/0 ; web 617/0 ; e2e 120 passed, 1 skipped, 0 failed.

## Red

- Fichiers de test :
  - `src/app/relief-app/tests/log.rs` (seam 1)
  - `src/ui/src/app/modules/review/helpers/range.logic.spec.ts` (seam 2)
  - `tests/e2e/tests/range-picker.e2e.ts` (seam 3, nouveau)
  - e2e migrés de l'ancien `p-select` (`range-select`) : `tests/e2e/tests/topbar-range-list.e2e.ts`, `topbar-controls.e2e.ts`, `topbar.e2e.ts`, `diff-layer.e2e.ts`. Vérifiés sans changement : `reload-worktree.e2e.ts` (n'utilise que `?range=WORKTREE`), `left-panel.e2e.ts` et `focus-layers.e2e.ts` (seul `toggle-diff-layer`). Les captures `docs/user/screenshots/` n'utilisent pas `range-select`.
- Contrat de testids posé par les tests : `range-base`, `range-mode` (texte `...` ou `..`), `range-head`, `range-swap`, `range-count` ; popover `range-popover`, `range-filter`, `range-tab-branches|tags|commits`, lignes `range-option` (branches, tags, Working tree) et `range-commit` (`data-mark` = `head` | `in` | `base`).
- API posée : `Session::log(rev: &str, limit: usize, query: Option<&str>) -> Result<Vec<LogEntry>, AppError>` (`LogEntry` exporté par `relief_app`, `time` en secondes Unix) ; `range.logic.ts` dans `modules/review/helpers/` : `parseRange`, `formatRange`, `inRange(log, base, head) -> ('head'|'in'|'base'|'out')[]` (une marque par entrée du log, base et head par sha) ; une ref seule = cette ref contre le working tree, `WORKTREE` = `HEAD` contre le working tree.
- Lancer :
  - `cargo test -p relief-app --test log`
  - `cd src/ui && npx ng test --watch=false --include src/app/modules/review/helpers/range.logic.spec.ts`
  - `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/range-picker.e2e.ts --spec tests/topbar-range-list.e2e.ts --spec tests/topbar-controls.e2e.ts --spec tests/topbar.e2e.ts --spec tests/diff-layer.e2e.ts` (après `just build`)
- En échec : 8 (cargo) + 13 (vitest) + 14 (e2e)
  - cargo : le fichier ne compile pas (`LogEntry` et `Session::log` absents), donc les 8 tests de `log.rs` sont rouges.
  - vitest : `range.logic.spec.ts` ne compile pas (`./range.logic` et `LogEntry` du contrat absents) : tous ses tests.
  - e2e `range-picker` (8) — `range-base`/`range-head`/`range-swap`/`range-mode`/`range-popover` n'existent pas.
  - e2e `topbar-range-list` (1), `topbar-controls` (2 : champ non vide, popover opaque), `topbar` (1 : police 12 px mono), `diff-layer` (2 : changer la plage par les popovers, barre qui tient à 1024 px) — mêmes testids absents.

## Green

- Fichiers : `src/analysis/relief-git/src/lib.rs` (`first_parent_log`, `LogItem`), `src/domain/relief-model/src/{api,contract,lib}.rs` + `bin/write-contract.rs` (`LogEntry`, `LogResponse`), `src/app/relief-app/src/lib.rs` (`Session::log`), `src/interfaces/relief-desktop/{build.rs,src/lib.rs,capabilities/main.json}` (commande `log`), `docs/contract/log-response.schema.json`, `src/ui/scripts/generate-contract.mjs`, `src/ui/src/app/core/models/contract.ts`, `src/ui/src/app/core/services/relief-api.service.ts`, `src/ui/src/app/modules/review/{helpers/range.logic.ts,business/range-picker.business.ts,components/range-picker/*}`, `src/ui/src/app/modules/map/{helpers/shortcuts.logic.ts,components/map-page/*}`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `Session::log` (premier parent, filtre sha/sujet, limite après filtre) sur un `first_parent_log` de `relief-git`, commande Tauri `log`, contrat régénéré. UI : composant `app-range-picker` (`base ··· head ⇄`, nombre de commits, popover Branches/Tags/Commits avec rail, clavier `b`/`h`/flèches/Entrée/Tab/Échap) adossé à `RangePickerBusiness` et à `range.logic.ts` ; le `p-select` et son style disparaissent de la page carte (le budget scss de `map-page` baisse, déjà dépassé avant).
- Suite : cargo 586/0 (baseline 578/0) ; web 630/0 (baseline 617/0) ; e2e 127 passed, 1 skipped, 1 failed (baseline 120/1/0) ; lint propre.
- Questions ouvertes :
  - Test faux : `tests/e2e/tests/range-picker.e2e.ts`, « the ... button switches to a direct diff (..) and back » appelle `expect.poll`, qui n'existe pas dans `expect-webdriverio` (`TypeError: expect.poll is not a function`, ligne 93). Le comportement est correct (vérifié par une spec temporaire équivalente avec `browser.waitUntil`, supprimée) ; à corriger côté test (`browser.waitUntil`).
  - `src/ui/src/app/modules/map/components/map-page/map-page.component.spec.ts` (hors liste rouge) testait `range-select` / « working tree vs HEAD » : 3 tests migrés vers `range-base` / `range-head`, donc ce fichier de test figure dans `git diff --name-only`.
  - Les captures EN/FR et la page user-docs `review` restent à faire (étape doc du workflow).

## Review

- Verdict : ship
- Must fix : aucun
- Consider :
  - `src/app/relief-app/src/lib.rs:~392` : `limit` n'est pas borné côté cœur (l'UI envoie 500) ; un plafond serait plus sûr pour la commande Tauri.
  - `src/analysis/relief-git/src/lib.rs:~720` : avec un filtre rare, `first_parent_log` parcourt tout l'historique ; acceptable ici.
  - `src/interfaces/relief-desktop/tests/commands.rs` : pas de test `tauri::test` de la commande `log`.
  - `src/ui/.../range-picker.business.ts` : pas de spec Vitest (TestBed) du business ni du composant ; seuls `range.logic` et e2e couvrent.
  - `range-picker.component.html` : blocs branches et tags dupliqués, à factoriser.
  - `range-picker.business.ts` : `RangeChoice.kind` n'est jamais lu.

## Answer

Côté cœur : `Session::log(rev, limit, query)` (premier parent, plus récent d'abord, filtre sur préfixe de sha ou sous-chaîne du sujet) repose sur `first_parent_log` de `relief-git`. Il est exposé par la commande Tauri `log`, et le contrat est régénéré (`LogEntry`, `LogResponse`). Côté UI : le `p-select` de plage devient `app-range-picker`, un contrôle `base ··· head ⇄` suivi du nombre de commits. Chaque côté ouvre un popover avec un filtre, des raccourcis et les onglets Branches, Tags et Commits ; l'onglet Commits a un rail qui marque HEAD et BASE et surligne la plage. Les touches `b`/`h`, les flèches, Entrée, Tab et Échap marchent. `···` bascule entre `...` et `..`. ⇄ est désactivé quand head est le working tree. La logique pure est dans `range.logic.ts` (`parseRange`, `formatRange`, `inRange`). La plage reste une chaîne envoyée à `review.setRange`.

Vérifié : cargo 586/0, web 630/0, e2e complète 128 passés / 1 ignoré / 0 échec, `just lint` propre, review `ship`. Pas de risque d'injection : `rev` passe par `gix rev_parse`, `query` filtre en mémoire. Après green, `expect.poll` (absent d'expect-webdriverio) a été remplacé par `browser.waitUntil` dans `range-picker.e2e.ts`, et 3 tests de `map-page.component.spec.ts` ont été migrés de `range-select` vers `range-base`/`range-head`. Capture FR relue à 1024 px avec le popover ouvert sur l'onglet Commits. Doc `review` (FR/EN) en texte seul, captures de doc non refaites (phase alpha).

Restent en `Consider` : borner `limit` côté cœur, ajouter un test `tauri::test` de la commande `log` et une spec TestBed du composant, factoriser les blocs branches/tags, `RangeChoice.kind` jamais lu.
