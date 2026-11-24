# K06 Écran d'accueil sans chemin

Status: resolved
Type: task
Blocked by: K03
UI: oui
Doc: docs/user `getting-started`

Spec: `../spec.md` (Espace de travail)

## Comportement

- `relief` sans argument ouvre un écran d'accueil (pas de session) : ouvrir un dépôt (sélecteur de dossier), ouvrir un espace de travail (sélecteur de fichier `*.relief.json`), récents (dépôts et espaces, enregistrés dans le dossier de configuration de l'utilisateur).
- `relief .` (ou un chemin) ouvre directement comme aujourd'hui. Les entrées multidépôt sont désactivées tant que K07 n'est pas fait.
- Ouvrir un dépôt depuis l'accueil ouvre la carte dans la même fenêtre.

## Critères d'acceptation

- [ ] Test du binaire : sans argument, la commande `meta` dit « pas de session » et l'UI affiche l'accueil.
- [ ] e2e : accueil, ouvrir la fixture depuis les récents.
- [ ] Doc FR/EN (`relief` sans argument n'ouvre plus `.`).

## Baseline

Après K05 (`b8582a9`) : cargo 694/0 ; web 1066/0 ; e2e 185 passés, 1 ignoré.

## Seams

- **Commandes Tauri (`tauri::test`) + test du binaire (`tests/binary.rs`)** : sans argument, `meta` dit « pas de session » ; une commande d'ouverture d'un dépôt crée la session dans la même fenêtre et l'ajoute aux récents ; la liste des récents (dépôts et espaces) est lue/écrite dans le dossier de configuration de l'utilisateur, surchargeable par une variable d'environnement pour les tests (jamais le vrai `~/.config` en test). Rate l'UI.
- **Composant / business de l'accueil** (`TEST_PROVIDERS`, `ReliefApiService` mocké) : accueil affiché quand il n'y a pas de session ; « Ouvrir un dépôt… » passe par le sélecteur de dossier (plugin de dialogue derrière `ReliefApiService`) ; « Ouvrir un espace de travail… » désactivé avec infobulle jusqu'à K07 ; récents listés et cliquables ; l'entrée « Ouvrir un dépôt… » du menu Espace de travail (K03, sortie `openRepo`) est branchée. Rate le dialogue natif.
- **e2e** : l'app lancée sans argument affiche l'accueil ; un récent pré-enregistré (la fixture) ouvre la carte dans la même fenêtre. Le sélecteur de dossier natif n'est pas piloté. Rate le dialogue natif.

## Red

- Fichiers de test : `src/interfaces/relief-desktop/tests/welcome.rs` (nouveau), `src/interfaces/relief-desktop/tests/binary.rs`, `src/ui/src/app/modules/welcome/components/welcome/welcome.component.spec.ts` (nouveau), `src/ui/src/app/modules/map/components/map-page/map-page-welcome.component.spec.ts` (nouveau), `src/ui/src/app/core/services/relief-api.service.spec.ts`, `tests/e2e/tests/welcome.e2e.ts` (nouveau), `tests/e2e/wdio.base.ts` (directive `// @welcome` en 2e ligne : lancement sans argument, `RELIEF_CONFIG_DIR=<tmp>/config` toujours posé, `recents.json` pré-écrit avec la fixture).
- API attendue (inventée par les tests) : Rust `register_welcome(builder, config_dir, SessionOpener)`, `SessionOpener = Arc<dyn Fn(&Path)->Result<Session,AppError>+Send+Sync>`, `config_dir(relief_config_dir, xdg, home)`, commandes `open_repo {path}` (répond le `meta`) et `recents` (`[{kind,path,name}]`), erreur `no_session` / message `no session` ; `recents.json` = `{"entries":[{"kind":"repo|workspace","path":…}]}`, variable `RELIEF_CONFIG_DIR`. UI : `ReliefApiService.recents()/openRepo(path)/pickRepoFolder()`, `WelcomeComponent` (`modules/welcome/components/welcome/`, sortie `opened`, testids `welcome`, `welcome-open-repo`, `welcome-open-workspace`, `welcome-recent`, `welcome-no-recents`, `welcome-error`), `MapPageComponent` affiche l'accueil quand `meta` rejette « no session » et branche `openRepo` du menu.
- Lancer : `cargo test -p relief-desktop --test welcome` ; `cargo test -p relief-desktop --test binary` ; depuis `src/ui/` : `npx ng test --watch=false --include "**/welcome.component.spec.ts"` (idem `map-page-welcome.component.spec.ts`, `relief-api.service.spec.ts`) ; `cd tests/e2e && xvfb-run -a npx wdio run wdio.conf.ts --spec tests/welcome.e2e.ts`
- En échec :
  - welcome.rs (9 tests, ne compile pas) — `register_welcome`, `SessionOpener`, `config_dir` n'existent pas : meta sans session, autres commandes sans session, recents vides, open_repo crée la session, open_repo ajoute aux récents, pas de doublon, dépôt invalide non mémorisé, récents lus du dossier de config, dossier de config (override > XDG > HOME).
  - binary.rs `without_an_argument_no_session_is_opened` — sans argument, `relief` ouvre encore `.` et sort en code 2 « not a git repository ».
  - welcome.component.spec.ts (10 tests, ne compile pas) — `WelcomeComponent` absent.
  - map-page-welcome.component.spec.ts (4 tests) — pas d'accueil sans session, `openRepo` du menu non branché.
  - relief-api.service.spec.ts (3 tests, ne compile pas) — `recents` et `openRepo` absents.
  - welcome.e2e.ts (2 tests) — pas d'écran d'accueil (`welcome` non affiché, aucun récent).

## Green

- Fichiers : `src/interfaces/relief-desktop/{src/lib.rs,src/main.rs,src/recents.rs,build.rs,Cargo.toml,capabilities/main.json}`, `Cargo.lock`, `src/ui/src/app/core/services/relief-api.service.ts`, `src/ui/src/app/modules/welcome/{business/welcome.business.ts,components/welcome/*}`, `src/ui/src/app/modules/map/{business/repo.business.ts,components/map-page/map-page.component.{ts,html}}`, `src/ui/public/i18n/{en,fr}.json`, `src/ui/package.json` (+ lock, `@tauri-apps/plugin-dialog`), `docs/user/src/content/docs/{,en/}{getting-started,cli}.md`, `README.md`
- Changement : `relief` sans chemin enregistre `register_welcome` (session vide dans un `Slot`, erreur `no_session`) ; commandes `open_repo` et `recents` (`recents.json` dans `RELIEF_CONFIG_DIR` > XDG > `~/.config/relief`) ; plugin de dialogue Tauri (permission `dialog:allow-open`) derrière `pickRepoFolder()`. UI : `WelcomeComponent` + `WelcomeBusiness`, `MapPageComponent` affiche l'accueil sur « no session » et branche `openRepo` du menu. Doc FR/EN et README mis à jour.
- Suite : cargo 704/0 (baseline 694/0) ; web 1082 réussis / 1 échoué (baseline 1066/0) ; e2e `welcome.e2e.ts` 2/2 et `settings-menu.e2e.ts` 9/9 ; `just lint` propre.
- Questions ouvertes : `relief-api.service.spec.ts` « recents invokes the recents command » attend `args: undefined`, mais `invoke(cmd)` de `@tauri-apps/api` 2.12.5 met `args = {}` par défaut : le test est inatteignable via `invoke` sans contourner (`window.__TAURI_INTERNALS__.invoke`) ; test à corriger (`args: {}`), non modifié.

## Review

- Verdict : fix first
- Must fix : map-page.component.ts `onOpenRepo` / lib.rs `welcome()` — avec `relief <chemin>` (`register`), `Welcome` n'est pas géré : « Ouvrir un dépôt… » du menu rejette `bad_request`, et l'erreur reste dans `WelcomeBusiness`, invisible hors de l'accueil : échec silencieux alors que le spec branche l'entrée (test map-page « menu entry of an opened map »). Gérer `Welcome` aussi dans `register` (config_dir + opener) ou afficher l'erreur ; ajouter un test.
- Consider :
  - map-page.component.ts:`start()` — rouvrir un dépôt depuis la carte ne remet à zéro que `RepoBusiness` ; sélection, sous-graphe, diff et revue du dépôt précédent restent. Sans effet depuis l'accueil (rien chargé), réel au second « Ouvrir ».
  - lib.rs `open_repo` — chemin de l'UI pris tel quel (relatif non canonisé, mémorisé tel quel dans `recents.json`) ; lecture seule et local, donc acceptable, mais `canonicalize` éviterait des doublons.
  - recents.rs `remember` — écriture non atomique, erreurs avalées (assumé en commentaire).
  - binary.rs `without_an_argument_no_session_is_opened` — assertion négative faible (le « pas de session » du `meta` est couvert par welcome.rs, pas par le binaire) ; l'écart au critère est à noter.
  - welcome.business.ts / repo.business.ts — `'no session'` comparé en chaîne ; un code d'erreur serait plus robuste.
- Vérifié sans reproche : capability minimale (`allow-open-repo`, `allow-recents`, `dialog:allow-open` seulement), `RELIEF_CONFIG_DIR` en tempdir partout (welcome.rs, binary.rs, wdio), doc FR/EN, i18n, pas de secret, `args: {}` légitime.

### Correctifs de review

- `register_session` (utilisé par `relief <chemin>`) gère aussi `open_repo`/`recents` ; `open_repo` canonise le chemin avant ouverture et mémorisation ; tests dans `tests/welcome_review.rs`.
- Rouvrir un dépôt depuis une carte ouverte relance la page (`PAGE_RELOAD`) ; une erreur d'ouverture est affichée (`open-error`) ; « no session » détecté par le code `no_session` (`ApiRequestError.code`), repli sur le message ; tests dans `map-page-reopen.component.spec.ts`.
- Suite : cargo 706/0, web 1088/0 ; lint propre ; wdio non relancé.

## Answer

- `relief` sans argument démarre sans session (`register_welcome`) : toute commande répond `no_session`, l'UI affiche l'accueil (`WelcomeComponent`) : « Ouvrir un dépôt… » (plugin de dialogue Tauri, `dialog:allow-open`), « Ouvrir un espace de travail… » désactivé jusqu'à K07, récents.
- `open_repo` (chemin canonisé) ouvre la session dans la même fenêtre et l'ajoute aux récents ; `recents.json` vit dans `RELIEF_CONFIG_DIR`, sinon `$XDG_CONFIG_HOME/relief`, sinon `~/.config/relief`. `relief <chemin>` passe par `register_session`, donc « Ouvrir un dépôt… » du menu marche aussi depuis une carte ouverte (la page se recharge, aucun état de l'ancien dépôt ne reste ; une erreur s'affiche sans perdre la carte).
- `ApiRequestError` porte le code d'erreur de l'API.
- Harnais e2e : `// @welcome` en 2e ligne lance l'app sans argument ; `RELIEF_CONFIG_DIR` toujours temporaire.
- Correction orchestrateur d'une assertion rouge : `invoke` passe `{}` par défaut, pas `undefined`.
- Vérifié : cargo 706/0, web 1088/0, e2e 187 passés / 1 ignoré, lint propre, capture de l'accueil EN/FR relue. Reste : la barre de recherche est visible (et inutile) sur l'accueil.
- Doc : `getting-started`, `cli` FR/EN et README (texte seulement, captures non régénérées en phase alpha).
