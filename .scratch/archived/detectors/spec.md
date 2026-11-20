# Spec : Project Detectors (D)

Status: ready-for-agent
Date: 2026-11-18

## But

Donner la **structure haute** d'un dépôt (systèmes, modules) à partir de son arbre de fichiers, pour **n'importe quelle codebase**. Sans detector spécialisé, relief doit quand même afficher une carte utile : dossiers et fichiers.

## Décisions

- Un detector est une fonction pure : `(liste des chemins, lecteur de blob) -> Structure { systems, modules, externals, depends_on }`. Il ne lit jamais git lui-même.
- Detectors appliqués dans l'ordre ; le plus spécifique qui reconnaît le dépôt gagne pour les systèmes, le générique complète toujours (modules = dossiers).
- **Générique** : un seul système (le dépôt), modules = dossiers de premier et second niveau sous les racines de code, fichiers. Langage déduit de l'extension. Exclus par défaut : binaires, lockfiles, `node_modules/`, `vendor/`, `dist/`, `build/`, `target/`, fichiers générés connus ; complété par `exclude:` de `relief.config.yaml` plus tard (A01).
- **npm/pnpm/yarn workspaces** : un système par package (`name` du `package.json`), rangé en `apps/*` → `service`, sinon `package` ; arêtes `depends_on` entre packages du workspace d'après les dépendances déclarées ; dépendances externes → nœuds `external` (regroupés, pas un nœud par paquet npm dans la carte par défaut).
- Les tests passent sur des listes de chemins en mémoire, plus un test d'intégration sur acme-shop.
