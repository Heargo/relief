# K02 ADR : espace de travail et ids de dépôt

Status: ready-for-agent
Type: task
Blocked by: K01
UI: non
Doc: `docs/adr/0010-espace-de-travail-multidepot.md`

Spec: `../spec.md` (Décisions)

## À faire

- ADR 0010 : espace de travail (`<nom>.relief.json` + `.relief/`), préfixe `repo:<nom>/` des ids en multidépôt seulement, une plage par dépôt, arêtes entre dépôts par les adapters ; alternatives écartées (manifeste dans un dépôt, dossier parent implicite, préfixe partout).
- `relief-model` : construire et décomposer un id préfixé (`NodeId::in_repo`, `NodeId::repo`), sans changer les ids sans préfixe ; tests.

## Critères d'acceptation

- [ ] ADR écrit, `GLOSSARY.md` à jour (espace de travail, dépôt membre).
- [ ] Tests du modèle : aller-retour d'un id préfixé, id sans préfixe inchangé, contrat JSON inchangé en monodépôt.
