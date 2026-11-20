# Spec : index (I)

Status: ready-for-agent
Date: 2026-11-18

## But

Construire le `GraphSnapshot` d'un commit (réel ou virtuel) en appliquant detectors et adapters à son arbre, vite, et sans tout reparser à chaque fois.

## Décisions

- `Indexer::snapshot(source, commit) -> GraphSnapshot` : arbre git → detectors (structure haute) → adapters par langage (structure basse) → résolution entre fichiers → validation.
- Les adapters sont enregistrés par extension ; un fichier sans adapter reste un nœud `file` sans symboles (c'est le mode « n'importe quelle codebase »).
- Cache : `FileIndex` par `(hash du blob, nom + version de l'adapter)` dans `<racine du dépôt>/.relief/cache/index.sqlite` (`rusqlite`, ADR 0007 ; repli hors du dépôt pour un dépôt bare ou en lecture seule). Le cache est jetable : supprimé ou corrompu, il est reconstruit sans erreur. `RELIEF_CACHE_DIR` le déplace (tests).
- Parsing des fichiers en parallèle (`rayon`).
