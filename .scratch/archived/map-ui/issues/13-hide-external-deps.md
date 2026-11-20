# U13 Masquer les dépendances externes

Status: resolved
Type: feature
Blocked by: U08
UI: oui
Doc: user-docs `map` (section des calques / options de la carte), FR + EN

Spec: `../../archived/map-ui/spec.md` (aucune section dédiée)

## Constat

Demande de l'utilisateur (2026-11-20). Les adapters TS et Python (et le detector pyproject) ajoutent un groupe `external` (`NodeKind::Module`, subkind `external-group`, id `pkg:external`) et un nœud `NodeKind::External` par paquet tiers importé (`pkg:external/react`…), avec les arêtes qui y mènent. Sur un vrai dépôt, ces paquets et leurs arêtes encombrent la carte et ne disent rien de l'architecture du dépôt.

Une seconde option avait été demandée (« masquer les fichiers du `.gitignore` ») : abandonnée, le lecteur du working tree exclut déjà les fichiers non suivis ignorés.

## À faire

- Un interrupteur « Masquer les dépendances externes » / « Hide external dependencies » dans le panneau gauche, au style `.tog` des calques (U08), **actif par défaut**.
- Actif : les nœuds `kind: external`, le groupe `external-group` et toutes les arêtes dont une extrémité est l'un d'eux disparaissent de la carte (rendu, layout, arêtes agrégées, comptes affichés). Inactif : la carte d'aujourd'hui.
- Le choix est une préférence de l'utilisateur : `localStorage`, chaque accès dans un `try/catch` (`docs/dev/rules.md`, UI). Absent ou illisible → actif.
- Filtre d'affichage côté UI, dans un helper pur `*.logic.ts` ; le cœur ne change pas (les données du diff, de l'impact et des règles restent complètes).
- Clés i18n dans `en.json` et `fr.json`.

## Critères d'acceptation

- [x] Logique (Vitest) : sur un graphe avec un groupe externe, deux paquets externes et des arêtes fichier → externe, le filtre actif retire ces nœuds et ces arêtes et garde le reste ; inactif, il rend le graphe tel quel.
- [x] Business (TestBed) : par défaut l'option est active ; la basculer change les nœuds visibles et est relue de `localStorage` ; un `localStorage` qui lève garde la valeur par défaut.
- [x] e2e (acme-shop) : au chargement, aucun nœud externe sur la carte ; l'interrupteur est actif ; le désactiver fait apparaître le groupe externe.
- [x] Doc `map` FR + EN mentionne l'option.

## Baseline

`develop` (b775cab) : cargo 578 passed, 0 failed ; web 555 passed, 0 failed. Non suivis/modifiés hors ticket : `quicknotes.md` (utilisateur), `src/interfaces/relief-desktop/Cargo.toml` (autre session), à ne pas commiter.

## Seams

1. **Helper pur `*.logic.ts`** (Vitest) : filtre des nœuds `external` / `external-group` et de leurs arêtes sur un graphe construit en mémoire. Attrape la règle de filtrage ; rate le câblage et la persistance.
2. **Business de la carte** (TestBed, `ReliefApiService` mocké) : préférence active par défaut, basculement, relecture et `localStorage` qui lève ; nœuds visibles filtrés. Rate le rendu de l'interrupteur.
3. **e2e WebdriverIO** sur acme-shop : interrupteur actif au chargement, aucun nœud externe, le désactiver fait apparaître le groupe externe. Rate le détail visuel.

## Red

- Fichiers de test : `src/ui/src/app/modules/map/helpers/external.logic.spec.ts`, `src/ui/src/app/modules/map/business/map-external.business.spec.ts`, `tests/e2e/tests/hide-external.e2e.ts`
- Lancer : depuis `src/ui/` `npx ng test --watch=false --include <fichier spec>` (un par fichier Vitest) ; `cd tests/e2e && npx wdio run wdio.conf.ts --spec tests/hide-external.e2e.ts`
- Contrat à implémenter : `hideExternalDeps(graph, hide)` dans `helpers/external.logic.ts` ; `MapBusiness.hideExternal()` (signal, défaut true) et `setHideExternal(hide)`, clé `localStorage` `relief.hideExternal` (`'true'`/`'false'`) ; bouton `data-testid="toggle-hide-external"` avec `aria-checked`.
- En échec : 8 tests
  - external.logic.spec (3 tests : drops the external group…, returns the graph as it is…, does not mutate…) — module `./external.logic` introuvable
  - map-external.business.spec (4 tests : hides them by default, shows the external group once switched off, reads the stored choice, keeps the default when localStorage throws) — `hideExternal` / `setHideExternal` absents de `MapBusiness` (erreur de compilation TS2339)
  - hide-external.e2e (1 test : hides them at load, and shows the external group once switched off) — `toggle-hide-external` introuvable
- Attention green : activer le filtre par défaut peut changer des tests existants qui comptent sur acme-shop (ex. totaux de croisements 586 dans `map-layout.business.spec.ts`, e2e) ; à réévaluer.

