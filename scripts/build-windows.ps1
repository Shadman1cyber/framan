<#Requires -Version 3.0>
<#
.SYNOPSIS
  Build the universal Cafe 13 desktop installer for Windows 7 / 8.1 / 10 / 11.

.DESCRIPTION
  Run on the Windows machine (or CI). Installs Node deps and produces:
    dist-desktop\Cafe13-Desktop-<version>-x64.exe      (NSIS installer)

.PARAMETER Arch
  x64 (Windows x64 desktop runtime).

.EXAMPLE
  .\scripts\build-windows.ps1
#>
param(
  [ValidateSet('x64')]
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

Info "Building installer ($Arch)..."
node scripts/build-desktop.cjs --arch=$Arch

Info 'Done. Artifacts:'
Get-ChildItem dist-desktop\*.exe | ForEach-Object { Write-Host "  $($_.Name)" }
