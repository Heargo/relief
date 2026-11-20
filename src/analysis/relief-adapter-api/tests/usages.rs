//! Ticket U20, seam 1: the optional `usages` capability of `LanguageAdapter`.
//!
//! Expected contract: `LanguageAdapter::usages(&self, path: &str, bytes: &[u8], bindings:
//! &[String]) -> Option<Vec<Usage>>`, `None` meaning "not supported by this adapter" (the
//! default). `Usage { binding: String, line: u32 (1-based), column: u32 (0-based char offset in
//! `snippet`), snippet: String (the source line, no line terminator), enclosing: Option<String> }`.

use relief_adapter_api::{Extraction, LanguageAdapter};
use relief_model::Node;

struct Bare;

impl LanguageAdapter for Bare {
    fn name(&self) -> &str {
        "bare"
    }
    fn handles(&self, _lang: &str) -> bool {
        true
    }
    fn extract(&self, _file: &Node, _bytes: &[u8]) -> Extraction {
        Extraction::default()
    }
}

#[test]
fn an_adapter_without_usages_answers_not_supported() {
    let got = Bare.usages("a.py", b"import a\na()\n", &["a".to_owned()]);
    assert_eq!(got, None);
}
