# R14 Naviguer depuis le code

Status: needs-triage
Type: task
Blocked by: R02, U20
UI: oui
Doc: docs/user `review` (lire le code)

Spec: `../spec.md` (Phase 13)

## Constat

Dans le diff et le code d'un nœud, un appel à un autre symbole n'est que du texte : pour le lire, il faut le chercher (`/`).

## À faire

- Les identifiants du diff et du code dont la référence est connue du graphe (appels, rendus JSX, références de T03 ; utilisations d'arête de U20) sont des liens : clic = sélectionner et cadrer le nœud cible ; `Ctrl` + clic = l'ajouter à l'historique sans quitter la lecture (avec U25).
- Positions des références fournies par le cœur avec le diff / le code (pas de ré-analyse dans l'UI).

## Critères d'acceptation

- [ ] e2e acme-shop : dans le diff de `CheckoutPage`, cliquer sur l'appel à `computeTotal` sélectionne `computeTotal` sur la carte.
