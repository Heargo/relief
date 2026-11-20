# Contrat JSON

`snapshot.schema.json` (`GraphSnapshot`), `diff.schema.json` (`GraphDiff`) et les schémas des réponses de l’API (`snapshot-response`, `diff-response`, `meta-response`, `api-error`) décrivent le JSON que le cœur Rust sérialise. Ils sont générés depuis les types de `relief-model` (`schemars`, module `relief_model::contract`) : on ne les édite jamais à la main.

`src/ui/src/app/core/models/contract.ts` en est généré à son tour (`json-schema-to-typescript`, version épinglée dans `src/ui/package.json`) : c'est le type que l'UI utilise pour ce que renvoie l'API.

## Régénérer

```
just contract
```

Après toute modification d'un type sérialisé de `relief-model`. La recette écrit les schémas, puis `contract.ts` (formaté par Prettier ; relancer la recette ne change rien). Le test `src/domain/relief-model/tests/contract.rs` échoue, avec le message « run `just contract` », si les schémas commités ne correspondent plus aux types Rust.

## Périmètre

Seuls les types sérialisés qui existent y figurent. Les réponses des commandes Tauri (`SnapshotResponse`, `DiffResponse`, `MetaResponse`, `ApiError`, avec `SnapshotMeta`, `FileRename` et `FormatOnlySummary`) y sont ; les futures réponses (impact) y entreront avec le ticket qui les expose.
