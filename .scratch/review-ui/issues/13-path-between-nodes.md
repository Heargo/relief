# R13 Chemin entre deux nœuds

Status: needs-triage
Type: task
Blocked by: E06
UI: oui
Doc: docs/user `map` (pourquoi A dépend de B)

Spec: `../spec.md` (Phase 13)

## Constat

Devant un couplage transitif (« pourquoi `apps/web` dépend-il de `packages/db` ? »), il faut suivre les arêtes une à une.

## À faire

- Cas d'usage `Session::path { range, from, to }` : plus court chemin de dépendances (dans le sens des arêtes, HTTP comprises selon le même réglage que l'impact), au niveau des symboles, et commande Tauri ; fonction pure dans `relief-diff`.
- UI : `Maj` + clic sur un second nœud quand un premier est sélectionné : le chemin est surligné sur la carte et listé dans l'inspecteur, étape par étape, chacune cliquable ; « aucun chemin » si les deux nœuds ne sont pas reliés.

## Critères d'acceptation

- [ ] Test de la fonction pure sur acme-shop : chemin de `CheckoutPage` à `SessionStore` attendu ; aucun chemin dans l'autre sens.
- [ ] e2e : `Maj` + clic surligne le chemin et l'inspecteur liste ses étapes.
