# Garder l'index de fichier en cache

Status: needs-triage
Type: task
Blocked by: S02
UI: non
Doc: aucune (`docs/bench.md` remis à jour)

Spec: `../spec.md` (Décisions : budgets)

## Contexte

S02 (`docs/bench.md`) : les budgets ne sont pas tenus. À chaud, excalidraw met 1,6 s pour 702 fichiers TS (budget 0,28 s au prorata) et n8n 30 s (10,3 s) ; le diff d'une PR d'environ 50 fichiers prend 3,1 s et 65 s (budget 1 s). Le cache disque garde l'extraction (symboles) mais pas l'index de fichier dont `link` a besoin : chaque snapshot, même à chaud, reparse chaque fichier (environ 1,2 à 2,4 ms par fichier), et `analyse` indexe les deux côtés en entier.

## À faire

- Persister l'index de fichier dans le cache par blob (ou partager un seul parse entre `extract` et `link`), sans changer les résultats ; version du format de cache montée.
- `analyse` ne réindexe pas en entier le côté que la `Session` connaît déjà.
- Relancer `just bench` et mettre `docs/bench.md` à jour.

## Critères d'acceptation

- [ ] `just bench` : indexation à chaud d'excalidraw sous 0,3 s, ou l'écart restant expliqué.
- [ ] Tous les tests existants passent sans changement de résultat.
