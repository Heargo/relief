# 0002. Angular pour l'UI

Status: accepted (2026-11-18, choix de l'utilisateur ; remplace la proposition Svelte 5)

## Contexte

L'UI est une seule page outillée : une carte en DOM + SVG avec des centaines de nœuds repositionnés à chaque frame de zoom, des panneaux, quelques formulaires. Elle est embarquée dans le binaire Rust. La maquette (`docs/product/maquette/index.html`) est en JS sans framework et a montré que le rendu DOM + SVG suffit jusqu'à environ 2 000 nœuds.

Svelte 5 avait été proposé pour la taille du bundle. Angular est retenu parce que c'est le framework pratiqué sur rpg-manager-front : mêmes conventions, même façon de tester, même workflow, relecture plus facile.

## Décision

- **Angular 22**, zoneless, composants standalone, **signals** pour l'état (`signal`, `computed`, `input()`, `output()`), contrôle de flux par blocs (`@if`, `@for`), TypeScript strict. Mêmes règles que `rpg-manager-front/docs/rules.md` pour tout ce qui n'est pas spécifique à relief.
- Couches **composant → business → service** : les composants affichent, les `*.business.ts` portent l'état et l'orchestration, `ReliefApiService` est le seul à parler à l'API (`HttpClient`).
- La logique non triviale (layout, visibilité, agrégation affichée, croisements) vit dans des modules TS purs `*.logic.ts`, sans injection Angular, testés sans TestBed.
- **Optimus UI** (comme rpg-manager-front) pour les contrôles : interrupteurs, sélecteurs, boîtes de dialogue, infobulles, menus. La carte elle-même est du DOM + SVG écrit à la main.
- **ngx-translate** pour l'anglais et le français, comme rpg-manager-front.
- Tests : Vitest via le builder `@angular/build:unit-test` (jsdom), TestBed pour les composants et les business.
- La carte met à jour les positions à chaque frame : le rendu passe par un composant qui écrit directement les styles des éléments (`Renderer2` ou accès DOM dans un `afterRenderEffect`), sans repasser par la détection de changements pour chaque nœud.

## Conséquences

- Bundle plus gros qu'avec Svelte (de l'ordre de quelques centaines de Ko compressés) : acceptable pour un outil local embarqué.
- `ng build` vérifie aussi les templates : il fait partie de `just lint`.
