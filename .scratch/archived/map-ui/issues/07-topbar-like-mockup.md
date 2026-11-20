# U07 Barre du haut conforme à la maquette

Status: resolved
Type: task
Blocked by: U01, U05
UI: oui
Doc: user-docs `map` et `getting-started` (captures de la barre du haut, FR et EN)

Spec: `../spec.md` ; référence visuelle : `docs/product/maquette/index.html` (CSS `.top`, `.logo`, `.repo`, `.refsel`, `.search`, `.iconbtn`, `kbd`)

## Constat

`relief .` sur relief (capture de l'utilisateur, 2026-11-20) et les captures `docs/user/src/assets/screens/*/review-map.png` :

- Les contrôles Optimus (recherche, sélecteur de plage, sélecteur de langue) gardent leur style par défaut. Ils s'affichent en ~16 px, sans les fonds et bordures de la maquette. Le reste de la page est en 13 px.
- La plage (`main...feat/promo-codes`) est un texte avec un chevron isolé, au lieu d'une boîte en police à chasse fixe de 12 px (`.refsel`).
- La recherche n'a pas l'icône loupe, sa largeur est libre et la touche `/` flotte à côté du champ au lieu d'être dans le champ.
- Le logo de la maquette (icône + `relief`, 15 px, gras) est réduit à un mot. Le nom du dépôt n'est pas en gras, et la ligne « · TypeScript · pnpm workspaces » (langages, detector) est absente.
- « Relire la PR / Explorer le repo » sont deux boutons dans la barre. Dans la maquette, c'est un contrôle segmenté (`.seg`) en tête du panneau gauche (déplacé par U08, pas ici).
- « Sombre », « ? », « Aide » et le sélecteur de langue ne suivent pas `.iconbtn` (bordure `--line-2`, rayon 6 px, couleur `--muted`).

## À faire

- Thème Optimus : définir une fois, dans `styles.scss`, les variables ou surcharges qui alignent les champs, sélecteurs et boutons d'Optimus sur la maquette : police héritée de 13 px, fond `--relief-panel-2`, bordure `--line-2`, rayon 6 px, focus `--acc`. Pas de style posé contrôle par contrôle.
- Barre du haut : logo, dépôt en gras, langages et detector du `meta` en gris, plage en `.refsel`, recherche de 280 px avec loupe et `kbd` `/` dans le champ, boutons de droite en `.iconbtn`.
- Hauteur de la barre et espacements de la maquette (`gap: 14px`, `padding: 0 14px`, bordure basse `--line`).
- Les deux thèmes (clair et sombre) restent lisibles.

## Critères d'acceptation

- [ ] e2e : à 1280 px, la taille de police calculée de la recherche, du sélecteur de plage et du sélecteur de langue vaut 13 px (12 px pour la plage, en chasse fixe).
- [ ] e2e : la barre montre le nom du dépôt et le detector (`TypeScript · workspaces` sur acme-shop ; « pnpm » demanderait de changer le detector, hors ticket).
- [ ] e2e : le test existant « at 1024x768 every element of the top bar fits in the viewport » passe toujours.
- [ ] Captures EN et FR, à 1280 et 1024 px, comparées à la maquette ouverte à la même taille. Les écarts restants sont listés dans `## Answer`.

## Baseline

`just test-summary` sur `develop` (d355fc6) : cargo 578 passed, 0 failed ; web 476 passed, 0 failed. `just e2e-summary` (après D04) : 87 passed, 1 skipped, 0 failed. Seul `quicknotes.md` non suivi (fichier de l'utilisateur).

## Seams

1. **Entrées/sorties du composant `map-page`** (TestBed, `TEST_PROVIDERS`, `ReliefApiService` mocké) : attrape le contenu de la barre (dépôt en gras, langages et detector issus de `SnapshotMeta`, recherche avec loupe et `kbd` `/`, plage, boutons `.iconbtn`). Rate les tailles calculées (jsdom ne calcule pas le CSS).
2. **Module de logique TS** (`*.logic.ts`, Vitest) pour le texte « langages · detector » tiré de `SnapshotMeta` (ex. `TypeScript · pnpm workspaces` sur acme-shop) : attrape le libellé exact et ses replis. Rate le rendu.
3. **e2e WebdriverIO** sur acme-shop : tailles de police calculées (13 px ; plage 12 px en chasse fixe), barre qui tient à 1024 px, dépôt et detector visibles. Rate le détail du rendu, couvert par les captures de l'étape 7.

UI : oui. Doc : `map`, `getting-started` (captures).

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/repo-meta.logic.spec.ts` (nouveau ; importe `repoMetaLine` de `./repo-meta.logic`), `src/ui/src/app/modules/map/components/map-page/map-page.component.spec.ts` (5 tests ajoutés), `tests/e2e/tests/topbar.e2e.ts` (nouveau)
- Lancer : `cd src/ui && npx ng test --watch=false --include src/app/modules/map/helpers/repo-meta.logic.spec.ts` ; `cd src/ui && npx ng test --watch=false --include src/app/modules/map/components/map-page/map-page.component.spec.ts` ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/topbar.e2e.ts`
- En échec : 13 tests
  - repo-meta.logic.spec (6 tests : libellé acme-shop, plusieurs langages, détecteur seul, langages seuls, vide, adapter inconnu) — le module `./repo-meta.logic` n'existe pas
  - map-page : « shows the repo name, then the languages and detector… » — pas de `<b>` dans `repo-name` ni de `data-testid="repo-meta"`
  - map-page : « has the logo icon next to the relief word » — pas d'élément `.logo` (icône SVG + `relief`)
  - map-page : « puts the magnifier and the slash key inside the search field » — pas de `data-testid="search-icon"`
  - map-page : « shows the range in a monospace box » — `range-select` n'a pas la classe `refsel`
  - map-page : « styles the theme, help and language controls as icon buttons » — pas de classe `iconbtn`
  - e2e « at 1280 px the search and the language select… » — police calculée 16 px au lieu de 13 px
  - e2e « the top bar shows the bold repo name and the detector » — pas de `b` dans `repo-name` (erreur JS d'élément manquant)
- Écart ticket / réalité : sur acme-shop, `SnapshotMeta` vaut `detector: "workspaces"`, `adapters: ["typescript"]`. Rien ne dit « pnpm ». Les tests attendent donc `TypeScript · workspaces` (logique) et un texte contenant `workspaces` (e2e), pas `pnpm workspaces` comme le critère du ticket. Obtenir « pnpm workspaces » demanderait de changer le détecteur (hors seams) : à trancher.
- Noms convenus pour le green : `repoMetaLine(meta: SnapshotMeta): string` (« TypeScript » pour `typescript`, nom brut pour un adapter inconnu, joint par ` · `, détecteur en dernier) ; `data-testid` `repo-meta`, `search-icon` ; classes `.logo` (avec `svg`), `.refsel` sur `range-select`, `.iconbtn` sur `theme-toggle`, `help-button`, `language-select` et le lien d'aide.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/repo-meta.logic.ts` (nouveau), `src/ui/src/app/modules/map/components/map-page/map-page.component.{html,scss,ts}`, `src/ui/src/styles.scss`
- Changement : `repoMetaLine` (langages puis detector) ; barre refaite sur la maquette (logo SVG, dépôt en `<b>` + meta grise, loupe et `kbd` dans la recherche, `.refsel` 12 px mono, `.iconbtn` sur thème/aide/langue/lien Aide, gap et padding 14 px). Thème Optimus posé une fois dans `styles.scss` (tokens `--p-inputtext-*`/`--p-select-*` sur `body`, `font-size: inherit` sur `.p-inputtext`/`.p-select*`, variable `--relief-panel-2` ajoutée clair/sombre). `.app` passe en `grid-template-columns: minmax(0, 1fr)` : sans cela la barre débordait du viewport à 1024 px.
- Suite : cargo 578 réussis, 0 échoué (= baseline) ; web 487 réussis, 0 échoué (baseline 476, +11 tests rouges) ; e2e 89 réussis, 1 ignoré, 0 échoué (baseline 87 +2) ; lint propre ; aucun fichier de test modifié.
- Questions ouvertes : le critère « pnpm workspaces » n'est pas tenu (le detector dit `workspaces`) ; captures EN/FR à 1280 et 1024 px et doc utilisateur restent à faire (étapes suivantes) ; `map-page.component.scss` dépasse le budget de 4 kB (5,53 kB, avertissement de build seulement).

## Review

- Verdict : ship
- Must fix : aucun (reste à faire dans le workflow, pas dans le code : captures EN/FR à 1280 et 1024 px et pages `docs/user/` `map` et `getting-started` dans les deux langues)
- Consider :
  - `map-page.component.scss` — budget 4 kB : déjà dépassé avant le ticket (5,8 ko bruts sur HEAD, 6,7 ko maintenant, soit +1 ko pour la barre). Avertissement seulement, pas à corriger ici. Un ticket de découpe (barre du haut, panneaux) le réglerait.
  - `map-page.component.scss` — deux blocs `.refsel` (police, puis flex/min-width) : les fusionner.
  - `repo-meta.logic.ts:3` — table de langues en dur (typescript, python, rust) : un adapter ajouté s'affiche en nom brut, acceptable.
  - Critère « pnpm workspaces » non tenu (detector = `workspaces`) : le ticket est déjà amendé en `TypeScript · workspaces`, à confirmer avec l'utilisateur.

## Answer

- **Barre du haut refaite sur la maquette.**
  - Logo : une icône SVG et le mot `relief`.
  - Le dépôt en gras, suivi de `repoMetaLine(meta)` en gris, par exemple « TypeScript · workspaces ». Ce texte vient de `helpers/repo-meta.logic.ts`.
  - La branche tient sur une ligne. Elle se coupe avec une ellipse quand la place manque.
  - La recherche a la loupe et la touche `/` dans le champ.
  - La plage est en `.refsel`, en police à chasse fixe de 12 px.
  - « Sombre », « ? », « Aide », le sélecteur de langue et les deux boutons de mode prennent le style `.iconbtn`, sur une seule ligne, à la même hauteur (29 px).
- **Thème Optimus posé une fois dans `styles.scss`.** Ce sont les tokens `--p-inputtext-*` et `--p-select-*`, avec une police héritée de 13 px. La variable `--relief-panel-2` est ajoutée en clair et en sombre. `.app` passe en `grid-template-columns: minmax(0, 1fr)` : sans ça, la barre débordait à 1024 px.
- **Décisions.**
  - Le texte de la barre est « TypeScript · workspaces », pas « pnpm workspaces » : le detector ne renvoie que `workspaces`. Le critère du ticket a été corrigé dans ce sens.
  - Sous 1180 px, les langages et le detector sont masqués, pour garder le nom du dépôt entier.
  - La branche descend jusqu'à 6ch, avec une ellipse.
  - Les boutons de mode restent dans la barre en attendant U08.
- **Vérifié.**
  - `just test-summary` : cargo 578 passed, web 487 passed (+11).
  - `just e2e-summary` : 89 passed (+2), 1 skipped, 0 failed.
  - `just lint` propre, `just docs-build` passe.
  - Captures EN et FR à 1280 px (`map`, `home`, `getting-started-files`, `map-search`, régénérées) et à 1024 px (captures ponctuelles hors dépôt). Au niveau de la maquette sur la barre ; tout tient à 1024 px.
- **Doc.** Ligne « Barre du haut » de `map` (FR et EN) mise à jour, et captures `map` et `getting-started` régénérées.
- **Restes.**
  - `map-page.component.scss` dépasse le budget de 4 kB. C'est un avertissement, et le dépassement existait déjà avant ce ticket. À découper avec U08.
  - `just docs-shots <page>` ignore son argument et lance toutes les captures. L'une d'elles (`review`, `explore` ou `rules`) bloque sans fin sous xvfb. Les captures de ce ticket ont été prises fichier par fichier avec `--spec`.
