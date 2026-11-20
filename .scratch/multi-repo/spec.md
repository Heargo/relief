# Multirepo : une carte pour un changement full stack

Status: needs-triage

## Besoin

Retour du 2026-11-20 : un changement full stack touche plusieurs dépôts (front, API, lib partagée). On veut les voir sur une seule carte, avec un nouveau niveau au-dessus du niveau système : le **dépôt**.

Déjà noté dans `.scratch/ROADMAP.md` (« Plus tard ») : manifeste `relief.workspace.yaml`, submodules, arêtes inter-services.

## Questions à trancher (grilling)

- Comment désigner les dépôts : manifeste, plusieurs chemins en argument, dossier parent ?
- Une plage par dépôt (base/head propres à chacun) ou une branche commune ?
- Arêtes entre dépôts : imports de paquets publiés (npm, PyPI) résolus vers le dépôt local, arêtes HTTP (T04).
- Impact sur les ids stables (M01) et le contrat JSON (M02) : préfixe de dépôt.
- `.relief/` : un par dépôt ou un pour l'espace de travail ?
