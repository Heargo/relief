# U30 Arêtes agrégées au niveau affiché

Status: ready-for-agent
Type: task
Blocked by: aucun
UI: oui
Doc: docs/user `map` (arêtes)

Spec: `../../review-ui/spec.md` (Phase 14)

## Constat

Quand une boîte de fichier est ouverte et montre ses symboles, les arêtes partent des symboles : un fichier qui importe 6 helpers trace 6 traits. Sur la capture, ~300 traits pour ~30 paires de fichiers.

## Comportement

- Par défaut, les arêtes sont agrégées au niveau du **fichier** (la boîte de fichier visible la plus profonde), même quand ses symboles sont affichés ; le compteur de l'arête agrégée dit combien de liens elle porte.
- Les arêtes au niveau symbole s'affichent pour le nœud sélectionné ou survolé (fichier ou symbole) : ses arêtes sont dépliées jusqu'à ses symboles.
- L'inspecteur d'arête liste toujours les liens symbole à symbole (U20) : rien n'est perdu.

## Critères d'acceptation

- [ ] Logique : agrégation au niveau fichier quand les symboles sont visibles ; dépliage pour un nœud donné.
- [ ] e2e acme-shop au niveau Symboles : le nombre d'arêtes de la scène est celui des paires de fichiers ; sélectionner un fichier fait apparaître les arêtes de ses symboles.
- [ ] Doc `map` FR/EN.
