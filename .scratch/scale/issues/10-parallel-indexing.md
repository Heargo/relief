# S10 Indexation parallèle

Status: needs-triage
Type: task
Blocked by: S04
UI: non
Doc: aucune (`docs/bench.md` remis à jour)

Spec: `../spec.md` (Décisions : budgets)

## Constat

S02 : l'indexation est mono-thread (Ryzen 7700X, 16 threads) ; n8n met 54 s à froid et 30 s à chaud. Le parse et l'extraction d'un fichier ne dépendent d'aucun autre fichier.

## À faire

- Parser et extraire les fichiers en parallèle (`rayon`), lecture des blobs comprise ; résolution des liens en parallèle par fichier, l'assemblage du graphe restant séquentiel et déterministe (ordre des nœuds et des arêtes inchangé).
- Le cache par blob accepte les écritures concurrentes (ou un seul écrivain qui reçoit les résultats).
- Relancer `just bench` et mettre `docs/bench.md` à jour.

## Critères d'acceptation

- [ ] `just bench` : ouverture à froid de n8n au moins 3 fois plus rapide que la mesure de S02.
- [ ] Deux indexations du même commit produisent le même graphe, octet pour octet (test sur acme-shop et `wide`).
- [ ] Tous les tests existants passent sans changement de résultat.
