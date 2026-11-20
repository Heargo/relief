# Spec : explorer un repo inconnu (X)

Status: ready-for-agent
Date: 2026-11-18

## But

Le second usage du brainstorm : comprendre un dépôt qu'on découvre, sans diff (maquette, mode « Explorer le repo »).

## Décisions

- Mode exploration = le snapshot d'une ref (HEAD par défaut), sans calque de diff ; mêmes carte, panneaux, recherche.
- Points d'entrée détectés : routes, pages (composants sous `pages/` ou `app/` des frameworks connus), `main`/binaires, jobs, scripts du `package.json`.
- Tracé de flux = impact dans le sens « dépendances » depuis un point d'entrée.
- Métriques : churn (commits qui touchent le fichier ou le span du symbole sur 90 jours), complexité (cyclomatique, par l'adapter), propriétaire (auteur majoritaire), couverture de test (`tested`). Risque = complexité × churn × absence de tests, normalisé.
- Churn, complexité et co-change ne sont pas dans le snapshot (ils dépendent de la date et de l'historique) : cas d'usage `Session::metrics` et `Session::co_change`, résultats jetables dans `.relief/cache/`.
- Couplage logique (fichiers qui changent souvent ensemble) : arêtes `co_change` calculées depuis l'historique, **indépendantes du langage**, donc utiles même sur une codebase sans adapter.
