#!/bin/sh
# Builds relief from the current checkout and installs it for the current user.
# No admin rights: nothing is written outside the user's folder. See --help.
set -eu

root=$(cd "$(dirname "$0")" && pwd)

usage() {
  cat <<USAGE
Usage: ./install.sh [--dry-run] [--uninstall] [--accept-msvc-license] [--help]

Builds relief from this checkout (uncommitted changes included) and installs it
in your user folder. No admin rights are needed or used.

  Linux    build in Docker (Ubuntu 22.04, AppImage), extracted to ~/.local/share/relief,
           launcher ~/.local/bin/relief, menu entry and icon under ~/.local/share
  macOS    native build (needs cargo, node and the Command Line Tools), relief.app in
           ~/Applications, link ~/.local/bin/relief
  Windows  cross-build in Docker (cargo-xwin, NSIS), silent per-user install in %LOCALAPPDATA%

Options:
  --dry-run               print the detected OS and each step, build and install nothing
  --uninstall             remove exactly what the installation put in place
  --accept-msvc-license   Windows: accept the Microsoft MSVC/Windows SDK license that
                          cargo-xwin downloads (otherwise you are asked)
  --help                  show this help

Environment: RELIEF_INSTALL_OS=linux|macos|windows forces the OS detection.
USAGE
}

dry=0 uninstall=0 accept=0
for a in "$@"; do
  case $a in
    --dry-run) dry=1 ;;
    --uninstall) uninstall=1 ;;
    --accept-msvc-license) accept=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown option: $a" >&2; usage >&2; exit 2 ;;
  esac
done

die() { echo "error: $*" >&2; exit 1; }

# --- OS and architecture ---
os=${RELIEF_INSTALL_OS:-}
if [ -z "$os" ]; then
  case $(uname -s 2>/dev/null) in
    Linux) os=linux ;;
    Darwin) os=macos ;;
    MINGW*|MSYS*|CYGWIN*) os=windows ;;
    *) die "unsupported system: $(uname -s)" ;;
  esac
fi
case $os in linux|macos|windows) ;; *) die "RELIEF_INSTALL_OS must be linux, macos or windows" ;; esac

arch=$(uname -m 2>/dev/null || echo unknown)
[ "$os" = windows ] && [ -n "${PROCESSOR_ARCHITECTURE:-}" ] && arch=$PROCESSOR_ARCHITECTURE
case $arch in
  amd64|AMD64|x86_64) arch=x86_64 ;;
  arm64|ARM64|aarch64) arch=aarch64 ;;
esac

# --- paths (all under the user's folder) ---
home=${HOME:?HOME is not set}
cache=${XDG_CACHE_HOME:-$home/.cache}
bindir=$home/.local/bin
share=$home/.local/share
case $os in
  linux)
    app_dir=$share/relief
    launcher=$bindir/relief
    desktop=$share/applications/relief.desktop
    icons=$share/icons/hicolor
    icon_sizes="32 48 64 128 256"
    ;;
  macos)
    app_dir=$home/Applications/relief.app
    launcher=$bindir/relief
    ;;
  windows)
    app_dir=${LOCALAPPDATA:-$home/AppData/Local}/relief
    ;;
esac

# --- build identity ---
git_info() {
  branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
  commit=$(git -C "$root" rev-parse --short=9 HEAD 2>/dev/null || echo unknown)
  if [ -n "$(git -C "$root" status --porcelain 2>/dev/null)" ]; then commit="$commit dirty"; fi
}

# --- desktop integration ---

# refresh_desktop_caches: lets the desktop see the new launcher and icons now, not at the
# next login. Every tool is optional.
refresh_desktop_caches() {
  [ "$os" = linux ] || return 0
  [ "$dry" = 1 ] && return 0
  if command -v gtk-update-icon-cache >/dev/null 2>&1 && [ -f "$icons/index.theme" ]; then
    gtk-update-icon-cache -q -t "$icons" 2>/dev/null || true
  fi
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q "$share/applications" 2>/dev/null || true
  fi
  for sycoca in kbuildsycoca6 kbuildsycoca5; do
    if command -v "$sycoca" >/dev/null 2>&1; then "$sycoca" >/dev/null 2>&1 || true; break; fi
  done
}

