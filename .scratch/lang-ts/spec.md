# Spec : adapter TypeScript (T)

Status: ready-for-agent
Date: 2026-11-18

## But

La **structure basse** des fichiers TS/TSX/JS/JSX : symboles, imports, appels, rendus JSX, références de types, et arêtes HTTP entre front et API. Premier langage du MVP ; il valide le contrat `LanguageAdapter` que réutilisera le second langage (L01).

## Décisions

- tree-sitter (`tree-sitter-typescript`, grammaires `typescript` et `tsx`) ; requêtes `.scm` dans `src/analysis/lang/relief-lang-ts/queries/`, pour qu'ajouter un langage soit surtout écrire des requêtes.
- Contrat : `LanguageAdapter::index_file(path, bytes, ctx) -> FileIndex { symbols, imports, refs }` (sérialisable) ; la résolution entre fichiers (`imports` → symbole cible) se fait dans l'index, avec la table des packages du detector et les `paths` de `tsconfig.json`.
- Symboles retenus : déclarations de premier niveau (exportées ou non) et méthodes de classe. Pas les variables locales. Un composant React = une fonction ou constante qui renvoie du JSX et dont le nom commence par une majuscule (`subkind: component`).
- `content_hash` : hash des tokens du corps (sans espaces ni commentaires). `signature_hash` : hash de la signature normalisée (paramètres, types, type de retour, modificateurs d'export) ; le texte normalisé est conservé pour le diff de signatures (E02).
- Toutes les arêtes de cet adapter sont `precision: syntactic`. SCIP (`resolved`) viendra plus tard.
- Fichiers de test (`*.spec.ts`, `*.test.ts`, `__tests__/`) : indexés avec `subkind` `test` ; ils servent à « testé / sans test » et sont masqués de la carte par défaut.
