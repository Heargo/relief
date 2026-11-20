//! Seam 1: the TypeScript signature comparator, exposed by the adapter
//! contract (`LanguageAdapter::compare_signatures`), on normalised signature
//! texts as `index_file` produces them. No git.
//!
//! Expected shape (to be implemented by green):
//! `fn compare_signatures(&self, before: &str, after: &str) -> relief_model::SignatureVerdict`
//! with `SignatureVerdict { breaking: bool, reason: relief_model::SignatureReason }`.

use relief_adapter_api::LanguageAdapter;
use relief_lang_ts::TsAdapter;
use relief_model::SignatureReason;

fn verdict(before: &str, after: &str) -> (bool, SignatureReason) {
    let v = TsAdapter::new().compare_signatures(before, after);
    (v.breaking, v.reason)
}

#[test]
fn return_type_widened_to_null_is_breaking() {
    assert_eq!(
        verdict(
            "async refresh(token: string): Promise<Session>",
            "async refresh(token: string): Promise<Session | null>"
        ),
        (true, SignatureReason::ReturnWidenedNull)
    );
}

#[test]
fn return_type_widened_to_undefined_is_breaking() {
    assert_eq!(
        verdict(
            "export function find(id: string): User",
            "export function find(id: string): User | undefined",
        ),
        (true, SignatureReason::ReturnWidenedUndefined)
    );
}

#[test]
fn optional_parameter_added_is_compatible() {
    assert_eq!(
        verdict(
            "export function computeTotal(lines: InvoiceLine[]): Money",
            "export function computeTotal(lines: InvoiceLine[], discount?: DiscountCode): Money"
        ),
        (false, SignatureReason::ParamOptionalAdded)
    );
}

#[test]
fn required_parameter_added_is_breaking() {
    assert_eq!(
        verdict(
            "export function total(a: number): number",
            "export function total(a: number, b: number): number",
        ),
        (
            true,
            SignatureReason::ParamRequiredAdded {
                param: "b".to_owned()
            }
        )
    );
}

#[test]
fn required_parameter_removed_is_breaking() {
    assert_eq!(
        verdict(
            "export function total(a: number, b: number): number",
            "export function total(a: number): number",
        ),
        (true, SignatureReason::ParamRemoved)
    );
}

#[test]
fn parameter_type_changed_is_breaking() {
    assert_eq!(
        verdict(
            "export function total(a: number): number",
            "export function total(a: string): number",
        ),
        (
            true,
            SignatureReason::ParamTypeChanged {
                param: "a".to_owned()
            }
        )
    );
}

#[test]
fn export_removed_is_breaking() {
    assert_eq!(
        verdict(
            "export function total(a: number): number",
            "function total(a: number): number",
        ),
        (true, SignatureReason::ExportRemoved)
    );
}

#[test]
fn visibility_reduced_is_breaking() {
    assert_eq!(
        verdict(
            "refresh(token: string): Session",
            "private refresh(token: string): Session",
        ),
        (true, SignatureReason::VisibilityReduced)
    );
}

#[test]
fn return_type_narrowed_is_compatible() {
    assert_eq!(
        verdict(
            "export function load(id: string): Promise<Session | null>",
            "export function load(id: string): Promise<Session>",
        ),
        (false, SignatureReason::ReturnNarrowed)
    );
}

#[test]
fn parameter_made_required_names_the_parameter() {
    assert_eq!(
        verdict(
            "export function total(a: number, b?: number): number",
            "export function total(a: number, b: number): number",
        ),
        (
            true,
            SignatureReason::ParamBecameRequired {
                param: "b".to_owned()
            }
        )
    );
}

#[test]
fn return_type_widened_without_null_is_breaking() {
    assert_eq!(
        verdict("export function f(): A", "export function f(): A | B",),
        (true, SignatureReason::ReturnWidened)
    );
}

#[test]
fn return_type_replaced_is_breaking() {
    assert_eq!(
        verdict("export function f(): A", "export function f(): B",),
        (true, SignatureReason::ReturnChanged)
    );
}
