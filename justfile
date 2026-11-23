set shell := ["bash", "-euo", "pipefail", "-c"]

acme_dir := justfile_directory() / ".cache/acme-shop"

default:
    @just --list

# Install dependencies (cargo fetch, npm install in src/ui/, tests/e2e/ and docs/user/, tauri-driver, WebKitWebDriver check)
setup:
    cargo fetch
    npm --prefix src/ui install --no-audit --no-fund
    npm --prefix tests/e2e install --no-audit --no-fund
    npm --prefix docs/user install --no-audit --no-fund
    @command -v WebKitWebDriver >/dev/null || { echo "WebKitWebDriver not found: install webkitgtk-6.0 (Arch) or webkit2gtk-driver (Debian/Ubuntu)" >&2; exit 1; }
    cargo install tauri-driver --locked

# The desktop app on acme-shop (main...feat/promo-codes), UI served by ng serve (port 4200)
dev: acme-repo
    #!/usr/bin/env bash
    set -euo pipefail
    (cd src/ui && exec npx ng serve --port 4200) &
    ui=$!
    trap 'kill $ui 2>/dev/null || true' EXIT
    # The tauri CLI finds tauri.conf.json under the current folder
    cd src/interfaces/relief-desktop
    ../../ui/node_modules/.bin/tauri dev -- -- "{{acme_dir}}" main...feat/promo-codes

[private]
acme-repo:
    @if [ ! -d "{{acme_dir}}/.git" ]; then rm -rf "{{acme_dir}}" && mkdir -p "{{acme_dir}}" && cargo run -q -p relief-fixtures -- build acme-shop "{{acme_dir}}"; fi

# User docs, then the UI, the docs copied into it (served under /docs), then the binaries (the UI and the docs are embedded in them)
build: docs-build
    npm --prefix src/ui run build
    rm -rf src/ui/dist/relief/browser/docs
    cp -r docs/user/dist src/ui/dist/relief/browser/docs
    cargo build --release
    cargo build --release -p relief-desktop --features custom-protocol

test:
    cargo test --workspace
    cd src/ui && npx ng test --watch=false

