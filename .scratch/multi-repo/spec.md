# Multirepo : une carte pour un changement full stack

Status: ready-for-agent (décisions du 2026-11-24, d'après la note de l'utilisateur dans K01)

## Besoin

Retour du 2026-11-20 : un changement full stack touche plusieurs dépôts (front, API, lib partagée). On veut les voir sur une seule carte, avec un nouveau niveau au-dessus du niveau système : le **dépôt**.

## Décisions

### Espace de travail

- **Monodépôt** (aujourd'hui) : `relief <chemin>` ouvre un dépôt ; ses données restent dans son `.relief/` (ADR 0007).
- **Multidépôt** : un **espace de travail** est un dossier choisi par l'utilisateur, qui contient `<nom>.relief.json` (configuration : dépôts, chemins, étiquettes, source et destination par défaut de chaque dépôt) et un `.relief/` (cache et état de relecture de tout l'espace). Les `.relief/` des dépôts membres sont ignorés en mode espace de travail. `relief <chemin>/<nom>.relief.json` (ou le dossier qui le contient) ouvre l'espace.
- **Sans chemin**, `relief` ouvre un **écran d'accueil** : ouvrir un dépôt, ouvrir un espace de travail, créer un espace à partir d'un dépôt, récents. (Changement : aujourd'hui, `relief` sans argument ouvre `.`.)
- Chaque dépôt garde **sa propre branche** courante ; on ne cherche pas à aligner les branches.
- **Étiquettes** par dépôt, au choix parmi `front`, `back`, `ops`, `tools` (liste par défaut, extensible dans le fichier de l'espace).

### Modèle et ids

- Un niveau **dépôt** (`NodeKind::Repo`, déjà dans le modèle) au-dessus des systèmes. En multidépôt, chaque id est préfixé par son dépôt : `repo:<nom>/` devant l'id d'aujourd'hui (`repo:api/pkg:@acme/api::file:…`). En monodépôt, rien ne change (pas de préfixe) : les ids, le cache et l'état « vu » existants restent valides. ADR à écrire (K02).
- Une **plage par dépôt** (base et head propres) ; le snapshot de l'espace est l'union des snapshots des dépôts, chacun sous son nœud dépôt, plus les arêtes entre dépôts.

### Arêtes entre dépôts

- **Imports de paquets publiés** : un import d'un paquet (npm, PyPI…) dont le nom est déclaré par un dépôt de l'espace (son `package.json`, `pyproject.toml`…) est résolu vers ce dépôt, par les adapters de langage (pas de cas particulier par langage dans l'index : l'adapter déclare les noms de paquets exportés, l'index relie).
- **Appels HTTP** (T04) : une route déclarée dans un dépôt et appelée depuis un autre deviennent une arête `http` entre dépôts.

### Interface

- **Barre du haut** façon barre de menus : **Espace de travail** (ajouter un dépôt à l'espace, ouvrir un dépôt comme espace, ouvrir un espace), **Paramètres** (thème, langue, raccourcis, recharger), **Aide** (documentation). Remplace le bouton Paramètres de U15.
- **Panneau gauche** : en tête, les infos de l'espace (nom, branche courante ; en multidépôt, les dépôts et leurs branches) au-dessus de la bascule de mode ; sous la bascule, la sélection de la comparaison, visible seulement en mode Relire la PR.
- **Sélection de la comparaison** façon création de PR : **source → fusionnée dans → destination**. Défaut sans configuration : source = working tree, destination = `main`. Source et destination par défaut configurables (monodépôt : `.relief/settings.json` ; multidépôt : par dépôt dans le fichier de l'espace).
- **Multidépôt** : un bouton transforme le panneau gauche en un menu de comparaison par dépôt (une ligne source → destination par dépôt), avec un bouton retour vers le panneau normal.

## Ordre

D'abord ce qui sert aussi en monodépôt (barre de menus, panneau gauche, sélection façon PR, accueil), puis le cœur multidépôt (ADR, espace de travail, snapshot, arêtes entre dépôts), puis l'UI multidépôt.
