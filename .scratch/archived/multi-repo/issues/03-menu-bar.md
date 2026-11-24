# K03 Barre du haut en barre de menus

Status: resolved
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `getting-started`, `map`

Spec: `../spec.md` (Interface)

## Comportement

- Menus **Espace de travail**, **Paramètres**, **Aide**, à gauche de la barre du haut, clavier compris (Alt + lettre, flèches, Échap).
- Paramètres : thème, langue, raccourcis, recharger (ce que contient le bouton Paramètres de U15, qui disparaît). Aide : documentation.
- Espace de travail : « Ouvrir un dépôt… », « Ouvrir un espace de travail… », « Ajouter un dépôt à l'espace… », « Ouvrir ce dépôt comme espace de travail » ; tant que K07 n'est pas fait, les entrées multidépôt sont présentes et désactivées avec une infobulle.
- Le sélecteur de plage quitte la barre du haut (K04).

## Critères d'acceptation

- [ ] e2e : chaque entrée de Paramètres et d'Aide fait ce que faisait le bouton de U15 ; navigation au clavier.
- [ ] Doc FR/EN.

## Baseline

`just test-summary` (2026-11-24) : cargo 682 passed, 0 failed ; web 1030 passed, 0 failed.

## Seams

- **Composant barre de menus** (entrées/sorties Angular, `TEST_PROVIDERS`) : les trois menus, leurs entrées, l'état désactivé + infobulle des entrées multidépôt, la navigation clavier (Alt + lettre, flèches, Échap) et les actions émises (thème, langue, raccourcis, recharger, documentation). Rate l'intégration dans le shell réel.
- **Module de logique `*.logic.ts`** de navigation de menu (index actif selon la touche, saut des entrées désactivées) : attrape les cas limites du clavier. Rate le rendu.
- **e2e WebdriverIO** sur acme-shop : chaque entrée de Paramètres et d'Aide fait ce que faisait le bouton de U15 (thème, langue, raccourcis, recharger, doc), le bouton U15 n'est plus dans la barre du haut (le sélecteur de plage y reste jusqu'à K04, qui le déplace), navigation au clavier. Rate les cas limites.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/menu-nav.logic.spec.ts`, `src/ui/src/app/modules/map/components/menu-bar/menu-bar.component.spec.ts`, `tests/e2e/tests/settings-menu.e2e.ts` (réécrit), `tests/e2e/tests/docs.e2e.ts` et `tests/e2e/tests/reload-worktree.e2e.ts` (adaptés au menu).
- Lancer : `cd src/ui && npx ng test --watch=false --include 'src/app/modules/map/**/menu-*'` ; `cd tests/e2e && timeout 400 xvfb-run -a npx wdio run wdio.conf.ts --spec tests/settings-menu.e2e.ts` (idem docs, reload-worktree)
- En échec :
  - menu-nav.logic.spec.ts (3 describe : `nextItemIndex`, `nextMenuIndex`, `menuForAccessKey`) — `./menu-nav.logic` n'existe pas.
  - menu-bar.component.spec.ts (22 tests) — `./menu-bar.component` (`MenuBarComponent`, selector libre) n'existe pas. Contrat : inputs `theme`, `language`, `languages` ({code,label}[]), `canReload` ; outputs `themeChange`, `languageChange`, `shortcuts`, `reload`, `docs`, `openRepo` ; testids `menu-trigger-{workspace,settings,help}`, `menu-panel`, `menu-item-{open-repo,open-workspace,add-repo,open-as-workspace,theme-light|dark|system,language-<code>,shortcuts,reload,docs}` ; `role=menubar`/`menuitem`, `aria-disabled` + `title` pour les entrées désactivées, `aria-checked` sur thème/langue ; lettres d'accès Alt : EN W/S/H, FR E/P/A ; Échap rend le focus au déclencheur.
  - settings-menu.e2e.ts (9 tests), docs.e2e.ts (3), reload-worktree.e2e.ts (1) — `menu-trigger-*` introuvable (barre de menus absente) ; le bouton U15 (`settings-button`) doit disparaître, `range-base` reste dans la barre ; Recharger passe dans Paramètres (`menu-item-reload`).

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/menu-nav.logic.ts`, `src/ui/src/app/modules/map/components/menu-bar/menu-bar.component.{ts,html,scss}`, `map-page.component.{ts,html}`, `src/ui/src/styles.scss`, `src/ui/public/i18n/{en,fr}.json` (bloc `menu`), docs `map`, `getting-started`, `review` (FR/EN)
- Changement : nouveau `MenuBarComponent` (Espace de travail / Paramètres / Aide, Alt + lettre, flèches, Échap, entrées multidépôt désactivées avec infobulle) et logique pure `menu-nav.logic.ts`. La barre du haut l'embarque à gauche ; le bouton Paramètres U15 et le bouton Recharger (désormais dans Paramètres) disparaissent, ainsi que le CSS `.settings*`. « Ouvrir un dépôt… » émet `openRepo`, non branché dans la page tant que l'accueil (K06) n'existe pas.
- Suite : cargo 682/0 (baseline 682/0) ; web 1058/0 (baseline 1030/0, +28 nouveaux tests) ; e2e settings-menu, docs, reload-worktree verts ; `just lint` propre
- Questions ouvertes : des specs hors Red référençaient les contrôles supprimés et ont dû être adaptées (non indexées, à relire) : `map-page.component.spec.ts` (13 tests U15 remplacés par 5 tests de câblage du menu) et e2e `shell`, `navigation`, `topbar`, `added-file` (sélecteurs du menu), `topbar-controls` (test « Reload is as tall as the settings button » supprimé) ; tous verts. « Ouvrir un dépôt… » n'a pas d'action tant que K06 n'existe pas.

## Review

Verdict : ship (aucun Must fix). Considers appliqués : helpers morts de `map-page.component.spec.ts` et règle `.spacer` retirés. Laissés : clé `map.settings.title` inutilisée, double `HostListener` du menu (pas de bug observé).

## Answer

- `MenuBarComponent` (Espace de travail / Paramètres / Aide) à gauche de la barre du haut, logique clavier pure dans `menu-nav.logic.ts` (Alt + lettre d'accès, EN W/S/H, FR E/P/A ; flèches ; Échap rend le focus au déclencheur).
- Paramètres : thème, langue, raccourcis, recharger (le bouton ⚙ de U15 et le bouton Recharger séparé disparaissent). Aide : documentation.
- Espace de travail : « Ouvrir un dépôt… » émet `openRepo` (branché par K06) ; les trois entrées multidépôt sont désactivées avec une infobulle jusqu'à K07.
- Le sélecteur de plage reste dans la barre jusqu'à K04.
- Vérifié : web 1058/0 (baseline 1030), cargo 682/0, e2e 180 passés / 1 ignoré, `just lint` propre, captures EN/FR à 1280 et 1024 px relues (correction : `white-space: nowrap` sur les déclencheurs, « Espace de travail » passait sur deux lignes).
- Doc : `map`, `getting-started`, `review` en FR/EN (texte seulement, captures non régénérées en phase alpha).
