fn main() {
    // Only relief's own commands exist for the window: each one gets an
    // `allow-<command>` permission that `capabilities/main.json` grants.
    let manifest = tauri_build::AppManifest::new().commands(&[
        "meta",
        "snapshot",
        "diff",
        "search",
        "review_summary",
        "rules",
        "impact",
        "code",
        "edge_usages",
        "review_state",
        "set_review_state",
        "settings",
        "set_settings",
        "reading_order",
        "commit_reading",
        "log",
        "metrics",
        "co_change",
        "open_docs",
        "open_repo",
        "recents",
        "open_workspace",
        "create_workspace",
        "open_repo_as_workspace",
        "add_workspace_repo",
        "workspace_labels",
        "set_workspace_repo_labels",
        "workspace_comparisons",
        "set_workspace_repo_comparison",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run the tauri build script");
}
