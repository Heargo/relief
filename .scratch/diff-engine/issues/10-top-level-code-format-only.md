# Code de haut niveau d'un fichier analysé classé « format seul »

Status: needs-triage
Type: bug
Blocked by: aucun
UI: non
Doc: docs/user `review`

Spec: `../spec.md` (Décisions : format_only)

## Contexte

Relevé à la review du bug 09 (2026-11-24) : un fichier analysé (TS, Python) dont le changement est hors de tout symbole et ne crée pas d'arête (code de haut niveau qui n'est pas un symbole) reste classé `format_only`, car le nœud fichier de l'adapter TS a un `content_hash` vide (`relief-lang-ts`). Le diff reste accessible par « Afficher quand même le diff texte ».

## Comportement attendu (à cadrer)

- Un tel changement n'est pas `format_only` ; un changement de commentaire seul ou de blancs seul le reste (E05). Piste : un `content_hash` du fichier sur le texte normalisé hors symboles.

## Critères d'acceptation

- [ ] Cas d'usage : une instruction de haut niveau modifiée dans un `.ts` n'est pas `format_only` ; un commentaire de haut niveau modifié l'est.
