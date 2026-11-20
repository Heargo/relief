# U15 Barre du haut : un bouton Paramètres

Status: resolved
Type: task
Blocked by: U11
UI: oui
Doc: user-docs `getting-started` (thème, langue, aide), captures

Spec: `../spec.md` (« Retours du 2026-11-20 ») ; référence visuelle : `docs/product/maquette/v2.html`, bouton ⚙ des sujets 2 et 3

## Constat

À droite de la barre du haut s'alignent la liste des langues, le bouton de thème, « ? » et « Aide ». L'utilisateur veut une barre plus calme : un seul bouton Paramètres.

## À faire

- À droite de la barre, après la recherche : un seul `.iconbtn` ⚙ (`aria-label` « Paramètres » / « Settings », `data-testid="settings-button"`) qui ouvre un menu (Optimus, popover ou menu) :
  - **Thème** : contrôle `.seg` Clair / Sombre / Système. Système suit `prefers-color-scheme` et efface la préférence enregistrée (`ThemeBusiness` : ajouter ce troisième état).
  - **Langue** : `.seg` English / Français.
  - **Raccourcis clavier** (avec `?` affiché) : ouvre l'aide existante.
  - **Documentation** : ouvre la doc (`docs.open()`).
- Le menu se ferme sur Échap, clic dehors, ou après « Raccourcis » / « Documentation ». La touche `?` ouvre toujours l'aide directement.
- La bascule PR / Explorer **ne bouge pas** : elle reste en haut du panneau gauche.
- Garder les `data-testid` existants sur les contrôles déplacés dans le menu (`theme-toggle` devient le `.seg` de thème, `language-select` celui de langue, `help-button` la ligne Raccourcis). Lister les e2e migrés (`shell`, `topbar`, `topbar-controls`, `navigation`…).

## Critères d'acceptation

- [ ] Vitest : `ThemeBusiness` gère Clair, Sombre et Système ; Système suit le média et n'écrit rien dans `localStorage`.
- [ ] Composant (TestBed) : la barre n'a plus à droite que la recherche et `settings-button` ; le menu ouvert contient thème, langue, raccourcis, documentation.
- [ ] e2e : changer le thème et la langue par le menu ; « Raccourcis » ouvre l'aide ; Échap ferme le menu. Tests existants migrés et verts.
- [ ] Captures EN et FR de la barre et du menu ouvert.

## Seams

1. **Logique** (Vitest) : `ThemeBusiness` à trois états.
2. **Composant** (TestBed) : contenu de la barre et du menu.
3. **e2e** sur acme-shop : parcours du menu.

## Baseline

Après U14 (c59c478, 2026-11-20) : cargo 578 passed, 0 failed ; web 569 passed, 0 failed ; e2e 108 passed, 1 skipped, 0 failed.

## Red

- Fichiers de test : `src/ui/src/app/core/business/theme.business.spec.ts` (nouveau), `src/ui/src/app/modules/map/components/map-page/map-page.component.spec.ts` (migré + nouveaux), `tests/e2e/tests/settings-menu.e2e.ts` (nouveau)
- e2e existants migrés (attentes changées pour passer par le menu) : `shell.e2e.ts` (langue), `topbar.e2e.ts` (corps 13 px du contrôle de langue), `topbar-controls.e2e.ts` (hauteur Reload = `settings-button`), `navigation.e2e.ts` (`help-button` après ouverture du menu), `docs.e2e.ts` (Documentation via `docs-button`)
- Contrat DOM attendu : `settings-button` (aria-label Settings/Paramètres), `settings-menu` (absent du DOM quand fermé), `theme-toggle` et `language-select` = `.seg` de `button` libellés Light/Dark/System (Clair/Sombre/Système) et English/Français, `help-button` (Shortcuts/Raccourcis + `?`), `docs-button` (Documentation). `ThemeBusiness` : `mode()` ('light'|'dark'|'system'), `setMode()`, `dark()`, écoute `matchMedia('change')`.
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/core/business/theme.business.spec.ts` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/map/components/map-page/map-page.component.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/settings-menu.e2e.ts` (idem pour les 5 e2e migrés, après `just build`)
- En échec : 
  - theme.business.spec.ts, 8 tests — `mode`/`setMode` n'existent pas (erreur de compilation TS2339)
  - map-page spec, 12 tests : barre réduite à recherche + `settings-button`, bouton Paramètres en FR, contenu du menu ouvert, libellés FR du menu, Échap ferme, clic dehors ferme, bouton bascule le menu, changement de langue par le menu, changement de thème par le menu, Raccourcis ouvre l'aide et ferme le menu, Documentation (EN) ouvre la doc et ferme le menu, Documentation (FR) — `settings-button` absent
  - settings-menu.e2e.ts, 6 tests (barre, thème, langue, Raccourcis, Échap, clic dehors) — `settings-button` introuvable
  - e2e migrés (shell, topbar, topbar-controls, navigation, docs) : échouent tant que le menu n'existe pas (non lancés individuellement)

## Green

- Fichiers : `src/ui/src/app/core/business/theme.business.ts`, `src/ui/src/app/modules/map/components/map-page/map-page.component.{ts,html}`, `src/ui/src/styles.scss`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `ThemeBusiness` à trois états (`mode`, `setMode`, `dark()` suit `matchMedia('change')`, Système efface `localStorage`). La barre n'a plus que la recherche et `settings-button` ; le menu (`settings-menu`, DOM simple) contient les `.seg` thème et langue, Raccourcis et Documentation ; il se ferme sur Échap, clic dehors et après Raccourcis/Documentation. Styles du menu dans `styles.scss` (le scss du composant reste sous son budget).
- Suite : cargo 578 passed, 0 failed ; web 582 passed, 0 failed (baseline 569, +13 tests rouges) ; e2e : settings-menu, shell, topbar, topbar-controls, navigation, docs passent (suite e2e complète non relancée) ; lint propre.
- Questions ouvertes : captures EN/FR du menu non faites (étape doc, pas de `docs-shots` en alpha).

## Answer

La barre du haut n'a plus à droite que la recherche et un bouton ⚙ `settings-button`. Son menu contient le thème (`.seg` Clair / Sombre / Système), la langue (`.seg` English / Français), Raccourcis (`?`) et Documentation. Il se ferme sur Échap, sur un clic dehors et après Raccourcis ou Documentation. `ThemeBusiness` gère trois états (`mode`, `setMode`). Système suit `matchMedia('change')` et efface la préférence enregistrée. Les styles du menu sont dans `styles.scss`, aucun budget relevé. Les `data-testid` existants sont gardés.

Vérifié : web 582/0, cargo 578/0, e2e complète 114 passés / 1 ignoré / 0 échec (dont `settings-menu` et les 5 e2e migrés), `just lint` propre, review `ship`. Capture du menu ouvert relue à 1024 px. Doc `map` et `getting-started` (FR/EN) mises à jour en texte seul. Captures de doc non refaites (phase alpha).

Restent en `Consider` : clé i18n `map.help` sans usage, `role="menu"` sans `menuitem`, fermeture au clic dehors couplée à la classe globale `.settings`.
