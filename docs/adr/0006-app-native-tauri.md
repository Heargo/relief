# 0006. App native Tauri, sans serveur HTTP

Status: accepted (2026-11-19, refonte ; remplace l'ADR 0001 pour la diffusion et le transport, et l'ADR 0003 pour les tests de l'UI)

## Contexte

relief s'ouvre aujourd'hui par `relief serve`, qui lance un serveur axum sur `127.0.0.1` et la page dans le navigateur. On veut à la place une application native : `relief <path>` ouvre une fenêtre sur le dépôt passé en paramètre. On veut aussi repartir sur des bases propres plutôt que faire cohabiter deux modes.

Options étudiées :

- **Tauri 2** : le backend est en Rust, dans le même process que le cœur ; l'UI tourne dans la webview du système. L'UI Angular est gardée telle quelle et le binaire reste léger.
- **Electron** : impose Node et un process séparé pour le cœur Rust, et un binaire lourd.
- **UI native (egui, Slint)** : obligerait à réécrire la carte, validée en DOM + SVG.
- **Tauri avec axum sur localhost à l'intérieur** : la migration la plus courte, mais un port ouvert et deux transports pour un seul client.

## Décision

- L'application est une **app Tauri 2**. Le binaire `relief` est la crate `relief-desktop` ; `relief [path] [range]` ouvre une fenêtre sur le dépôt `path` (défaut : dossier courant), sur la plage `range` (défaut : HEAD contre le working tree).
- **Pas de serveur HTTP.** L'UI appelle le cœur par l'IPC de Tauri (`invoke`), sur des commandes qui délèguent aux cas d'usage de `relief-app` (ADR 0008). `relief-server`, axum, `rust-embed` et `relief serve` disparaissent.
- **Un seul client d'API côté UI** : `ReliefApiService` appelle les commandes Tauri. Pas d'interface à une seule implémentation ; les tests mockent ce service comme aujourd'hui.
- **Le contrat reste généré** : les commandes renvoient les types de `relief-model`, dont le JSON Schema (`docs/contract/`) et les types TS sont générés comme avant. `tauri-specta`, qui générerait aussi les appels, est écarté tant qu'il n'a pas de version stable.
- **Une erreur de commande** a la forme `ApiError { code, message }` : `relief-app` renvoie une `AppError`, la commande la convertit.
- **Sécurité** : les capabilities Tauri n'exposent que les commandes de relief (aucun plugin shell, fs ou http) ; CSP stricte ; aucun chemin reçu de l'UI ne sert à lire le disque hors du dépôt ouvert.
- **Tests de l'UI de bout en bout** : WebdriverIO et `tauri-driver`, sur la vraie app et la fixture acme-shop. Ils remplacent Playwright, qui ne pilote pas la webview de Tauri. Les captures de la doc utilisateur passent par le même outil.
- **Développement** : `tauri dev` charge `ng serve` dans la fenêtre native, avec le rechargement à chaud.

Hors de cette décision, reportés : l'intégration au terminal et au système (sous-commandes sans interface `show`, `diff`, `check` ; détachement du terminal ; une seule instance pour plusieurs fenêtres ; paquets `.deb`, AppImage, `.dmg`, `.msi`). Un adapter MCP ou VS Code s'ajoutera le jour venu dans `src/interfaces/`, au-dessus de `relief-app`.

## Conséquences

- Sous Linux, l'app a besoin de `webkit2gtk-4.1` à l'exécution, et les tests e2e de `WebKitWebDriver`. `tauri-driver` ne marche pas sous macOS : les tests e2e tournent sous Linux (et Windows).
- La vérification d'un ticket d'UI ne passe plus par le navigateur de l'agent : elle passe par les e2e et leurs captures (`docs/dev/workflow.md`, étape 7).
- La doc utilisateur est embarquée dans l'app et s'ouvre dans une fenêtre, hors ligne. Elle reste publiable seule (ADR 0004).
- Chaque process `relief` ouvre un seul dépôt, dans une seule fenêtre.
