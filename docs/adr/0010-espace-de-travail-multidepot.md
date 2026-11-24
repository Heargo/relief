# 0010. Espace de travail multidépôt et ids préfixés par le dépôt

Status: accepted (2026-11-24, K02 ; complète ADR 0007)

## Contexte

Un changement full stack touche souvent plusieurs dépôts : un front, une API, une bibliothèque partagée. On veut les relire sur une seule carte, avec un niveau **dépôt** au-dessus du niveau système (`NodeKind::Repo` existe déjà dans le modèle). Il faut décider où vit la configuration d'un ensemble de dépôts, où vivent son cache et son état de relecture, comment on nomme un nœud quand deux dépôts ont chacun un `src/index.ts`, et comment la plage relue s'exprime quand chaque dépôt a sa propre branche.

La contrainte : le monodépôt, qui est le cas courant, ne doit rien perdre. Ses ids, son cache et son état « vu » (ADR 0007) restent valides.

## Décision

- **Espace de travail** : un dossier choisi par l'utilisateur, qui contient
  - `<nom>.relief.json`, la configuration versionnable : les dépôts membres (nom, chemin relatif ou absolu), leurs étiquettes (`front`, `back`, `ops`, `tools` par défaut, liste extensible dans le fichier), et la source et la destination par défaut de chaque dépôt ;
  - `.relief/`, les données locales de l'espace (cache, état de relecture), au même format que le `.relief/` d'un dépôt (ADR 0007).

  `relief <chemin>/<nom>.relief.json`, ou le dossier qui le contient, ouvre l'espace. En mode espace de travail, les `.relief/` des dépôts membres sont ignorés : rien n'est lu ni écrit dedans.
- **Ids préfixés en multidépôt seulement** : chaque id d'un espace porte son dépôt, `repo:<nom>/` devant l'id d'aujourd'hui (`repo:api/pkg:@acme/api::file:src/index.ts`). Le nœud dépôt lui-même a pour id `repo:<nom>`, sans `/` final (forme canonique : `repo:<nom>/` sans partie locale est refusé). Le nom est unique dans l'espace, non vide et sans `/`, puisque l'id est coupé au premier `/` ; `:` et les espaces sont permis, et aucun échappement n'est nécessaire. Un id n'a qu'un préfixe de dépôt. En monodépôt, aucun préfixe : les ids sont ceux d'aujourd'hui. `relief-model` construit et décompose les ids préfixés (`NodeId::in_repo`, `NodeId::repo`) ; un id sans préfixe n'a pas de dépôt.
- **Une plage par dépôt** : chaque dépôt garde sa branche courante et a sa propre comparaison source → destination ; on ne cherche pas à aligner les branches. Le snapshot de l'espace est l'union des snapshots des dépôts, chacun sous son nœud dépôt, plus les arêtes entre dépôts.
- **Arêtes entre dépôts par les adapters** : un adapter de langage déclare les noms de paquets qu'un dépôt publie (`package.json`, `pyproject.toml`…) ; l'index relie un import de ce nom au dépôt qui le publie, sans cas particulier par langage. Les routes HTTP (T04) déclarées dans un dépôt et appelées depuis un autre donnent une arête `http` entre dépôts.

## Alternatives écartées

- **Un manifeste dans l'un des dépôts** (par exemple le front liste ses dépôts frères) : il impose un dépôt « principal », pollue un dépôt de l'équipe avec la configuration locale d'une personne, et ne marche pas quand on n'a pas le droit d'y écrire.
- **Le dossier parent implicite** (tous les dépôts git sous un dossier forment l'espace) : pas de choix des membres, pas de place pour les étiquettes ni les défauts de comparaison, et le résultat dépend de ce qui traîne dans le dossier.
- **Le préfixe partout, monodépôt compris** : un seul format d'id, mais tous les caches, tous les états « vu » et toutes les URL existants deviennent invalides, pour un cas qui n'en a pas besoin.

## Conséquences

- Un id porte ou non un dépôt ; le code qui affiche un chemin ou compare des ids doit passer par `NodeId`, jamais par du découpage de chaînes.
- Un espace a son propre cache : ouvrir un dépôt seul puis dans un espace l'indexe deux fois. C'est accepté.
- Le contrat JSON ne change pas en monodépôt ; en multidépôt, il ajoute le niveau dépôt.