## Green

- Fichiers : `src/ui/src/app/modules/map/helpers/external.logic.ts` (nouveau), `src/ui/src/app/modules/map/business/map.business.ts`, `src/ui/src/app/modules/review/components/layers-section/layers-section.component.ts`, `src/ui/src/app/modules/map/components/map-page/map-page.component.html`, `src/ui/public/i18n/{en,fr}.json`
- Changement : `hideExternalDeps` (filtre pur) + lecture/écriture `localStorage` `relief.hideExternal` ; `MapBusiness.show()` filtre le graphe reçu (le graphe source est gardé) et `setHideExternal` relance le layout en gardant la vue ; ligne `toggle-hide-external` (style `.tog`) ajoutée à la section des calques via `hasHideExternal` ; clés `map.external.hide` et `review.layers.description.hide-external`.
- Suite : web 560 réussis / 2 échoués (baseline 555/0, +7 tests rouges désormais verts) ; cargo inchangé (aucun code Rust touché) ; e2e 32 specs OK / 1 KO ; lint propre.
- Tests existants cassés par le filtre actif par défaut (non modifiés, car les fichiers de test sont figés) :
  - `map-layout.business.spec.ts` « reports the totals of both layouts » : `totals.raw` 586 -> 200 (les arêtes vers les externes ne comptent plus). Le `<= 293` de `optimized` passe encore.
  - `map-layout.business.spec.ts` « counts the crossings on screen… raw-grid » : `visibleCrossings` 1 -> 0 (le croisement venait d'une arête vers le groupe externe).
  - e2e `tests/map.e2e.ts` « level 0 shows the four systems and the external dependencies » : `pkg:external` n'est plus affiché par défaut ; il faut désactiver l'interrupteur d'abord, ou ne plus attendre le groupe.
  Ces trois tests sont à réécrire par l'humain ou l'agent red (valeurs attendues 200 et 0, ou désactiver `relief.hideExternal` en setup).
- Questions ouvertes : réécrire ces trois tests (la consigne interdit de modifier les fichiers de test).

## Review

- Verdict : fix first
- Must fix : docs/user/src/content/docs/map.md et docs/user/src/content/docs/en/map.md — l'option « Masquer les dépendances externes » (active par défaut, mémorisée) n'est pas documentée, critère d'acceptation « Doc map FR + EN » non rempli — ajouter une mention dans la section des calques/options, dans les deux langues
- Consider : src/ui/.../map-page.component.html — `[hasHideExternal]="true"` en dur, input superflu tant qu'un seul hôte l'utilise (généralité spéculative) ; src/ui/.../layers-section — aucun test composant pour la ligne `toggle-hide-external` (couverte seulement par l'e2e) ; map.business.ts `setHideExternal` — `show(..., true)` relance le layout, bon, mais le test business ne vérifie pas que les arêtes agrégées/comptes disparaissent (seuls les ids de nœuds sont testés)
- Modifs des tests existants : correctes. map-layout.business.spec.ts (hideExternal=false en setup) garde 586/1 qui comptent les externes ; map.e2e.ts désactive l'interrupteur avant d'attendre pkg:external. Pas d'affaiblissement des assertions. Le titre du test e2e reste valable.
- Spec, code, sécurité, i18n (en/fr), localStorage en try/catch : conformes.

## Answer

- Interrupteur « Masquer les dépendances externes » / « Hide external dependencies » dans la section Calques (`toggle-hide-external`, style `.tog`), actif par défaut, mémorisé dans `localStorage` `relief.hideExternal` (accès en `try/catch`, défaut actif).
- Filtre pur `hideExternalDeps` (`map/helpers/external.logic.ts`) : retire les nœuds `external`, le groupe `external-group` et toutes les arêtes qui les touchent. `MapBusiness.show()` filtre le graphe reçu et garde la source ; `setHideExternal` relance le layout en gardant la vue. Le cœur ne change pas.
- Option « masquer les fichiers du `.gitignore` » abandonnée avec l'utilisateur : le working tree exclut déjà les non-suivis ignorés.
- Tests existants adaptés par l'orchestrateur, sans affaiblir d'assertion : `map-layout.business.spec.ts` met `relief.hideExternal=false` en setup (les chiffres 586 / 1 comptent les externes) ; `map.e2e.ts` désactive l'interrupteur avant d'attendre `pkg:external`.
- Vérifié : cargo 578/0, web 562/0 (baseline 555/0), e2e 106 passed / 1 skipped / 0 failed, `just lint` propre, `just docs-build` passe.
- Doc : page `map` FR + EN (texte). Captures non régénérées : choix de l'utilisateur en phase alpha.
- Consider restants de la review : input `hasHideExternal` en dur sur un seul hôte ; pas de test composant de la ligne dans `layers-section` ; le test business ne vérifie que les nœuds, pas les arêtes agrégées.