# One line per suite
test-summary:
    #!/usr/bin/env bash
    set -uo pipefail
    status=0
    out=$(cargo test --workspace 2>&1) || status=1
    passed=$(grep -E '^test result:' <<<"$out" | sed -E 's/.* ([0-9]+) passed.*/\1/' | awk '{s+=$1} END {print s+0}')
    failed=$(grep -E '^test result:' <<<"$out" | sed -E 's/.* ([0-9]+) failed.*/\1/' | awk '{s+=$1} END {print s+0}')
    echo "cargo: ${passed:-0} passed, ${failed:-0} failed"
    out=$(cd src/ui && NO_COLOR=1 FORCE_COLOR=0 npx ng test --watch=false 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g') || status=1
    line=$(grep -E '^\s*Tests ' <<<"$out" | tail -1)
    passed=$(grep -oE '[0-9]+ passed' <<<"$line" | grep -oE '[0-9]+')
    failed=$(grep -oE '[0-9]+ failed' <<<"$line" | grep -oE '[0-9]+')
    echo "web: ${passed:-0} passed, ${failed:-0} failed"
    exit $status

# Release build (UI embedded), then WebdriverIO on the app (Xvfb when available)
e2e: build
    #!/usr/bin/env bash
    set -euo pipefail
    cd tests/e2e
    if command -v xvfb-run >/dev/null; then
        GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts
    else
        npx wdio run wdio.conf.ts
    fi

# Render benchmark of the map (pan, wheel zoom, selection) on dense and excalidraw (clone of `just bench`), numbers in target/bench-ui/*.json; not part of `just e2e`
bench-ui: build
    #!/usr/bin/env bash
    set -euo pipefail
    dir="${RELIEF_BENCH_DIR:-$HOME/dev/relief-bench}"
    [ -d "$dir/excalidraw" ] || { echo "no clone in $dir/excalidraw: run just bench first" >&2; exit 1; }
    cd tests/e2e
    if command -v xvfb-run >/dev/null; then
        GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.bench.conf.ts
    else
        npx wdio run wdio.bench.conf.ts
    fi

# One line: e2e: N passed, S skipped, M failed
e2e-summary: build
    #!/usr/bin/env bash
    set -uo pipefail
    cd tests/e2e
    if command -v xvfb-run >/dev/null; then
        raw=$(NO_COLOR=1 GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npx wdio run wdio.conf.ts 2>&1)
    else
        raw=$(NO_COLOR=1 npx wdio run wdio.conf.ts 2>&1)
    fi
    code=$?
    out=$(sed -E 's/\x1b\[[0-9;]*m//g' <<<"$raw")
    grep -qE '^Spec Files:.*[0-9]+ failed' <<<"$out" && code=1
    count() { grep -oE "[0-9]+ $1( |$)" <<<"$out" | awk '{s+=$1} END {print s+0}'; }
    passed=$(count passing)
    failed=$(count failing)
    skipped=$(( $(count skipped) + $(count pending) ))
    echo "e2e: ${passed:-0} passed, ${skipped:-0} skipped, ${failed:-0} failed"
    [ "$code" -eq 0 ] && [ "${failed:-0}" -eq 0 ] && [ "${passed:-0}" -gt 0 ] || { grep -E "✖|FAILED|Error:" <<<"$out" | grep -v WARN | head -20; echo "$out" | tail -40; exit 1; }

lint:
    cargo fmt --check
    cargo clippy --workspace -- -D warnings
    cd src/ui && npx ng build --configuration development
    cd src/ui && npx prettier --check .
    cd tests/e2e && npx prettier --check .
    cd docs/user && npx prettier --check .

contract:
    cargo run -q -p relief-model --bin write-contract -- docs/contract
    cargo run -q -p relief-rules --bin write-config-schema -- docs/contract
    cargo run -q -p relief-app --bin write-rules-contract -- docs/contract
    cd src/ui && node scripts/generate-contract.mjs
    cd src/ui && npx prettier --write src/app/core/models/contract.ts scripts/generate-contract.mjs

fixture name dir:
    cargo run -q -p relief-fixtures -- build {{name}} {{dir}}

# User docs with hot reload (port 4321, base /docs)
docs-dev:
    npm --prefix docs/user run dev

# Static build of the user docs (docs/user/dist, embedded in the app)
docs-build:
    npm --prefix docs/user run build

# Regenerate the doc screenshots on acme-shop with WebdriverIO on the app (optionally one page, e.g. getting-started)
docs-shots page="":
    #!/usr/bin/env bash
    set -euo pipefail
    cargo build --release -p relief-fixtures
    npm --prefix src/ui run build
    cargo build --release -p relief-desktop --features custom-protocol
    cd docs/user
    if command -v xvfb-run >/dev/null; then
        GDK_BACKEND=x11 xvfb-run -a -s "-screen 0 3840x2160x24" npm run shots -- {{page}}
    else
        npm run shots -- {{page}}
    fi

bench_dir := env_var_or_default("RELIEF_BENCH_DIR", env_var("HOME") / "dev/relief-bench")

# Real-repository benchmarks (release build): clones excalidraw and n8n once, then prints one line per measure
bench:
    #!/usr/bin/env bash
    set -euo pipefail
    cargo build --release -q -p relief-bench
    bench() { # name url sha range
        local dir="{{bench_dir}}/$1"
        if [ ! -d "$dir/.git" ]; then
            mkdir -p "{{bench_dir}}"
            git clone --depth 400 --single-branch "$2" "$dir"
            git -C "$dir" checkout -q "$3"
        fi
        echo "== $1 @ $(git -C "$dir" rev-parse HEAD)"
        target/release/relief-bench "$dir" "$4"
    }
    bench excalidraw https://github.com/excalidraw/excalidraw 2c3dcc06ec807e81ab9437eceb1a8f7a3c590743 8fd970320e1d754d1c76bc31abc440b9d88aafab..47cbb5b6fbeba23fbdfb72729159d723f1176746
    bench n8n https://github.com/n8n-io/n8n b12dbc37be53b1d0e151de30debc0a4281502a9c ce38a064e6d26545108b14c3895d276118c8277e..fea1ec010611045cea92f0e7fecdf2f59e79618b

# Checks the .deb, the AppImage and the Arch PKGBUILD in target/release/bundle/ (run just package first)
package-check:
    scripts/check-packages.sh

# Tests install.sh: dry-run on the 3 OS, --help, no docker (fast). RELIEF_INSTALL_CHECK_FULL=1: real Docker install in a temp HOME. RELIEF_INSTALL_CHECK_WINDOWS=1: Windows cross-build
install-check:
    scripts/test-install.sh

# Linux packages (.deb and AppImage) in target/release/bundle/: UI, embedded docs, then the Tauri bundler
package: docs-build
    #!/usr/bin/env bash
    set -euo pipefail
    npm --prefix src/ui run build
    rm -rf src/ui/dist/relief/browser/docs
    cp -r docs/user/dist src/ui/dist/relief/browser/docs
    # The tauri CLI finds tauri.conf.json under the current folder
    cd src/interfaces/relief-desktop
    # linuxdeploy (AppImage) ships an old strip that fails on recent binaries: keep the symbols
    NO_STRIP=true npx --prefix ../../ui tauri build
    cd - >/dev/null
    find target/release/bundle -type f \( -name '*.deb' -o -name '*.AppImage' \) -exec du -h {} +
