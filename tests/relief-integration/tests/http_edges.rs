//! Seam 1 and 2: `http` edges between client calls and server routes,
//! through `TsAdapter` registered in `relief_index::Indexer`.
//!
//! Expected shape of the contract (to be implemented by green):
//! - `relief_model::Node.route: Option<String>` (`"POST /checkout"`), set on
//!   the handler symbol of a route declaration, whose `subkind` is `route`;
//! - `relief_model::Edge.heuristic: bool`, true when the verb of the client
//!   call is unknown (wrapper whose name carries no verb).
//!
//! Literal sources are committed to a throwaway repository; acme-shop is the
//! real fixture.

use std::fs;
use std::path::Path;
use std::process::Command;

use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::{IndexedSnapshot, Indexer};
use relief_lang_ts::TsAdapter;
use relief_model::{EdgeKind, Node, Precision};
use tempfile::TempDir;

fn git(repo: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Fixture")
        .env("GIT_AUTHOR_EMAIL", "fixture@relief.invalid")
        .env("GIT_COMMITTER_NAME", "Fixture")
        .env("GIT_COMMITTER_EMAIL", "fixture@relief.invalid")
        .env("GIT_AUTHOR_DATE", "2024-05-06T07:08:09 +0000")
        .env("GIT_COMMITTER_DATE", "2024-05-06T07:08:09 +0000")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}");
}

fn index_files(dir: &Path, files: &[(&str, &str)], cache: Option<&Path>) -> IndexedSnapshot {
    if !dir.join(".git").exists() {
        git(dir, &["init", "-q", "-b", "main"]);
        git(dir, &["config", "commit.gpgsign", "false"]);
        for (path, text) in files {
            let full = dir.join(path);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, text).unwrap();
        }
        git(dir, &["add", "-A"]);
        git(dir, &["commit", "-q", "-m", "init"]);
    }
    let source = GitSource::open(dir).unwrap();
    let commit = source.resolve("HEAD").unwrap();
    let mut indexer = Indexer::new("literal")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()));
    if let Some(cache) = cache {
        indexer = indexer.with_cache(cache);
    }
    indexer.snapshot(&source, &commit).unwrap()
}

fn literal(files: &[(&str, &str)]) -> (IndexedSnapshot, TempDir) {
    let dir = TempDir::new().unwrap();
    let indexed = index_files(dir.path(), files, None);
    (indexed, dir)
}

fn index_acme(rev: &str, dir: &Path) -> IndexedSnapshot {
    Fixture::load("acme-shop").unwrap().build(dir).unwrap();
    let source = GitSource::open(dir).unwrap();
    let commit = source.resolve(rev).unwrap();
    Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(&source, &commit)
        .unwrap()
}

/// `<file path>::sym:<symbol>`, the node id without its package prefix.
fn short(id: &str) -> String {
    id.split_once("::file:")
        .map_or(id.to_owned(), |(_, rest)| rest.to_owned())
}

/// `(from, to, heuristic)` of every `http` edge, sorted.
fn http_edges(indexed: &IndexedSnapshot) -> Vec<(String, String, bool)> {
    let mut edges: Vec<_> = indexed
        .graph
        .edges()
        .iter()
        .filter(|e| e.kind == EdgeKind::Http)
        .map(|e| {
            assert_eq!(e.precision, Precision::Syntactic);
            (
                short(&e.from.to_string()),
                short(&e.to.to_string()),
                e.heuristic,
            )
        })
        .collect();
    edges.sort();
    edges
}

fn e(from: &str, to: &str, heuristic: bool) -> (String, String, bool) {
    (from.to_owned(), to.to_owned(), heuristic)
}

fn symbol<'a>(indexed: &'a IndexedSnapshot, suffix: &str) -> &'a Node {
    indexed
        .graph
        .nodes()
        .iter()
        .find(|n| n.id.to_string().ends_with(suffix))
        .unwrap_or_else(|| panic!("no node ending with {suffix}"))
}

const SERVER: &str = "export function checkoutHandler() { return 1; }\n\
    export function register(app: any) {\n  app.post(\"/checkout\", checkoutHandler);\n}\n";

#[test]
fn a_fastify_route_marks_its_handler_as_a_route() {
    let (indexed, _dir) = literal(&[(
        "api/routes.ts",
        "async function getInvoice() { return 1; }\n\
         export function register(app: any) {\n  app.get(\"/invoices/:id\", getInvoice);\n}\n",
    )]);

    let handler = symbol(&indexed, "::sym:getInvoice");

    assert_eq!(handler.subkind, "route");
    assert_eq!(handler.route.as_deref(), Some("GET /invoices/:id"));
    assert_eq!(symbol(&indexed, "::sym:register").subkind, "function");
}

