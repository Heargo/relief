# Spec : autres langages (L)

Status: ready-for-agent
Date: 2026-11-18

## But

Valider que le modèle et le contrat `LanguageAdapter` tiennent pour un second langage (`docs/product/BRAINSTORM.md`, roadmap v2), sans toucher au moteur de diff, à `relief-app` ni à l'UI (hors l'enregistrement de l'adapter dans la composition root).

## Décisions

- Second langage : **Python** (le plus courant après TS dans les dépôts visés ; Go ensuite).
- Même structure que `relief-lang-ts` : requêtes `.scm`, `index_file`, comparateur de signatures ; detector `pyproject.toml` (Poetry, uv, setuptools) pour les packages.
- Si le moteur de diff ou l'UI doit changer pour Python, c'est un défaut du contrat : le corriger dans le contrat, pas par un cas particulier.
