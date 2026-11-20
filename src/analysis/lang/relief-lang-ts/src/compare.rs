//! Verdict on a change between two normalised TypeScript signatures.

use relief_model::{SignatureReason, SignatureVerdict};

struct Param {
    name: String,
    optional: bool,
    ty: String,
}

struct Parsed {
    exported: bool,
    restricted: bool,
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

pub(crate) fn compare(before: &str, after: &str) -> SignatureVerdict {
    let (b, a) = (parse(before), parse(after));
    if b.exported && !a.exported {
        return verdict(true, SignatureReason::ExportRemoved);
    }
    if !b.restricted && a.restricted {
        return verdict(true, SignatureReason::VisibilityReduced);
    }
    if !before.contains('(') && !after.contains('(') {
        return equivalent();
    }
    for (i, p) in a.params.iter().enumerate() {
        match b.params.get(i) {
            None if p.optional => {}
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
    if b.params.len() > a.params.len() {
        return verdict(true, SignatureReason::ParamRemoved);
    }
    if a.params.len() > b.params.len() {
        return verdict(false, SignatureReason::ParamOptionalAdded);
    }
    if b.ret != a.ret {
        let (wb, wa) = (words(&b.ret), words(&a.ret));
        let gained = |w: &str| wa.contains(&w) && !wb.contains(&w);
        if gained("null") {
            return verdict(true, SignatureReason::ReturnWidenedNull);
        }
        if gained("undefined") {
            return verdict(true, SignatureReason::ReturnWidenedUndefined);
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

fn equivalent() -> SignatureVerdict {
    SignatureVerdict {
        breaking: false,
        reason: SignatureReason::Unspecified,
        equivalent: true,
    }
}

fn words(s: &str) -> Vec<&str> {
    s.split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|w| !w.is_empty())
        .collect()
}

fn parse(sig: &str) -> Parsed {
    let open = sig.find('(').unwrap_or(sig.len());
    let prefix = &sig[..open];
    let mut exported = false;
    let mut restricted = false;
    for w in prefix.split_whitespace() {
        exported |= w == "export";
        restricted |= matches!(w, "private" | "protected") || w.starts_with('#');
    }
    let name = prefix.split_whitespace().last().unwrap_or("");
    restricted |= name.starts_with('#');
    let rest = sig.get(open + 1..).unwrap_or("");
    let (inside, tail) = split_params(rest);
    let params = split_top(inside, ',')
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .map(parse_param)
        .collect();
    let tail = tail.trim();
    let tail = tail.strip_suffix("=>").unwrap_or(tail).trim();
    let ret = tail.strip_prefix(':').unwrap_or("").trim().to_owned();
    Parsed {
        exported,
        restricted,
        params,
        ret,
    }
}

/// Splits `rest` (text after the opening parenthesis) at the matching `)`.
fn split_params(rest: &str) -> (&str, &str) {
    let mut depth = 0usize;
    for (i, c) in rest.char_indices() {
        match c {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' if depth == 0 => return (&rest[..i], &rest[i + 1..]),
            ')' | ']' | '}' => depth -= 1,
            _ => {}
        }
    }
    (rest, "")
}

fn split_top(s: &str, sep: char) -> Vec<&str> {
    let mut out = Vec::new();
    let (mut depth, mut start, mut prev) = (0i32, 0, ' ');
    for (i, c) in s.char_indices() {
        match c {
            '(' | '[' | '{' | '<' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            '>' if prev != '=' => depth -= 1,
            c if c == sep && depth == 0 => {
                out.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
        prev = c;
    }
    out.push(&s[start..]);
    out
}

fn parse_param(p: &str) -> Param {
    let (decl, default) = match split_top(p, '=').as_slice() {
        [d, ..] if d.len() < p.len() && !p[d.len()..].starts_with("=>") => (d.trim(), true),
        _ => (p, false),
    };
    let (name, ty) = match split_top(decl, ':').as_slice() {
        [n, ..] if n.len() < decl.len() => (n.trim(), decl[n.len() + 1..].trim()),
        _ => (decl, ""),
    };
    // A destructuring pattern is an implementation detail: only its type counts.
    let name = if name.starts_with(['{', '[']) {
        ""
    } else {
        name
    };
    Param {
        optional: default || name.ends_with('?'),
        name: name.trim_end_matches('?').to_owned(),
        ty: ty.to_owned(),
    }
}
