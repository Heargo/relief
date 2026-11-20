# U23 Choix base / head : quelle est la référence ?

Status: needs-triage
Type: task
Blocked by: U19
UI: oui
Doc: user-docs `review` (choisir ce qu'on compare)

Spec: `../spec.md`

## Constat

Retour du 2026-11-20 : dans la barre du haut (U19), on ne voit pas quel côté est la référence de la comparaison, ni dans quel sens se lit le diff.

## À faire

- Maquette : `docs/product/maquette/v3.html` (option A recommandée, option B). En attente de validation.
- Proposer un design avant d'implémenter (maquette) : libellés explicites « Référence (base) » et « Changements (head) », sens de lecture (`base → head`), rappel de ce que devient la carte (« ce que head change par rapport à base »).
- Préciser le cas du working tree et du merge-base (`main...feature`) : quelle base est réellement utilisée.
- Un bouton pour inverser base et head, si la maquette le retient.

## Critères d'acceptation

- [ ] Maquette validée.
- [ ] e2e : les deux sélecteurs portent leur rôle ; l'inversion échange les deux refs.
