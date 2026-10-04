# Builds Betelgeuse from source and runs its installer (Windows).
#
#   git clone https://github.com/devian-labs/betelgeuse; cd betelgeuse; .\scripts\install.ps1
#
# Prerequisites: Node.js 20+, Rust (https://rustup.rs) and the "Desktop development with C++"
# workload from Visual Studio Build Tools. WebView2 ships with Windows 10 and 11.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "x $cmd is missing. $hint" -ForegroundColor Red; exit 1 }
  Write-Host "ok $cmd" -ForegroundColor Green
}
Need git "Install it from https://git-scm.com"
Need node "Install Node.js 20 or newer from https://nodejs.org"
Need cargo "Install Rust from https://rustup.rs"

npm ci --no-audit --no-fund
npm --prefix mcp ci --no-audit --no-fund
npx tauri build --bundles nsis

$installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Select-Object -First 1
if (-not $installer) { Write-Host "Build finished but no installer was found." -ForegroundColor Red; exit 1 }
Write-Host "Running $($installer.Name)..."
Start-Process $installer.FullName -Wait