# --- uninstall ---

# remove_path <path>: removes it (or only says so with --dry-run)
remove_path() {
  if [ -e "$1" ] || [ -L "$1" ]; then
    if [ "$dry" = 1 ]; then echo "would remove: $1"; else rm -rf "$1"; echo "removed: $1"; fi
  fi
}

# our launcher: a script that execs our AppRun, or (macOS) a link into the app
is_our_launcher() {
  if [ -L "$launcher" ]; then
    case $(readlink "$launcher") in "$app_dir"/*) return 0 ;; esac
    return 1
  fi
  [ -f "$launcher" ] && grep -qF "exec \"$app_dir/AppRun\"" "$launcher" 2>/dev/null
}

# remove_empty_dirs <dir>...: only the ones left empty, never a parent of $HOME/.local
remove_empty_dirs() {
  [ "$dry" = 1 ] && return 0
  for d in "$@"; do rmdir "$d" 2>/dev/null || true; done
}

if [ "$uninstall" = 1 ]; then
  case $os in
    linux)
      remove_path "$app_dir"
      if is_our_launcher; then remove_path "$launcher"; elif [ -e "$launcher" ] || [ -L "$launcher" ]; then echo "kept: $launcher is not relief launcher, left in place"; fi
      remove_path "$desktop"
      for size in $icon_sizes; do remove_path "$icons/${size}x${size}/apps/relief.png"; done
      remove_path "$share/dev.relief.app"
      remove_path "$cache/relief"
      remove_path "$cache/dev.relief.app"
      for size in $icon_sizes; do
        remove_empty_dirs "$icons/${size}x${size}/apps" "$icons/${size}x${size}"
      done
      remove_empty_dirs "$icons" "$share/icons" "$share/applications" "$bindir" "$cache"
      ;;
    macos)
      remove_path "$app_dir"
      if is_our_launcher; then remove_path "$launcher"; elif [ -e "$launcher" ] || [ -L "$launcher" ]; then echo "kept: $launcher is not relief launcher, left in place"; fi
      remove_empty_dirs "$bindir" "$home/Applications"
      ;;
    windows)
      if [ -f "$app_dir/uninstall.exe" ]; then
        if [ "$dry" = 1 ]; then
          echo "would remove: $app_dir"
        else
          # MSYS_NO_PATHCONV: Git Bash must not turn /S into a path. The NSIS uninstaller
          # copies itself and returns at once, so wait until the install folder is gone.
          MSYS_NO_PATHCONV=1 "$app_dir/uninstall.exe" /S || die "the uninstaller failed"
          i=0
          while [ -e "$app_dir/relief.exe" ] && [ "$i" -lt 60 ]; do sleep 1; i=$((i + 1)); done
          [ -e "$app_dir/relief.exe" ] && die "the uninstaller did not finish within 60 s"
          echo "removed: $app_dir"
        fi
      else
        echo "nothing to remove in $app_dir"
      fi ;;
  esac
  exit 0
fi

git_info

# --- dry run ---
if [ "$dry" = 1 ]; then
  echo "os: $os"
  echo "arch: $arch"
  echo "branch: $branch"
  echo "commit: $commit"
  case $os in
    linux)
      echo "step: docker-build"; echo "step: extract-appimage"; echo "step: install-launcher"
      echo "step: install-desktop"; echo "step: install-icon"
      echo "install: $app_dir"; echo "install: $launcher"; echo "install: $desktop"
      for size in $icon_sizes; do echo "install: $icons/${size}x${size}/apps/relief.png"; done ;;
    macos)
      echo "step: native-build"; echo "step: install-app"; echo "step: link-bin"
      echo "install: $app_dir"; echo "install: $launcher" ;;
    windows)
      echo "step: msvc-license"; echo "step: docker-build"
      [ "${RELIEF_INSTALL_BUILD_ONLY:-}" = 1 ] || echo "step: run-installer"
      echo "install: $app_dir" ;;
  esac
  exit 0
fi

echo "building: $branch @ $commit"

# --- helpers ---
build_only=${RELIEF_INSTALL_BUILD_ONLY:-}

need_docker() {
  command -v docker >/dev/null 2>&1 || die "docker not found in PATH. Install Docker (Docker Desktop on Windows) and start it, then run this script again."
  docker info >/dev/null 2>&1 || die "docker is installed but its daemon is not reachable. Start Docker and run this script again."
}

# docker_user_args: on Linux, `--user <uid>:<gid>` so that target/ belongs to the current user.
# Not with a rootless Docker (container root already is the current user on the host, and runc
# cannot hand the terminal to an unmapped uid: "chown /dev/stdout: invalid argument"), nor with
# Docker Desktop (its VM maps the ownership of shared folders).
docker_user_args() {
  [ "$(uname -s 2>/dev/null)" = Linux ] || return 0
  info=$(docker info --format '{{.OperatingSystem}} {{json .SecurityOptions}}' 2>/dev/null)
  case "$info" in
    *rootless* | "Docker Desktop"*) return 0 ;;
  esac
  echo "--user $(id -u):$(id -g)"
}

# docker_build <linux|windows>: builds the image, then the bundles inside it (as the current user on Linux)
docker_build() {
  kind=$1
  docker build -q -f "$root/packaging/docker/Dockerfile" --target "$kind" -t "relief-build:$kind" "$root/packaging/docker" >/dev/null \
    || die "docker image build failed"
  mkdir -p "$root/target"
  env_args=""
  # the MSVC license was accepted by the user (prompt or --accept-msvc-license) before this point
  if [ "$kind" = windows ]; then env_args="-e XWIN_ACCEPT_LICENSE=1"; fi
  user_args=$(docker_user_args)
  # shellcheck disable=SC2086
  MSYS_NO_PATHCONV=1 docker run --rm $user_args $env_args \
    -v "$root:/src:ro" -v "$root/target:/out" \
    -v relief-build-cache:/cache -v relief-build-work:/work \
    "relief-build:$kind" "$kind" || die "the build in Docker failed"
}

add_path_hint() {
  case ":$PATH:" in
    *":$bindir:"*) ;;
    *) echo "note: $bindir is not in your PATH. Add this line to your shell profile:"
       echo "  export PATH=\"$bindir:\$PATH\"" ;;
  esac
}

finish() {
  git_info
  echo "built: $branch @ $commit"
}

# --- Linux ---
install_linux() {
  need_docker
  docker_build linux
  img=$(ls "$root"/target/install/linux/*.AppImage 2>/dev/null | head -1)
  [ -n "$img" ] || die "no AppImage was produced"
  if [ "$build_only" = 1 ]; then finish; echo "built: $img"; return; fi
  mkdir -p "$home"
  tmpx=$(mktemp -d "$home/.relief-install.XXXXXX")
  trap 'rm -rf "$tmpx"' EXIT
  cp "$img" "$tmpx/relief.AppImage"
  chmod +x "$tmpx/relief.AppImage"
  # extraction needs no FUSE
  (cd "$tmpx" && ./relief.AppImage --appimage-extract >/dev/null) || die "cannot extract the AppImage"
  rm -rf "$app_dir"
  mkdir -p "$(dirname "$app_dir")" "$bindir" "$(dirname "$desktop")"
  mv "$tmpx/squashfs-root" "$app_dir"
  # AppRun moves to \$APPDIR/usr; relief goes back to OWD (set by the AppImage runtime, which
  # an extracted AppImage does not run), so that `relief .` is the folder of the terminal.
  cat >"$launcher" <<LAUNCHER
#!/bin/sh
OWD="\$PWD"; export OWD
exec "$app_dir/AppRun" "\$@"
LAUNCHER
  chmod +x "$launcher"
  # The icon goes into the hicolor theme under its name, in every size: the task bar picks the
  # size it needs. The window's app_id (Wayland) and WM_CLASS (X11) are both "relief", which ties it
  # to relief.desktop.
  for size in $icon_sizes; do
    mkdir -p "$icons/${size}x${size}/apps"
    cp "$root/src/interfaces/relief-desktop/icons/${size}x${size}.png" "$icons/${size}x${size}/apps/relief.png"
  done
  cat >"$desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=relief
Comment=Zoomable map of a git repository with the diff overlaid
Exec="$launcher" %F
Icon=relief
StartupWMClass=relief
Categories=Development;
Terminal=false
DESKTOP
  refresh_desktop_caches
  finish
  add_path_hint
  echo "installed: $app_dir"
  "$launcher" --version
}

# --- macOS ---
install_macos() {
  missing=""
  command -v cargo >/dev/null 2>&1 || missing="$missing\n  - cargo: install rustup in your home folder: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  command -v node >/dev/null 2>&1 || missing="$missing\n  - node: download the macOS archive from https://nodejs.org/en/download and unpack it in your home folder, then add its bin folder to PATH"
  xcode-select -p >/dev/null 2>&1 || missing="$missing\n  - Command Line Tools: run xcode-select --install"
  if [ -n "$missing" ]; then
    printf 'error: missing prerequisites:%b\n' "$missing" >&2
    exit 1
  fi
  (
    cd "$root"
    npm --prefix docs/user ci --no-audit --no-fund
    npm --prefix src/ui ci --no-audit --no-fund
    npm --prefix docs/user run build
    npm --prefix src/ui run build
    rm -rf src/ui/dist/relief/browser/docs
    cp -r docs/user/dist src/ui/dist/relief/browser/docs
    cd src/interfaces/relief-desktop
    npx --prefix ../../ui tauri build --bundles app
  ) || die "the native build failed"
  app=$(ls -d "$root"/target/release/bundle/macos/relief.app 2>/dev/null | head -1)
  [ -n "$app" ] || die "no relief.app was produced"
  if [ "$build_only" = 1 ]; then finish; echo "built: $app"; return; fi
  mkdir -p "$(dirname "$app_dir")" "$bindir"
  rm -rf "$app_dir"
  cp -R "$app" "$app_dir"
  ln -sf "$app_dir/Contents/MacOS/relief" "$launcher"
  finish
  add_path_hint
  echo "installed: $app_dir"
  "$launcher" --version
}

# --- Windows ---
install_windows() {
  need_docker
  if [ "$accept" != 1 ]; then
    cat <<LICENSE
The Windows build downloads the Microsoft Visual C++ runtime and the Windows SDK
(through cargo-xwin). They are covered by Microsoft's license:
  https://go.microsoft.com/fwlink/?LinkId=2086102
LICENSE
    if [ -t 0 ]; then
      printf 'Do you accept this license? [y/N] '
      read -r answer || answer=n
    else
      answer=n
    fi
    case $answer in
      y|Y|yes|YES) ;;
      *) die "MSVC license not accepted; run again with --accept-msvc-license to accept it" ;;
    esac
  fi
  docker_build windows
  setup=$(ls "$root"/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe 2>/dev/null | head -1)
  [ -n "$setup" ] || die "no NSIS installer was produced"
  if [ "$build_only" = 1 ]; then finish; echo "built: $setup"; return; fi
  # the NSIS installer runs in currentUser mode: no elevation
  MSYS_NO_PATHCONV=1 "$setup" /S || die "the installer failed"
  finish
  [ -e "$app_dir/relief.exe" ] || die "the installer finished but $app_dir/relief.exe is missing"
  echo "installed: $app_dir/relief.exe"
  # relief.exe is a GUI program: it prints nothing in a console, so no --version here
  case ":$PATH:" in
    *":$app_dir:"*|*":$(cygpath -u "$app_dir" 2>/dev/null || echo "$app_dir"):"*) ;;
    *) echo "note: $app_dir is not in your PATH. To run relief from a terminal, add this line to ~/.bashrc:"
       echo "  export PATH=\"$app_dir:\$PATH\"" ;;
  esac
}

case $os in
  linux) install_linux ;;
  macos) install_macos ;;
  windows) install_windows ;;
esac