#[test]
fn an_express_router_route_with_options_marks_its_handler() {
    let (indexed, _dir) = literal(&[(
        "api/routes.ts",
        "function removeItem() {}\nfunction requireAuth() {}\n\
         export function register(router: any) {\n  \
         router.delete(\"/items/:id\", { preHandler: requireAuth }, removeItem);\n}\n",
    )]);

    let handler = symbol(&indexed, "::sym:removeItem");

    assert_eq!(handler.subkind, "route");
    assert_eq!(handler.route.as_deref(), Some("DELETE /items/:id"));
    assert_eq!(symbol(&indexed, "::sym:requireAuth").subkind, "function");
}

#[test]
fn every_server_verb_is_recognised() {
    let (indexed, _dir) = literal(&[(
        "api/routes.ts",
        "function a() {}\nfunction b() {}\nfunction c() {}\nfunction d() {}\nfunction f() {}\n\
         export function register(app: any) {\n  app.get(\"/a\", a);\n  app.post(\"/b\", b);\n  \
         app.put(\"/c\", c);\n  app.patch(\"/d\", d);\n  app.delete(\"/f\", f);\n}\n",
    )]);

    let routes: Vec<_> = ["a", "b", "c", "d", "f"]
        .iter()
        .map(|n| symbol(&indexed, &format!("::sym:{n}")).route.clone())
        .collect();

    assert_eq!(
        routes,
        [
            Some("GET /a".to_owned()),
            Some("POST /b".to_owned()),
            Some("PUT /c".to_owned()),
            Some("PATCH /d".to_owned()),
            Some("DELETE /f".to_owned()),
        ]
    );
}

#[test]
fn a_route_with_a_variable_path_is_not_a_route() {
    let (indexed, _dir) = literal(&[(
        "api/routes.ts",
        "function h() {}\n\
         export function register(app: any, path: string) {\n  app.get(path, h);\n}\n",
    )]);

    let handler = symbol(&indexed, "::sym:h");

    assert_eq!(handler.subkind, "function");
    assert_eq!(handler.route, None);
}

#[test]
fn fetch_with_a_method_links_to_the_route_with_that_verb() {
    let (indexed, _dir) = literal(&[
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "export function submit() {\n  \
             return fetch(\"/checkout\", { method: \"POST\" });\n}\n",
        ),
    ]);

    assert_eq!(
        http_edges(&indexed),
        [e(
            "web/client.ts::sym:submit",
            "api/routes.ts::sym:checkoutHandler",
            false
        )]
    );
}

#[test]
fn fetch_without_a_method_is_a_get() {
    let (indexed, _dir) = literal(&[
        (
            "api/routes.ts",
            "function list() {}\nfunction create() {}\n\
             export function register(app: any) {\n  app.get(\"/items\", list);\n  \
             app.post(\"/items\", create);\n}\n",
        ),
        (
            "web/client.ts",
            "export function load() {\n  return fetch(\"/items\");\n}\n",
        ),
    ]);

    assert_eq!(
        http_edges(&indexed),
        [e(
            "web/client.ts::sym:load",
            "api/routes.ts::sym:list",
            false
        )]
    );
}

#[test]
fn a_verb_mismatch_gives_no_edge() {
    let (indexed, _dir) = literal(&[
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "export function load() {\n  return fetch(\"/checkout\", { method: \"GET\" });\n}\n",
        ),
    ]);

    assert_eq!(http_edges(&indexed), []);
}

#[test]
fn fetch_of_a_variable_gives_no_edge() {
    let (indexed, _dir) = literal(&[
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "export function submit(url: string) {\n  \
             return fetch(url, { method: \"POST\" });\n}\n\
             export function other() {\n  const target = \"/checkout\";\n  \
             return fetch(target, { method: \"POST\" });\n}\n",
        ),
    ]);

    assert_eq!(http_edges(&indexed), []);
}

#[test]
fn a_wrapper_named_after_a_verb_takes_its_verb_from_the_name() {
    let (indexed, _dir) = literal(&[
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "declare function httpPost(path: string, body: unknown): Promise<unknown>;\n\
             declare function httpGet(path: string): Promise<unknown>;\n\
             export function pay() {\n  return httpPost(\"/checkout\", {});\n}\n\
             export function peek() {\n  return httpGet(\"/checkout\");\n}\n",
        ),
    ]);

    assert_eq!(
        http_edges(&indexed),
        [e(
            "web/client.ts::sym:pay",
            "api/routes.ts::sym:checkoutHandler",
            false
        )]
    );
}

#[test]
fn route_params_and_template_substitutions_are_wildcards() {
    let (indexed, _dir) = literal(&[
        (
            "api/routes.ts",
            "function getInvoice() {}\n\
             export function register(app: any) {\n  app.get(\"/invoices/:id\", getInvoice);\n}\n",
        ),
        (
            "web/client.ts",
            "declare function httpGet(path: string): Promise<unknown>;\n\
             export function byTemplate(id: string) {\n  return httpGet(`/invoices/${id}`);\n}\n\
             export function byLiteral() {\n  return httpGet(\"/invoices/42\");\n}\n\
             export function tooDeep() {\n  return httpGet(\"/invoices/42/lines\");\n}\n",
        ),
    ]);

    assert_eq!(
        http_edges(&indexed),
        [
            e(
                "web/client.ts::sym:byLiteral",
                "api/routes.ts::sym:getInvoice",
                false
            ),
            e(
                "web/client.ts::sym:byTemplate",
                "api/routes.ts::sym:getInvoice",
                false
            ),
        ]
    );
}

