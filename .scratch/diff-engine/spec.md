# Spec : moteur de diff (E)

Status: ready-for-agent
Date: 2026-11-18

## But

Comparer deux `GraphSnapshot` (base, head) et produire un `GraphDiff` qui dit ce qui a bougé **structurellement**, puis répondre aux questions du relecteur : qui est impacté, dans quel ordre lire (`docs/product/BRAINSTORM.md`, « Moteur de diff » et « Aides à la relecture » ; maquette).

## Décisions

- `relief-diff` ne dépend que de `relief-model` : fonctions pures sur des snapshots, testées avec `GraphBuilder`. Le lien avec git (plage, stats de lignes, renommages de fichiers, commits) arrive en paramètres.
- `GraphDiff { base, head, nodes: [NodeChange], edges: [EdgeChange], files: [FileChange], commits: [CommitChange] }`.
  - `NodeChange.status` : `added | removed | modified | moved | format_only` ; `modified` porte `body: bool` et `signature: Option<SignatureChange { before, after, breaking, reason }>` ; `moved` porte `from` (ancien id).
  - `EdgeChange.status` : `added | removed`, et `commit` (le commit de la plage qui l'introduit, quand la plage a des commits).
- Un symbole présent des deux côtés avec le même `content_hash` n'est pas modifié, même si son fichier a changé de texte.
- Fichier `format_only` : diff texte non vide, aucun nœud changé dedans.
- Déplacement : un symbole supprimé et un symbole ajouté de même nom et de même `content_hash` (ou un fichier renommé par git) → `moved`, pas `removed` + `added`.
- Signature cassante (`breaking`) : paramètre obligatoire ajouté ou retiré, type d'un paramètre changé, type de retour élargi (union avec `null`/`undefined` ou un nouveau membre), export supprimé ou renommé, visibilité réduite. Compatible : paramètre optionnel ajouté, type de retour restreint, nouveau membre optionnel. La `reason` est une phrase construite depuis la règle appliquée (pas d'IA, ADR 0005).
- Impact : fermeture transitive inverse (appelants) ou directe (dépendances) sur les arêtes `calls | imports | renders | references | http`, profondeur max configurable (8), `http` désactivable. Chaque nœud atteint porte sa profondeur, le chemin (`via`) et `tested` (un symbole de test l'atteint en un saut). Seuls les symboles hors test sont rapportés : les fichiers et les tests ne sont pas des nœuds atteints (les tests servent seulement à `tested`).
- Ordre de lecture : tri topologique (dépendances d'abord), par fichier ou par symbole, départage stable par chemin ; regroupement par commit.
