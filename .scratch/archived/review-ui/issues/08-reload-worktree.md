# Recharger quand le working tree change

Status: resolved
Type: task
Blocked by: R01, R07
UI: oui
Doc: docs/user `review` (relire des changements en cours)

Spec: `../spec.md`

## À faire

- Bouton « Recharger » dans la barre du haut, et rechargement automatique quand la fenêtre reprend le focus, pour les plages qui touchent le working tree ou l'index (« working tree vs HEAD », « staged »). Les plages entre commits ne se rechargent pas.
- Le rechargement rappelle `snapshot` et `diff` ; la `Session` recalcule déjà le working tree et l'index à chaque demande, aucune commande nouvelle. La sélection, le niveau de zoom et l'état « vu » sont gardés ; un nœud disparu est désélectionné sans erreur.
- Ni surveillance de fichiers, ni événement poussé par le cœur (reportés, voir « Plus tard » de la roadmap).

## Critères d'acceptation

- [x] Test de business (Vitest, `ReliefApiService` mocké) : le focus recharge pour « working tree vs HEAD » et pas pour `A...B`.
- [x] e2e WebdriverIO : modifier un fichier de la fixture, déclencher le rechargement (bouton), le nouveau changement apparaît sur la carte.
- [x] Page `review` (FR et EN) : une phrase sur le rechargement ; captures inchangées ou régénérées.

## Baseline

`just test-summary` (develop, 60e9ff9) : cargo 431 passed, 0 failed ; web 396 passed, 0 failed.

## Seams

- **Business de rechargement (`TestBed`, `ReliefApiService` mocké)** : attrape le rechargement au focus pour « working tree vs HEAD » et « staged » mais pas pour `A...B`, l'appel de `snapshot` et `diff`, la sélection, le zoom et le « vu » gardés, un nœud disparu désélectionné ; rate le vrai working tree.
- **e2e WebdriverIO sur l'app construite et acme-shop** (plage working tree) : modifier un fichier de la fixture, cliquer « Recharger », le changement apparaît sur la carte ; le spec restaure le fichier après coup, car la fixture est partagée par toute la suite ; rate les cas limites du business.

## Red

- Fichiers de test : `src/ui/src/app/modules/review/business/reload.business.spec.ts`, `tests/e2e/tests/reload-worktree.e2e.ts`
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/review/business/reload.business.spec.ts 2>&1 | tail -30` ; `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/reload-worktree.e2e.ts 2>&1 | tail -30`
- Contrat attendu : `ReloadBusiness` (`review/business/reload.business.ts`, `@Injectable()`, injecte `RepoBusiness`, `MapBusiness`, `DiffBusiness`, `ReadingOrderBusiness`) avec `canReload()` (plage `WORKTREE`, `INDEX`, absente ou `REV` seul : vrai ; `A...B` / `A..B` : faux), `reload()` (rappelle `snapshot(displayRef(plage))` et `diff(plage)` sur la plage courante du `DiffBusiness`, recharge l'ordre de lecture, rappelle `map.show(graphe, true)`) et `onWindowFocus()` (appelle `reload()` seulement si `canReload()`). Bouton `data-testid="reload-button"` dans la barre du haut ; e2e ouvert sur `?range=WORKTREE`.
- En échec : 7 tests Vitest + 1 e2e
  - reloads when the window regains focus on WORKTREE / INDEX (2) — `./reload.business` n'existe pas (compilation)
  - does not reload on focus for a range between commits — idem
  - does not reload on focus for A..B either — idem
  - the button reloads the snapshot and the diff of the working tree range — idem
  - keeps the selection, the zoom level and the seen state — idem
  - deselects a node that disappeared, without an error — idem
  - e2e « the Reload button shows a symbol added… » — `reload-button` absent (la précondition « symbole absent de la recherche » passe)

## Green

- Fichiers : `src/ui/src/app/modules/review/business/reload.business.ts`, `src/ui/src/app/modules/review/helpers/reload.logic.ts`, `src/ui/src/app/modules/review/business/diff.business.ts`, `src/ui/src/app/modules/review/business/reading-order.business.ts`, `src/ui/src/app/modules/map/business/repo.business.ts`, `src/ui/src/app/modules/map/components/map-page/map-page.component.{ts,html}`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `ReloadBusiness` (`canReload`, `reload`, `onWindowFocus`) relit snapshot (`RepoBusiness.refreshSnapshot`), diff (`DiffBusiness.reload`, silencieux : pas de `loading`, un échec laisse l'affichage) et ordre de lecture (`load(..., keepCommit)` garde le commit sélectionné), puis `map.show(graphe, true)`. Un rechargement en cours ignore les suivants (focus inclus) et toute erreur est absorbée. Bouton `reload-button` (plages rechargeables) et `window:focus` dans `MapPageComponent` ; clé `review.reload` EN/FR.
- Suite : cargo 431 passed, 0 failed (baseline 431/0) ; web 413 passed, 0 failed (baseline 396/0) ; e2e 69 passed, 1 skipped, 0 failed ; lint propre.
- Questions ouvertes : aucune

## Review (2e passe)

- Verdict : ship
- Must fix : aucun (logic testé directement, garde `running` testée, erreurs absorbées et testées)
- Consider : aucun (rechargement sans `loading`, commit sélectionné gardé s'il existe encore)

## Answer

- Construit : `isReloadable` (`reload.logic.ts`) et `ReloadBusiness` (`canReload`, `reload`, `onWindowFocus`) : relit le snapshot de la plage courante (`RepoBusiness.refreshSnapshot`, sans écran de chargement), le diff (`DiffBusiness.reload`, silencieux) et l'ordre de lecture (commit sélectionné gardé), puis rappelle `map.show(graphe, true)` (sélection, zoom et « vu » gardés, nœud disparu désélectionné). Bouton « Recharger » dans la barre du haut pour les plages rechargeables, rechargement au retour du focus. Aucune commande nouvelle côté cœur.
- Review : « fix first » (logique non testée directement, rechargements concurrents, rejet non géré), corrigé avec tests (garde `running`, erreurs absorbées, pas de `loading`, commit gardé), puis « ship ».
- Vérifié : `just test-summary` cargo 431/0, web 413/0 (baseline 431/396) ; `just e2e-summary` 69 passés, 1 ignoré (préexistant), 0 échec (un premier passage a échoué pendant qu'une autre exécution e2e tournait en parallèle ; relancé seul, il passe) ; `just lint` ; `just docs-build`.
- Doc : section « Relire des changements en cours » de `review` (FR et EN) ; captures inchangées (le bouton n'apparaît pas sur les plages entre commits des captures).