#[test]
fn a_wrapper_with_an_unknown_verb_keeps_the_match_as_heuristic() {
    let (indexed, _dir) = literal(&[
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "declare function sendRequest(path: string): Promise<unknown>;\n\
             export function go() {\n  return sendRequest(\"/checkout\");\n}\n",
        ),
    ]);

    assert_eq!(
        http_edges(&indexed),
        [e(
            "web/client.ts::sym:go",
            "api/routes.ts::sym:checkoutHandler",
            true
        )]
    );
}

#[test]
fn a_function_whose_name_has_no_http_word_is_not_a_wrapper() {
    let (indexed, _dir) = literal(&[
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "declare function load(path: string): Promise<unknown>;\n\
             export function go() {\n  return load(\"/checkout\");\n}\n",
        ),
    ]);

    assert_eq!(http_edges(&indexed), []);
}

#[test]
fn a_wrapper_whose_first_argument_is_not_an_absolute_path_gives_no_edge() {
    let (indexed, _dir) = literal(&[
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "declare function httpPost(path: string): Promise<unknown>;\n\
             export function relative() {\n  return httpPost(\"checkout\");\n}\n\
             export function variable(p: string) {\n  return httpPost(p);\n}\n",
        ),
    ]);

    assert_eq!(http_edges(&indexed), []);
}

#[test]
fn a_call_to_an_unknown_path_gives_no_edge() {
    let (indexed, _dir) = literal(&[
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "export function go() {\n  return fetch(\"/nowhere\", { method: \"POST\" });\n}\n",
        ),
    ]);

    assert_eq!(http_edges(&indexed), []);
}

#[test]
fn routes_and_http_edges_survive_the_cache() {
    let dir = TempDir::new().unwrap();
    let cache = TempDir::new().unwrap();
    let files = [
        ("api/routes.ts", SERVER),
        (
            "web/client.ts",
            "export function submit() {\n  return fetch(\"/checkout\", { method: \"POST\" });\n}\n",
        ),
    ];

    let cold = index_files(dir.path(), &files, Some(cache.path()));
    let warm = index_files(dir.path(), &files, Some(cache.path()));

    assert_eq!(cold.graph, warm.graph);
    assert_eq!(http_edges(&warm).len(), 1);
    assert_eq!(
        symbol(&warm, "::sym:checkoutHandler").route.as_deref(),
        Some("POST /checkout")
    );
}

#[test]
fn acme_head_links_the_web_clients_to_the_api_routes() {
    let dir = TempDir::new().unwrap();
    let indexed = index_acme("feat/promo-codes", dir.path());
    indexed.graph.validate().unwrap();

    assert_eq!(
        http_edges(&indexed),
        [
            e(
                "apps/web/components/PromoCodeInput.tsx::sym:PromoCodeInput",
                "apps/api/routes/checkout.ts::sym:postPromoValidate",
                false
            ),
            e(
                "apps/web/hooks/useInvoice.ts::sym:useInvoice",
                "apps/api/routes/invoices.ts::sym:getInvoice",
                false
            ),
            e(
                "apps/web/pages/Checkout.tsx::sym:useCheckoutTotals",
                "apps/api/routes/checkout.ts::sym:postCheckout",
                false
            ),
        ]
    );
}

#[test]
fn acme_base_has_no_edge_to_the_promo_route() {
    let dir = TempDir::new().unwrap();
    let indexed = index_acme("main", dir.path());

    assert_eq!(
        http_edges(&indexed),
        [
            e(
                "apps/web/hooks/useInvoice.ts::sym:useInvoice",
                "apps/api/routes/invoices.ts::sym:getInvoice",
                false
            ),
            e(
                "apps/web/pages/Checkout.tsx::sym:useCheckoutTotals",
                "apps/api/routes/checkout.ts::sym:postCheckout",
                false
            ),
        ]
    );
}

#[test]
fn acme_route_handlers_carry_their_route() {
    let dir = TempDir::new().unwrap();
    let indexed = index_acme("feat/promo-codes", dir.path());

    let routes: Vec<_> = [
        "apps/api/routes/invoices.ts::sym:getInvoice",
        "apps/api/routes/invoices.ts::sym:listInvoices",
        "apps/api/routes/checkout.ts::sym:postCheckout",
        "apps/api/routes/checkout.ts::sym:postPromoValidate",
    ]
    .iter()
    .map(|suffix| {
        let node = symbol(&indexed, suffix);
        (node.subkind.clone(), node.route.clone())
    })
    .collect();

    let route = |r: &str| ("route".to_owned(), Some(r.to_owned()));
    assert_eq!(
        routes,
        [
            route("GET /invoices/:id"),
            route("GET /invoices"),
            route("POST /checkout"),
            route("POST /promo/validate"),
        ]
    );
}
