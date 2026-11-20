# S19 Interactions sur le canvas : clic, survol, infobulles, clavier

Status: ready-for-agent
Type: task
Blocked by: S18, S16
UI: oui
Doc: aucune tant que le DOM reste le rendu par défaut

Spec: ADR `docs/adr/0009-carte-en-canvas-2d.md`

## Comportement

- Hit-testing pur (`map-hit.logic.ts`) sur la scène : étiquette d'arête (son rectangle), puis nœud le plus petit sous le point (grille de S07), puis arête la plus proche (`nearestEdge`, 6 px écran), fusionnées comprises.
- Clic : sélectionne le nœud ou l'arête, ou désélectionne sur le vide ; double-clic : plonge dans le nœud ; pan et zoom inchangés.
- Survol : curseur `pointer` sur ce qui est cliquable ; une infobulle DOM unique (positionnée, pas un `title`) montre le `tooltip` d'une arête et le libellé entier d'un nœud tronqué.
- Accessibilité : le canvas a `tabindex="0"` et un `aria-label` ; une région `aria-live` hors écran annonce le nœud ou l'arête sélectionnés ; Échap désélectionne, Entrée plonge dans le nœud sélectionné.
- Toute la suite e2e passe en `?renderer=canvas` (`RELIEF_E2E_RENDERER=canvas just e2e`, le harnais ajoute le paramètre).

## Critères d'acceptation

- [ ] `map-hit.logic.ts` testé (étiquette avant nœud, plus petit nœud, arête dans 6 px, rien).
- [ ] `RELIEF_E2E_RENDERER=canvas just e2e` vert, et `just e2e` (DOM) vert.
