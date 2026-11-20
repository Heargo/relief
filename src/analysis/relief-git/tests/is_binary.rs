use relief_git::is_binary;

#[test]
fn empty_input_is_text() {
    assert!(!is_binary(&[]));
}

#[test]
fn plain_text_is_text() {
    assert!(!is_binary(b"export const a = 1;\n"));
}

#[test]
fn nul_byte_at_the_start_is_binary() {
    assert!(is_binary(b"\0abc"));
}

#[test]
fn nul_byte_in_the_middle_is_binary() {
    assert!(is_binary(b"PNG\0data"));
}

#[test]
fn nul_byte_as_the_last_of_the_first_8192_bytes_is_binary() {
    let mut data = vec![b'a'; 8192];
    data[8191] = 0;
    assert!(is_binary(&data));
}

#[test]
fn nul_byte_after_the_first_8192_bytes_is_text() {
    let mut data = vec![b'a'; 8193];
    data[8192] = 0;
    assert!(!is_binary(&data));
}

#[test]
fn long_text_without_nul_is_text() {
    assert!(!is_binary(&vec![b'a'; 20_000]));
}
