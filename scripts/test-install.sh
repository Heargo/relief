#!/usr/bin/env bash
# Tests install.sh (P02).
#   always:                          dry-run on the three forced OS, --help, refusal without docker, no sudo, nothing outside $HOME
#   RELIEF_INSTALL_CHECK_FULL=1:     real Docker build + install in a temporary HOME, --version, launch under Xvfb, --uninstall
#   RELIEF_INSTALL_CHECK_WINDOWS=1:  cross-build of the Windows NSIS installer (needs Docker; accepts the MSVC license on the caller's behalf)
#
# Dry-run output contract (stdout, one item per line, in this order of kinds):
#   os: <linux|macos|windows>
#   arch: <x86_64|aarch64|...>
#   branch: <name>
#   commit: <short sha>[ dirty]
#   step: <name>              linux:   docker-build, extract-appimage, install-launcher, install-desktop, install-icon
#                             macos:   native-build, install-app, link-bin
#                             windows: msvc-license, docker-build, run-installer
#   install: <absolute path>  every path that would be written; all under $HOME (windows: under $LOCALAPPDATA)
#                             linux:   $HOME/.local/share/relief, $HOME/.local/bin/relief,
#                                      $HOME/.local/share/applications/relief.desktop, $HOME/.local/share/icons/<...relief...>
#                             macos:   $HOME/Applications/relief.app, $HOME/.local/bin/relief
#                             windows: $LOCALAPPDATA/relief (the test sets LOCALAPPDATA=$HOME/AppData/Local)
#   the output never contains the word "sudo".
# Without docker in PATH (linux, windows, not dry-run): exit non-zero, stderr names "docker", HOME stays empty.
# RELIEF_INSTALL_BUILD_ONLY=1: build, skip the install step (used by the Windows check on a Linux host).
# Windows build output: target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe
set -uo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
installer="$root/install.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
ko() { echo "FAIL: $*" >&2; fail=1; }
ok() { echo "ok: $*"; }

version=$(sed -n '/^\[workspace.package\]/,/^\[/{s/^version *= *"\(.*\)"/\1/p}' "$root/Cargo.toml" | head -1)
[ -n "$version" ] || { echo "FAIL: workspace version not found in Cargo.toml" >&2; exit 2; }

# install.ps1: present at the root; its dry-run contract is only checked when pwsh is available
if [ ! -f "$root/install.ps1" ]; then
  ko "install.ps1 missing at $root/install.ps1"
elif command -v pwsh >/dev/null; then
  home="$tmp/home-ps1"; mkdir -p "$home"
  out=$(HOME="$home" LOCALAPPDATA="$home/AppData/Local" pwsh -NoProfile -File "$root/install.ps1" -DryRun 2>/dev/null)
  grep -qx 'os: windows' <<<"$out" && ok "install.ps1 -DryRun: os line" || ko "install.ps1 -DryRun: missing 'os: windows'"
  grep -q "^install: $home/AppData/Local/" <<<"$out" && ok "install.ps1 -DryRun: install under LOCALAPPDATA" || ko "install.ps1 -DryRun: no 'install:' under \$LOCALAPPDATA"
else
  ok "install.ps1 exists (pwsh not available, dry-run not checked)"
fi

if [ ! -x "$installer" ]; then
  ko "install.sh missing or not executable at $installer"
  exit 1
fi

