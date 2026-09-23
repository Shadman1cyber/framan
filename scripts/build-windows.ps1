<#Requires -Version 3.0>
<#
.SYNOPSIS
  Build the universal Cafe 13 desktop installer for Windows 7 / 8.1 / 10 / 11.

.DESCRIPTION
  Run on the Windows machine (or CI). Installs Node deps and produces:
    dist-desktop\Cafe13-Desktop-<version>-x64.exe      (NSIS installer)
    dist-desktop\Cafe13-Desktop-<version>-ia32.exe     (NSIS installer, 32-bit Win7)
    dist-desktop\Cafe13-Desktop-<version>-portable-*.exe (no-install)

.PARAMETER Arch
  x64 (default), ia32, or all (both).

.EXAMPLE
  .\scripts\build-windows.ps1
  .\scripts\build-windows.ps1 -Arch all
#>
param(
  [ValidateSet('x64', 'ia32', 'all')]
  [string]$Arch = 'x64'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Info($m) { Write-Host ">> $m" -ForegroundColor Green }
function Fail($m) { Write-Host "XX $m" -ForegroundColor Red; exit 1 }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Node.js not found. Install Node 20 LTS: https://nodejs.org'
}
Info "Node $(node --version)"

if (-not (Test-Path 'node_modules')) {
  Info 'Installing dependencies (npm ci)...'
  npm ci
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

if ($Arch -eq 'all') {
  Info 'Building universal installers (x64 + ia32)...'
  npx electron-builder --win nsis portable --x64 --ia32
} else {
  Info "Building installer ($Arch)..."
  npx electron-builder --win nsis portable --$Arch
}

Info 'Done. Artifacts:'
Get-ChildItem dist-desktop\*.exe | ForEach-Object { Write-Host "  $($_.Name)" }
