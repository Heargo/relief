#!/usr/bin/env bash
# Checks the Linux packages in target/release/bundle/ (no dpkg needed). Run after `just package`.
set -uo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
bundle="$root/target/release/bundle"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
ko() { echo "FAIL: $*" >&2; fail=1; }
ok() { echo "ok: $*"; }

version=$(sed -n '/^\[workspace.package\]/,/^\[/{s/^version *= *"\(.*\)"/\1/p}' "$root/Cargo.toml" | head -1)
[ -n "$version" ] || { echo "FAIL: workspace version not found in Cargo.toml" >&2; exit 2; }

# 1. .deb control
deb=$(ls "$bundle"/deb/*.deb 2>/dev/null | head -1)
if [ -z "$deb" ]; then
  ko "no .deb in $bundle/deb (run just package)"
else
  mkdir -p "$tmp/deb" && (cd "$tmp/deb" && ar x "$deb")
  control=$(cd "$tmp/deb" && for c in control.tar.*; do
    case "$c" in *.gz) tar -xzOf "$c" --wildcards '*control';; *.xz) tar -xJOf "$c" --wildcards '*control';; *.zst) tar --zstd -xOf "$c" --wildcards '*control';; *) tar -xOf "$c" --wildcards '*control';; esac
  done 2>/dev/null)
  grep -qx 'Package: relief' <<<"$control" && ok ".deb Package: relief" || ko ".deb control lacks 'Package: relief'"
  grep -qx "Version: $version" <<<"$control" && ok ".deb Version: $version" || ko ".deb control lacks 'Version: $version'"
  grep -E '^Depends:' <<<"$control" | grep -q 'libwebkit2gtk-4.1-0' && ok ".deb Depends libwebkit2gtk-4.1-0" || ko ".deb control Depends lacks libwebkit2gtk-4.1-0"

  # 2. embedded docs: Tauri embeds the UI (docs under /docs) into the binary; asset paths stay readable
  (cd "$tmp/deb" && for d in data.tar.*; do
    case "$d" in *.gz) tar -xzf "$d" --wildcards '*usr/bin/relief';; *.xz) tar -xJf "$d" --wildcards '*usr/bin/relief';; *.zst) tar --zstd -xf "$d" --wildcards '*usr/bin/relief';; *) tar -xf "$d" --wildcards '*usr/bin/relief';; esac
  done) 2>/dev/null
  if [ -f "$tmp/deb/usr/bin/relief" ] && grep -aq '/docs/getting-started/index.html' "$tmp/deb/usr/bin/relief"; then
    ok "docs embedded in the .deb binary"
  else
    ko ".deb has no usr/bin/relief embedding /docs/getting-started/index.html"
  fi
fi

# 3. AppImage
app=$(ls "$bundle"/appimage/*.AppImage 2>/dev/null | head -1)
if [ -n "$app" ] && [ -x "$app" ]; then ok "AppImage executable: $app"; else ko "no executable AppImage in $bundle/appimage"; fi

# 4. PKGBUILD
if [ ! -f "$root/packaging/arch/PKGBUILD" ]; then
  ko "packaging/arch/PKGBUILD missing"
elif ! command -v makepkg >/dev/null; then
  ko "makepkg not found (Arch/CachyOS required for this check)"
else
  mkdir -p "$tmp/arch" && cp -r "$root/packaging/arch/." "$tmp/arch/"
  if (cd "$tmp/arch" && RELIEF_BUNDLE_DIR="$bundle" makepkg -f >"$tmp/makepkg.log" 2>&1); then
    pkg=$(ls "$tmp"/arch/relief-*.pkg.tar.zst 2>/dev/null | head -1)
    if [ -n "$pkg" ] && grep -qx 'usr/bin/relief' <<<"$(tar --zstd -tf "$pkg")"; then ok "PKGBUILD builds $(basename "$pkg") with usr/bin/relief"
    else ko "makepkg produced no relief-*.pkg.tar.zst containing usr/bin/relief"; fi
  else
    ko "makepkg -f failed (see: $(tail -3 "$tmp/makepkg.log" | tr '\n' ' '))"
  fi
fi

exit $fail
