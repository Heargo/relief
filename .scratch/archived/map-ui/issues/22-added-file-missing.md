# U22 Un fichier ajouté n'apparaît pas sur la carte

Status: resolved
Type: bug
Blocked by: aucun
UI: oui
Doc: aucune

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 : un fichier ajouté (vu à la racine du dépôt, peut-être aussi plus bas) n'apparaît pas sur la carte.

## Diagnostic (2026-11-20)

Le cœur est correct : sur un dépôt jetable, un fichier ajouté à la racine, dans un sous-dossier (commité sur head) ou non suivi est dans le snapshot head (bon parent) et dans `diff.nodes` en `added`.

La perte est dans l'UI : la carte dessine `RepoBusiness.snapshot()`, chargé avec `displayRef(range, branches)` (`map/helpers/repo.logic.ts`). Ce ref ne suit pas le head du diff tel que le cœur le résout (`Session::sides`) :

- sans plage (`relief .`), le cœur compare `HEAD` au **working tree**, mais `displayRef(null, branches)` rend la branche courante, donc un commit : un fichier ajouté et pas encore commité n'est pas sur la carte, même après « Recharger » (W01) ;
- avec un `REV` seul, le head est aussi le working tree, et `displayRef` rend `REV` ;
- quand on change de plage dans la barre du haut (U19), `DiffBusiness.setRange` recharge le diff mais pas le snapshot de la carte, qui reste celui de l'ancien head.

## À faire

- Une fonction pure qui donne le ref du head d'une plage avec les règles de `Session::sides` : `null` et `REV` seul → `WORKTREE`, `INDEX` → `INDEX`, `WORKTREE` → `WORKTREE`, `A...B` / `A..B` → `B`. Elle remplace `displayRef` au chargement de la carte et au rechargement.
- Changer de plage recharge le snapshot de la carte avec le head de la nouvelle plage (garder la vue, comme au rechargement).

## Critères d'acceptation

- [x] Vitest : le ref du head vaut `WORKTREE` sans plage et pour un `REV` seul, `INDEX` pour `INDEX`, `B` pour `A...B` et `A..B`.
- [x] Business : sans plage, la carte demande le snapshot `WORKTREE` ; après un changement de plage, elle redemande le snapshot du nouveau head.
- [x] e2e : un fichier ajouté dans le working tree à la racine (et un dans un sous-dossier) apparaît sur la carte, en `added`.

## Baseline

