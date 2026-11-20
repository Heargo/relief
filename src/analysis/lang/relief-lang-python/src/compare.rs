//! Verdict on a change between two normalised Python signatures.

use relief_model::{SignatureReason, SignatureVerdict};

struct Param {
    name: String,
    optional: bool,
    ty: String,
}

struct Parsed {
    params: Vec<Param>,
    ret: String,
}

fn verdict(breaking: bool, reason: SignatureReason) -> SignatureVerdict {
    SignatureVerdict {
        breaking,
        reason,
        equivalent: false,
    }
}

fn equivalent() -> SignatureVerdict {
    SignatureVerdict {
        breaking: false,
        reason: SignatureReason::Unspecified,
        equivalent: true,
    }
}

pub(crate) fn compare(before: &str, after: &str) -> SignatureVerdict {
    if before == after {
        return equivalent();
    }
    if before.starts_with("class ") || after.starts_with("class ") {
        return verdict(true, SignatureReason::Unspecified);
    }
    let (b, a) = (parse(before), parse(after));
    let mut added_optional = false;
    for p in &a.params {
        match b.params.iter().find(|old| old.name == p.name) {
            None if p.optional => added_optional = true,
            None => {
                return verdict(
                    true,
                    SignatureReason::ParamRequiredAdded {
                        param: p.name.clone(),
                    },
                );
            }
            Some(old) if old.ty != p.ty => {
                return verdict(
                    true,
                    SignatureReason::ParamTypeChanged {
                        param: p.name.clone(),
                    },
                );
            }
            Some(old) if old.optional && !p.optional => {
                return verdict(
                    true,
                    SignatureReason::ParamBecameRequired {
                        param: p.name.clone(),
                    },
                );
            }
            Some(_) => {}
        }
    }
    if b.params
        .iter()
        .any(|old| !a.params.iter().any(|p| p.name == old.name))
    {
        return verdict(true, SignatureReason::ParamRemoved);
    }
    if added_optional {
        return verdict(false, SignatureReason::ParamOptionalAdded);
    }
    if b.ret != a.ret {
        let (wb, wa) = (words(&b.ret), words(&a.ret));
        let gained = |w: &str| wa.contains(&w) && !wb.contains(&w);
        if gained("None") || gained("Optional") {
            return verdict(true, SignatureReason::ReturnWidenedNull);
        }
        let superset = wb.iter().all(|w| wa.contains(w));
        let subset = wa.iter().all(|w| wb.contains(w));
        return match (superset, subset) {
            (true, false) => verdict(true, SignatureReason::ReturnWidened),
            (false, true) => verdict(false, SignatureReason::ReturnNarrowed),
            _ => verdict(true, SignatureReason::ReturnChanged),
        };
    }
    equivalent()
}

fn words(s: &str) -> Vec<&str> {
    s.split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|w| !w.is_empty())
        .collect()
}

fn parse(sig: &str) -> Parsed {
    let open = sig.find('(').unwrap_or(sig.len());
    let rest = sig.get(open + 1..).unwrap_or("");
    let (inside, tail) = split_params(rest);
    let params = split_top(inside, ',')
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty() && !matches!(*p, "*" | "/"))
        .map(parse_param)
        .collect();
    let ret = tail
        .trim()
        .strip_prefix("->")
        .unwrap_or("")
        .trim()
        .to_owned();
    Parsed { params, ret }
}

/// Splits `rest` (text after the opening parenthesis) at the matching `)`.
fn split_params(rest: &str) -> (&str, &str) {
    let mut depth = 0usize;
    let mut quote: Option<char> = None;
    for (i, c) in rest.char_indices() {
        if let Some(q) = quote {
            if c == q {
                quote = None;
            }
            continue;
        }
        match c {
            '"' | '\'' => quote = Some(c),
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' if depth == 0 => return (&rest[..i], &rest[i + 1..]),
            ')' | ']' | '}' => depth -= 1,
            _ => {}
        }
    }
    (rest, "")
}

/// Splits at the top-level occurrences of `sep` (outside brackets and strings).
fn split_top(s: &str, sep: char) -> Vec<&str> {
    let mut out = Vec::new();
    let (mut depth, mut start) = (0i32, 0);
    let mut quote: Option<char> = None;
    for (i, c) in s.char_indices() {
        if let Some(q) = quote {
            if c == q {
                quote = None;
            }
            continue;
        }
        match c {
            '"' | '\'' => quote = Some(c),
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            c if c == sep && depth == 0 => {
                out.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    out.push(&s[start..]);
    out
}

fn parse_param(p: &str) -> Param {
    let (decl, default) = match split_top(p, '=').as_slice() {
        [d, ..] if d.len() < p.len() => (d.trim(), true),
        _ => (p, false),
    };
    let (name, ty) = match split_top(decl, ':').as_slice() {
        [n, ..] if n.len() < decl.len() => (n.trim(), decl[n.len() + 1..].trim()),
        _ => (decl, ""),
    };
    Param {
        optional: default || name.starts_with('*'),
        name: name.to_owned(),
        ty: ty.to_owned(),
    }
}
