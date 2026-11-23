# Builds relief from the current checkout and installs it for the current user (Windows).
# No admin rights: the NSIS installer runs in currentUser mode. See -Help.
param(
  [switch]$DryRun,
  [switch]$Uninstall,
  [switch]$AcceptMsvcLicense,
  [switch]$Help
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Die($msg) { [Console]::Error.WriteLine("error: $msg"); exit 1 }

if ($Help) {
  @'
Usage: .\install.ps1 [-DryRun] [-Uninstall] [-AcceptMsvcLicense] [-Help]

Builds relief from this checkout (uncommitted changes included) in Docker
(cargo-xwin, NSIS) and installs it silently for the current user in
%LOCALAPPDATA%\relief. No admin rights are needed or used.

  -DryRun              print the detected OS and each step, build and install nothing
  -Uninstall           remove what the installation put in place
  -AcceptMsvcLicense   accept the Microsoft MSVC/Windows SDK license that cargo-xwin
                       downloads (otherwise you are asked)
  -Help                show this help

Same behavior as install.sh (--dry-run, --uninstall, --accept-msvc-license, --help).
'@ | Write-Output
  exit 0
}

$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME 'AppData/Local' }
$appDir = (Join-Path $localAppData 'relief') -replace '\\', '/'
$arch = switch ($env:PROCESSOR_ARCHITECTURE) {
  { $_ -in 'AMD64', 'x86_64' } { 'x86_64' }
  { $_ -in 'ARM64', 'aarch64' } { 'aarch64' }
  default { if ($env:PROCESSOR_ARCHITECTURE) { $env:PROCESSOR_ARCHITECTURE } else { 'x86_64' } }
}

if ($Uninstall) {
  $un = Join-Path $appDir 'uninstall.exe'
  if (Test-Path $un) {
    if ($DryRun) { Write-Output "would remove: $appDir"; exit 0 }
    # the NSIS uninstaller copies itself and returns at once: wait for the install folder to empty
    Start-Process -FilePath $un -ArgumentList '/S' -Wait | Out-Null
    $i = 0
    while ((Test-Path (Join-Path $appDir 'relief.exe')) -and $i -lt 60) { Start-Sleep -Seconds 1; $i++ }
    if (Test-Path (Join-Path $appDir 'relief.exe')) { Die 'the uninstaller did not finish within 60 s' }
    Write-Output "removed: $appDir"
  } else {
    Write-Output "nothing to remove in $appDir"
  }
  exit 0
}

$branch = 'unknown'; $commit = 'unknown'
function Get-GitInfo {
  $script:branch = (& git -C $root rev-parse --abbrev-ref HEAD 2>$null)
  $script:commit = (& git -C $root rev-parse --short=9 HEAD 2>$null)
  if (& git -C $root status --porcelain 2>$null) { $script:commit = "$($script:commit) dirty" }
}
Get-GitInfo

$buildOnly = $env:RELIEF_INSTALL_BUILD_ONLY -eq '1'

if ($DryRun) {
  Write-Output 'os: windows'
  Write-Output "arch: $arch"
  Write-Output "branch: $branch"
  Write-Output "commit: $commit"
  Write-Output 'step: msvc-license'
  Write-Output 'step: docker-build'
  if (-not $buildOnly) { Write-Output 'step: run-installer' }
  Write-Output "install: $appDir"
  exit 0
}

Write-Output "building: $branch @ $commit"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Die 'docker not found in PATH. Install Docker Desktop and start it, then run this script again.'
}
$daemonOk = $false
try { & docker info *> $null; $daemonOk = ($LASTEXITCODE -eq 0) } catch { $daemonOk = $false }
if (-not $daemonOk) { Die 'docker is installed but its daemon is not reachable. Start Docker Desktop and run this script again.' }

if (-not $AcceptMsvcLicense) {
  Write-Output 'The Windows build downloads the Microsoft Visual C++ runtime and the Windows SDK'
  Write-Output "(through cargo-xwin). They are covered by Microsoft's license:"
  Write-Output '  https://go.microsoft.com/fwlink/?LinkId=2086102'
  $answer = 'n'
  if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    $answer = Read-Host 'Do you accept this license? [y/N]'
  }
  if ($answer -notmatch '^(y|yes)$') { Die 'MSVC license not accepted; run again with -AcceptMsvcLicense to accept it' }
}

& docker build -q -f (Join-Path $root 'packaging/docker/Dockerfile') --target windows -t relief-build:windows (Join-Path $root 'packaging/docker') | Out-Null
if ($LASTEXITCODE -ne 0) { Die 'docker image build failed' }
New-Item -ItemType Directory -Force (Join-Path $root 'target') | Out-Null
# the MSVC license was accepted by the user (prompt or -AcceptMsvcLicense) before this point
& docker run --rm -e XWIN_ACCEPT_LICENSE=1 -v "${root}:/src:ro" -v "$(Join-Path $root 'target'):/out" `
  -v relief-build-cache:/cache -v relief-build-work:/work relief-build:windows windows
if ($LASTEXITCODE -ne 0) { Die 'the build in Docker failed' }

$setup = Get-ChildItem (Join-Path $root 'target/x86_64-pc-windows-msvc/release/bundle/nsis') -Filter '*-setup.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $setup) { Die 'no NSIS installer was produced' }
if ($buildOnly) { Write-Output "built: $($setup.FullName)"; exit 0 }

# per-user NSIS install: no elevation
$p = Start-Process -FilePath $setup.FullName -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { Die 'the installer failed' }
Get-GitInfo
Write-Output "built: $branch @ $commit"
Write-Output "installed: $(Join-Path $appDir 'relief.exe')"
# relief.exe is a GUI program: it prints nothing in a console, so no --version here
$onPath = ($env:PATH -split ';') | Where-Object { $_.TrimEnd('\','/') -eq ($appDir -replace '/', '\').TrimEnd('\') }
if (-not $onPath) {
  Write-Output "note: $appDir is not in your PATH. To run relief from a terminal, run:"
  Write-Output "  [Environment]::SetEnvironmentVariable('Path', `"$($appDir -replace '/', '\');`" + [Environment]::GetEnvironmentVariable('Path','User'), 'User')"
}