2026-11-20, avant U22 : cargo 611/0 ; web 641/0. Arbre de travail non vide (`quicknotes.md` de l'utilisateur, tickets du jour non commités), hors du périmètre du ticket.

## Seams

1. **Logique TS** (Vitest, `map/helpers/repo.logic.ts`) : le ref du head d'une plage. Attrape les règles de résolution ; rate le câblage.
2. **Business** (`TestBed`, `ReliefApiService` mocké) : `MapBusiness.load` sans plage demande `snapshot('WORKTREE')` ; un changement de plage (`DiffBusiness.setRange` ou son orchestration) redemande le snapshot du nouveau head. Attrape le câblage ; rate le rendu.
3. **e2e** (WebdriverIO, acme-shop ouvert sans plage ou avec la plage par défaut du harnais selon ce qui permet le working tree) : un fichier ajouté dans le working tree, à la racine et dans un sous-dossier, apparaît sur la carte en `added` après « Recharger ». Attrape le parcours réel ; rate les cas de plage non couverts.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/repo.logic.spec.ts` (nouveau), `src/ui/src/app/modules/review/business/range-snapshot.business.spec.ts` (nouveau), `tests/e2e/tests/added-file.e2e.ts` (nouveau, `@fixture tiny`)
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/repo.logic.spec.ts` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/review/business/range-snapshot.business.spec.ts` ; `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/added-file.e2e.ts`
- En échec : 11 tests (la suite de repo.logic.spec.ts ne compile pas, donc ses 5 cas comptent comme un fichier rouge)
  - `repo.logic.spec.ts` (4 `it`, 8 cas) — l'export `headRef` n'existe pas dans `repo.logic.ts`
  - `MapBusiness.load asks the working tree snapshot when there is no range` — `snapshot` appelé avec la branche, pas `WORKTREE`
  - `RepoBusiness.load asks the working tree snapshot when there is no range` — ref `main`, attendu `WORKTREE`
  - `RepoBusiness.load asks the working tree snapshot for a single revision` — ref `main`, attendu `WORKTREE`
  - `the reload asks the working tree snapshot when there is no range` — `snapshot('WORKTREE')` jamais demandé
  - `changing the range asks the snapshot of the new head and keeps the map view` — `DiffBusiness.setRange('WORKTREE')` ne redemande pas le snapshot de la carte
  - e2e `a file added in the working tree shows on the map, marked added, at the root and in a subfolder` — `added-at-root.ts` n'apparaît jamais sur la carte après « Recharger »

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/repo.logic.ts` (`headRef` remplace `displayRef`), `src/ui/src/app/modules/map/business/repo.business.ts`, `src/ui/src/app/modules/map/business/map.business.ts`, `src/ui/src/app/modules/review/business/reload.business.ts`, `src/ui/src/app/modules/review/business/diff.business.ts`, `src/ui/src/app/modules/map/helpers/camera.logic.ts`
- Changement : `headRef` donne le head d'une plage selon `Session::sides` ; chargement de la carte, `RepoBusiness` (qui garde maintenant son ref dans un signal) et rechargement l'utilisent. `DiffBusiness.setRange` recharge ensuite le snapshot de la carte (RepoBusiness/MapBusiness injectés en optionnel) en gardant la vue. `MapBusiness.show(keepView)` revise le niveau forcé quand les bornes de la carte changent, et `levelCamera` centre toute la carte quand elle tient (à l'échelle du niveau, ou plus petite sans fermer de conteneur ouvert) : sinon le fichier à la racine sortait de l'écran au niveau 2 (requis par l'e2e).
- Suite : cargo 611/0 (baseline 611/0) ; web 652/0 (baseline 641/0, +11 tests du ticket) ; e2e : added-file passe, 39 specs sur 40 passent.
- Questions ouvertes :
  - `tests/e2e/tests/diff-layer.e2e.ts` ("changing the range in the selector...") échoue : après le passage à `feat/promo-codes...main`, il attend `discount.ts` sur la carte, or la carte suit désormais le head (`main`, qui n'a pas ce fichier), comme le demande le ticket. Ce test est à adapter à l'étape review.
  - `just lint` échoue sur `range-snapshot.business.spec.ts` (prettier --check) : fichier de test rouge indexé, laissé intact.

### Green, suite de la review

- Ajoutés (nouveaux tests) : `map/helpers/camera-level.logic.spec.ts` (carte petite centrée avec fichier racine visible ; pas de fermeture d'un conteneur ouvert), `map/business/map-level-reshow.business.spec.ts` (niveau revisé après `show(graph, true)` quand les bornes changent), `map/helpers/repo-head.logic.spec.ts` (`headRef('A..')` ne lève pas). `headRef` : commentaire sur le repli (le cœur refuse `A..`).
- Point 2 (déplacer `followHead` dans `ReloadBusiness`) NON fait : impossible sans modifier `range-snapshot.business.spec.ts`. Ce test n'appelle que `DiffBusiness.setRange` et n'injecte jamais `ReloadBusiness` ; pour que `setRange` déclenche le rechargement, `DiffBusiness` devrait obtenir `ReloadBusiness` (import circulaire, car `ReloadBusiness` injecte `DiffBusiness`) et `diff.business.spec.ts`, `diff-head-graph.business.spec.ts`, `diff-range-race.business.spec.ts` n'ont pas ce provider. Arrêt, décision au coordinateur.
- Suite : cargo 611/0 ; web 657/0 ; lint propre ; e2e `added-file` et `diff-layer` passent (app reconstruite).

## Answer

La carte dessine maintenant le head de la plage tel que le cœur le résout (`Session::sides`) :

- `headRef` (`map/helpers/repo.logic.ts`) remplace `displayRef` : `WORKTREE` sans plage ou pour un `REV` seul, `INDEX` pour `INDEX`, `B` pour `A...B` / `A..B`. Le chargement de la carte, `RepoBusiness` et le rechargement l'utilisent, donc un fichier ajouté et pas encore commité apparaît, en `added`.
- Changer de plage dans la barre du haut recharge aussi le snapshot de la carte (`DiffBusiness.followHead`), en gardant la vue.
- `levelCamera` montre toute la carte quand elle tient sans fermer de conteneur ouvert : sans ça, le fichier ajouté à la racine sortait de l'écran ; `MapBusiness.show(keepView)` revoit le niveau quand les bornes changent.
- `diff-layer.e2e.ts` adapté : après le passage à `feat/promo-codes...main`, la carte suit `main`, qui n'a pas `discount.ts`.

Décision : le point de review « déplacer `followHead` dans `ReloadBusiness` » n'est pas fait. `ReloadBusiness` injecte déjà `DiffBusiness`, l'inverse créerait une dépendance circulaire ; `DiffBusiness` injecte `RepoBusiness` et `MapBusiness` en optionnel à la place.

Vérifié : cargo 611/0, web 657/0 (baseline 641, +16 tests), `just lint` propre, `just e2e-summary` 130 passés, 1 ignoré, 0 échec (dont `added-file` et `diff-layer`). Pas de capture produite par ces specs : la vérification visuelle repose sur les assertions e2e (nœud présent, `data-diff-status="added"`). Doc : aucune, le comportement attendu est déjà celui que décrit la doc.
