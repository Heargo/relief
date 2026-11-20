# R10 Exporter la relecture en Markdown

Status: needs-triage
Type: task
Blocked by: R09
UI: oui
Doc: docs/user `review` (exporter la relecture)

Spec: `../spec.md` (Phase 13)

## Constat

Les notes (R09) restent dans relief ; le relecteur doit les recopier à la main dans la PR.

## À faire

- Fonction pure (`relief-diff` ou `relief-app`) qui produit un Markdown de la relecture : plage, progression (« 12/14 vus »), signaux (signatures cassantes, nouveaux couplages, violations introduites), notes groupées par fichier avec `chemin:ligne`, type et état.
- Bouton « Copier la relecture » dans la carte de la PR (presse-papiers) ; les notes réglées sont exclues par défaut.

## Critères d'acceptation

- [ ] Test de la fonction sur acme-shop avec deux notes : Markdown attendu (instantané).
- [ ] e2e : le bouton copie un texte qui contient la plage et les notes ouvertes.

## Questions ouvertes

- Publier directement en commentaires de PR GitHub : reste dans « Plus tard » (adapter sous `src/interfaces/`).
