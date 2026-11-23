# K01 Cadrer le multirepo

Status: needs-triage
Type: grilling
Blocked by: aucun
UI: non
Doc: aucune

Spec: `../spec.md`

## À faire

Trancher les questions de la spec avec l'utilisateur, consigner les décisions (ADR si besoin), puis découper en tickets.

## quicknote de l'utilisateur :
 Pour integrer correctement le multi repo et bien faire evoluer l'app il faut ajouter / modifier les éléments d'ui suivants
 - Modifier le header pour qu'il devienne un header de types paramètres (comme le header vs code avec File, Edit, Settings, Help etc...) On ajoute dedans donc : workspace (Ajouter un repo au workspace, Ouvrir un repo en tant que workspace, Ouvrir un workspace), Settings (Thèmes, langues, Raccourcis, Reload) Help (Documentation)
 - on déplace les informations générale du workspace au dessus de la selection de mode dans le bandeau de gauche (nom du workspace, branche courante)
 - la selection de branche pour la comparaisons se fait en dessous de la selection de monde, visible que en mode review de PR
 - on adapte un petit peu la selection de branche pour l'analys de pr pour avoir une interface comme si on créer une pr donc, source --merge dans-> destination (on peut configurer la source et la destination par défaut, sans configuration on a Working tree en source et main en destination )

 Maintenant pour ce qui est du mono repo :
 - si on lance relief sans passer de path on doit avoir une interface d'accuile avec quelques actions rapides possibles (Ouvrir un workspace etc..)
 - `.relief/`-> un pour l'espace de travail : on mode mono repo on peut juste se contenter du .relief dans le repo. Mais en multi repo il faut demander à l'utilisateur de selectionner un dossier ou il y aura dedans un fichier <workspace-name>.relief.json (avec les config générale du workspace) et un .relief avec les datas. Attention si un workspace fait un lien vers un repo ou il y a un .relief dedans, on ignore ce .relief.
 - en multi repo on peut ajouter des tags pour chaque repo (par défaut les tags dispo sont front, back, ops, tools)
 - chaque dépot à sa branche courante, on ne cherche pas à tout mettre sur les même branche (donc en multi repo il faut avoir une autre version de la selection de branche pour comparaison (on bouton qui permet de transformer la bare de gauche en un menu plus adapté et avec un petit bouton retour pour revenir à la barre de gauche normale)
 - Il faut pouvoir résoudre les impots entre dépots: imports de paquets publiés -> oui, l'implémentation générique pour utiliser la puissance des modules de languages, il faut aussi supporter les appels API (call HTTP)



