#!/bin/sh
# Runs inside the build container. Usage: relief-build linux|windows
# /src: the checkout (read-only). /work: build tree (named volume, keeps target/ and node_modules
# between builds). /out: where the bundles are copied (host folder).
set -eu
kind=${1:?usage: relief-build linux|windows}
mkdir -p "$CARGO_HOME" "$HOME" "$npm_config_cache"
# Drop the previous sources (so deleted files do not linger) but keep target/ and node_modules/
find /work -mindepth 1 \( -name target -o -name node_modules \) -prune -o \( -type f -o -type l \) -exec rm -f {} +
find /work -mindepth 1 -type d -empty -delete 2>/dev/null || true
# Copy the checkout as is (modified files included), keeping mtimes so cargo stays incremental
cd /src
tar --exclude=./.git --exclude=./target --exclude=node_modules --exclude=dist \
    --exclude=.angular --exclude=.astro --exclude=test-results -cf - . | tar -C /work --no-overwrite-dir -xf -
cd /work
npm --prefix docs/user ci --no-audit --no-fund
npm --prefix src/ui ci --no-audit --no-fund
npm --prefix docs/user run build
npm --prefix src/ui run build
rm -rf src/ui/dist/relief/browser/docs
cp -r docs/user/dist src/ui/dist/relief/browser/docs
cd src/interfaces/relief-desktop
case $kind in
  linux)
    # No FUSE in the container; linuxdeploy ships an old strip that fails on recent binaries
    APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true npx --prefix ../../ui tauri build --bundles appimage
    mkdir -p /out/install/linux && rm -f /out/install/linux/*.AppImage
    cp /work/target/release/bundle/appimage/*.AppImage /out/install/linux/
    ;;
  windows)
    # The NSIS bundle needs an .ico, generated here from the png (not written to the checkout)
    npx --prefix ../../ui tauri icon icons/icon.png -o icons >/dev/null
    npx --prefix ../../ui tauri build --runner cargo-xwin \
      --target x86_64-pc-windows-msvc --bundles nsis \
      --config '{"bundle":{"icon":["icons/icon.png","icons/icon.ico"]}}'
    d=/out/x86_64-pc-windows-msvc/release/bundle/nsis
    mkdir -p "$d" && rm -f "$d"/*-setup.exe
    cp /work/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe "$d"/
    ;;
  *) echo "unknown target: $kind" >&2; exit 2 ;;
esac
