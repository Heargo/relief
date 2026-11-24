# Glossaire

Le vocabulaire de relief. Les décisions qui le fondent sont dans `docs/adr/`.

## Dépôts et espaces

- **Dépôt** : un dépôt git ouvert par relief. Ses données locales vivent dans son `.relief/` (ADR 0007). Sur la carte, le niveau dépôt est au-dessus du niveau système, en multidépôt seulement.
- **Monodépôt** : relief ouvre un seul dépôt (`relief <chemin>`). Les ids n'ont pas de préfixe de dépôt.
- **Espace de travail** : un dossier qui contient `<nom>.relief.json` (les dépôts membres, leurs étiquettes, leurs comparaisons par défaut) et un `.relief/` (cache et état de relecture de tout l'espace). Il ouvre plusieurs dépôts sur une seule carte (ADR 0010).
- **Dépôt membre** : un dépôt déclaré dans le fichier d'un espace de travail, sous un nom unique dans l'espace. Son `.relief/` est ignoré tant qu'il est ouvert dans l'espace.
- **Multidépôt** : relief ouvre un espace de travail. Chaque id porte le préfixe `repo:<nom>/` de son dépôt membre.
- **Étiquette** : une catégorie de dépôt membre (`front`, `back`, `ops`, `tools` par défaut), qui sert de filtre.

## Comparaison

- **Source** : ce qu'on relit, une ref ou le working tree.
- **Destination** : la branche dans laquelle la source serait fusionnée. La plage relue est `destination...source`.
- **Comparaison** : le couple source → destination, un par dépôt en multidépôt.
