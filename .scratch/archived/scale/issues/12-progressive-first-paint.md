# S12 Afficher la carte avant la fin de l'indexation

Status: wontfix
Type: task
Blocked by: S10, S11
UI: oui
Doc: docs/user `getting-started` (premier lancement sur un gros dépôt)

Spec: `../spec.md` (Décisions : budgets)

## Constat

Sur n8n, la fenêtre reste vide pendant toute l'indexation (54 s à froid à la mesure de S02). À rouvrir avec les chiffres de S10 et S11 : à faire si l'ouverture à froid d'un gros dépôt dépasse encore 3 s.

## À faire

- Premier affichage avec les systèmes, modules et fichiers (detectors seuls, sans parse), puis les symboles et les arêtes quand l'indexation finit.
- Progression poussée par le cœur (événements Tauri : fichiers indexés / total) et affichée dans la barre du haut ; la carte reste utilisable pendant ce temps (navigation, recherche par chemin).
- La relecture (diff, ordre de lecture) attend la fin de l'indexation et le dit.

## Critères d'acceptation

- [ ] e2e sur `wide` à froid : des boîtes de packages sont à l'écran avant la fin de l'indexation, puis les symboles arrivent sans rechargement ni perte de la caméra.
- [ ] Ouverture à froid de n8n : premier affichage sous 3 s (`just bench`).

## Answer

Non fait : sa condition n'est pas remplie. Le ticket ne devait se faire que si un gros dépôt restait lent à froid après S10 et S11. `just bench` après S11 : ouverture à froid de n8n (25 662 fichiers TS) 5,6 s, contre 54,1 s en S02 ; à chaud 2,1 s ; excalidraw 0,30 s à froid. Afficher la carte avant la fin de l'indexation demanderait des événements poussés par le cœur (repoussés dans « Plus tard » du ROADMAP) pour un gain de quelques secondes au premier lancement seulement. À rouvrir si un dépôt réel dépasse ~10 s à froid. Fermé par l'orchestrateur au triage (2026-11-23).
