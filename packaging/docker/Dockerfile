# Build image for `install.sh` (Linux AppImage and Windows NSIS cross-build).
# Ubuntu 22.04 on purpose: glibc 2.35, so the AppImage runs on most current distributions.
#   docker build -f packaging/docker/Dockerfile --target linux   -t relief-build:linux   packaging/docker
#   docker build -f packaging/docker/Dockerfile --target windows -t relief-build:windows packaging/docker
FROM ubuntu:22.04 AS linux
ARG DEBIAN_FRONTEND=noninteractive
ARG RUST_VERSION=1.98.0
ARG NODE_VERSION=22.23.5

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl file git patchelf pkg-config xz-utils \
      libwebkit2gtk-4.1-dev libgtk-3-dev libssl-dev libxdo-dev librsvg2-dev \
      libayatana-appindicator3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
    && rm -rf /var/lib/apt/lists/*

# Node from the official archive (Ubuntu 22.04 ships an old one)
RUN arch=$(dpkg --print-architecture); case "$arch" in amd64) n=x64;; arm64) n=arm64;; *) n=$arch;; esac \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${n}.tar.xz" | tar -xJ -C /usr/local --strip-components=1

# Rust, installed once in the image (read-only for the build user)
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo
ENV PATH=/opt/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain ${RUST_VERSION} -c rustfmt -c clippy \
    && chmod -R a+rX /opt/rustup /opt/cargo

# Caches live in named volumes mounted on /cache; the directory is world-writable so that the
# container can run with the uid/gid of the host user.
ENV HOME=/cache/home CARGO_HOME=/cache/cargo npm_config_cache=/cache/npm XWIN_CACHE_DIR=/cache/xwin
RUN mkdir -p /cache /work && chmod 1777 /cache /work
COPY build.sh /usr/local/bin/relief-build
RUN chmod 755 /usr/local/bin/relief-build
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/relief-build"]

FROM linux AS windows
ARG CARGO_XWIN_VERSION=0.18.0
RUN apt-get update && apt-get install -y --no-install-recommends nsis lld llvm clang \
    && rm -rf /var/lib/apt/lists/*
RUN rustup target add x86_64-pc-windows-msvc \
    && CARGO_HOME=/opt/cargo cargo install --locked cargo-xwin --version ${CARGO_XWIN_VERSION} \
    && chmod -R a+rX /opt/rustup /opt/cargo