# --- fast part ---
for os in linux macos windows; do
  home="$tmp/home-$os"; mkdir -p "$home"
  out=$(HOME="$home" LOCALAPPDATA="$home/AppData/Local" RELIEF_INSTALL_OS=$os "$installer" --dry-run 2>"$tmp/err-$os"); rc=$?
  [ $rc -eq 0 ] && ok "$os dry-run exits 0" || ko "$os dry-run exited $rc ($(head -c 200 "$tmp/err-$os"))"
  grep -qx "os: $os" <<<"$out" && ok "$os: os line" || ko "$os: missing line 'os: $os'"
  grep -q '^arch: .' <<<"$out" && ok "$os: arch line" || ko "$os: missing 'arch:' line"
  grep -q '^branch: .' <<<"$out" && ok "$os: branch line" || ko "$os: missing 'branch:' line"
  grep -q '^commit: [0-9a-f]\{7,\}' <<<"$out" && ok "$os: commit line" || ko "$os: missing 'commit: <sha>' line"
  grep -qiw sudo <<<"$out" && ko "$os: dry-run mentions sudo" || ok "$os: no sudo"
  case $os in
    linux)   steps="docker-build extract-appimage install-launcher install-desktop install-icon"
             paths=".local/share/relief .local/bin/relief .local/share/applications/relief.desktop .local/share/icons/" ;;
    macos)   steps="native-build install-app link-bin"
             paths="Applications/relief.app .local/bin/relief" ;;
    windows) steps="msvc-license docker-build run-installer"
             paths="AppData/Local/relief" ;;
  esac
  for s in $steps; do grep -qx "step: $s" <<<"$out" && ok "$os: step $s" || ko "$os: missing 'step: $s'"; done
  for p in $paths; do grep -q "^install: $home/$p" <<<"$out" && ok "$os: install $p" || ko "$os: missing 'install: $home/$p...'"; done
  n=$(grep -c '^install: ' <<<"$out")
  [ "$n" -gt 0 ] && ok "$os: $n install paths" || ko "$os: no 'install:' lines"
  while IFS= read -r line; do
    p=${line#install: }
    case $p in "$home"/*) ;; *) ko "$os: install path outside HOME: $p";; esac
  done < <(grep '^install: ' <<<"$out")
  [ -z "$(find "$home" -mindepth 1 2>/dev/null)" ] && ok "$os: dry-run wrote nothing" || ko "$os: dry-run wrote files in HOME"
done

# --help
out=$("$installer" --help 2>&1); rc=$?
[ $rc -eq 0 ] && grep -q -- '--dry-run' <<<"$out" && grep -q -- '--uninstall' <<<"$out" && grep -q -- '--help' <<<"$out" \
  && ok "--help lists --dry-run, --uninstall, --help" || ko "--help must exit 0 and mention --dry-run, --uninstall, --help"

# refusal without docker
nodocker="$tmp/nodocker-bin"; mkdir -p "$nodocker"
for t in bash sh env uname git dirname basename cat grep sed awk tr head tail mkdir rm cp mv ln ls find id date mktemp cut sort tee readlink printf; do
  p=$(command -v "$t" 2>/dev/null) && [ -x "$p" ] && ln -sf "$p" "$nodocker/$t"
done
home="$tmp/home-nodocker"; mkdir -p "$home"
HOME="$home" PATH="$nodocker" RELIEF_INSTALL_OS=linux "$BASH" "$installer" >"$tmp/nd.out" 2>"$tmp/nd.err"; rc=$?
[ $rc -ne 0 ] && ok "no docker: exits non-zero" || ko "no docker: expected non-zero exit"
grep -qi docker "$tmp/nd.err" && ok "no docker: message names docker" || ko "no docker: stderr does not mention docker"
[ -z "$(find "$home" -mindepth 1 2>/dev/null)" ] && ok "no docker: HOME untouched" || ko "no docker: files written in HOME"

# --dry-run --uninstall removes nothing and lists what it would remove (contract: lines "would remove: <path>")
home="$tmp/home-dryun"
fake_install() {
  mkdir -p "$1/.local/share/relief" "$1/.local/bin" "$1/.local/share/applications" "$1/.local/share/icons/hicolor/256x256/apps"
  echo x >"$1/.local/share/relief/AppRun"
  printf '#!/bin/sh\nexec "%s/.local/share/relief/AppRun" "$@"\n' "$1" >"$1/.local/bin/relief"; chmod +x "$1/.local/bin/relief"
  echo x >"$1/.local/share/applications/relief.desktop"
  echo x >"$1/.local/share/icons/hicolor/256x256/apps/relief.png"
}
fake_install "$home"
out=$(HOME="$home" RELIEF_INSTALL_OS=linux "$installer" --dry-run --uninstall 2>&1)
for f in .local/share/relief/AppRun .local/bin/relief .local/share/applications/relief.desktop .local/share/icons/hicolor/256x256/apps/relief.png; do
  [ -e "$home/$f" ] && ok "dry-run --uninstall kept $f" || ko "dry-run --uninstall removed $f"
done
for f in .local/share/relief .local/bin/relief .local/share/applications/relief.desktop .local/share/icons/; do
  grep -q "^would remove: $home/$f" <<<"$out" && ok "dry-run --uninstall lists $f" || ko "dry-run --uninstall: missing 'would remove: $home/$f...'"
done

# --uninstall leaves a ~/.local/bin/relief that is not relief's launcher
home="$tmp/home-foreign"
fake_install "$home"
printf '#!/bin/sh\necho not relief\n' >"$home/.local/bin/relief"
out=$(HOME="$home" RELIEF_INSTALL_OS=linux "$installer" --uninstall 2>&1)
[ -f "$home/.local/bin/relief" ] && grep -q 'not relief' "$home/.local/bin/relief" && ok "--uninstall kept a foreign ~/.local/bin/relief" || ko "--uninstall removed a ~/.local/bin/relief that is not relief's launcher"
grep -q "$home/.local/bin/relief" <<<"$out" && grep -qi 'not\|left\|kept\|skip' <<<"$out" && ok "--uninstall says it left the foreign file" || ko "--uninstall printed no message about the foreign ~/.local/bin/relief"
[ ! -e "$home/.local/share/relief" ] && ok "--uninstall still removed relief's own folder" || ko "--uninstall left ~/.local/share/relief"

# no sudo invoked by the script
grep -v '^[[:space:]]*#' "$installer" | grep -Eq '(^|[;&|(`[:space:]])sudo[[:space:]]' && ko "install.sh invokes sudo" || ok "install.sh never invokes sudo"

# --- slow part: real install on Linux ---
if [ "${RELIEF_INSTALL_CHECK_FULL:-}" = 1 ]; then
  home="$tmp/home-full"; mkdir -p "$home"
  if HOME="$home" RELIEF_INSTALL_OS=linux "$installer" >"$tmp/full.log" 2>&1; then
    ok "install.sh built and installed"
    got=$(HOME="$home" "$home/.local/bin/relief" --version 2>&1)
    grep -q "$version" <<<"$got" && ok "relief --version = $version" || ko "relief --version is '$got', expected $version"
    [ -f "$home/.local/share/applications/relief.desktop" ] && ok ".desktop installed" || ko "no relief.desktop"
    fx="$tmp/acme-shop"; mkdir -p "$fx"
    (cd "$root" && cargo run -q -p relief-fixtures -- build acme-shop "$fx") >/dev/null 2>&1 || ko "cannot build the acme-shop fixture"
    if command -v xvfb-run >/dev/null; then
      HOME="$home" xvfb-run -a timeout 20 "$home/.local/bin/relief" "$fx" >"$tmp/run.log" 2>&1; rc=$?
      [ $rc -eq 124 ] && ok "relief opened acme-shop under Xvfb (still running after 20s)" || ko "relief exited $rc under Xvfb ($(tail -c 300 "$tmp/run.log"))"
      # `relief .` from the repository: AppRun moves to $APPDIR/usr, relief must go back (OWD).
      (cd "$fx" && HOME="$home" xvfb-run -a timeout 20 "$home/.local/bin/relief" . >"$tmp/run-dot.log" 2>&1); rc=$?
      [ $rc -eq 124 ] && ok "relief . opened the current folder under Xvfb" || ko "relief . exited $rc under Xvfb ($(tail -c 300 "$tmp/run-dot.log"))"
    else
      ko "xvfb-run not found"
    fi
    HOME="$home" RELIEF_INSTALL_OS=linux "$installer" --uninstall >"$tmp/un.log" 2>&1 && ok "--uninstall exits 0" || ko "--uninstall failed"
    # ~/.cache/mesa_shader_cache is created by Xvfb/Mesa itself, not by relief: ignore it (and only it)
    left=$(find "$home" -mindepth 1 \( -type f -o -type l \) -not -path "$home/.cache/mesa_shader_cache/*" 2>/dev/null)
    [ -z "$left" ] && ok "nothing left in HOME after --uninstall" || ko "left after --uninstall: $(echo "$left" | head -5 | tr '\n' ' ')"
  else
    ko "install.sh failed (see: $(tail -5 "$tmp/full.log" | tr '\n' ' '))"
  fi
fi

# --- Windows cross-build ---
if [ "${RELIEF_INSTALL_CHECK_WINDOWS:-}" = 1 ]; then
  home="$tmp/home-win"; mkdir -p "$home"
  if HOME="$home" LOCALAPPDATA="$home/AppData/Local" RELIEF_INSTALL_OS=windows RELIEF_INSTALL_BUILD_ONLY=1 "$installer" --accept-msvc-license >"$tmp/win.log" 2>&1; then
    exe=$(ls "$root"/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe 2>/dev/null | head -1)
    [ -n "$exe" ] && ok "NSIS installer built: $(basename "$exe")" || ko "no *-setup.exe under target/x86_64-pc-windows-msvc/release/bundle/nsis"
    mode=$(grep -o '"installMode" *: *"[^"]*"' "$root/src/interfaces/relief-desktop/tauri.conf.json" | head -1)
    { [ -z "$mode" ] || grep -q currentUser <<<"$mode"; } && ok "NSIS installMode is currentUser" || ko "installMode is not currentUser: $mode"
  else
    ko "windows cross-build failed (see: $(tail -5 "$tmp/win.log" | tr '\n' ' '))"
  fi
fi

exit $fail
