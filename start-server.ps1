[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CastleRoot,

    [ValidateRange(1, 65535)]
    [int]$Port = 8080,

    [string]$ListenAddress = '0.0.0.0'
)

$ErrorActionPreference = 'Stop'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js is not installed or node.exe is not available in PATH. Install Node.js LTS, reopen PowerShell, and try again.'
}

$nodeVersionText = (& $nodeCommand.Source --version).Trim().TrimStart('v')
$nodeVersion = [version]$nodeVersionText
if ($nodeVersion.Major -lt 20) {
    throw "Node.js 20 or newer is required. Installed version: $nodeVersionText"
}

if ($CastleRoot.StartsWith('\\') -or $CastleRoot.StartsWith('//')) {
    throw 'CastleRoot must be a local path on PC #2, not an SMB UNC path.'
}

$resolvedRoot = Resolve-Path -LiteralPath $CastleRoot -ErrorAction Stop
if ($resolvedRoot.Provider.Name -ne 'FileSystem' -or -not (Test-Path -LiteralPath $resolvedRoot.Path -PathType Container)) {
    throw 'CastleRoot must be an existing local filesystem directory.'
}
if ($resolvedRoot.Path.StartsWith('\\')) {
    throw 'The resolved CastleRoot is a UNC path. Use the actual local path on PC #2.'
}

$serverScript = Join-Path $PSScriptRoot 'server.js'
if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
    throw "server.js was not found beside start-server.ps1: $serverScript"
}

Write-Host "Starting Castle with local root: $($resolvedRoot.Path)"
Write-Host "Listen address: $ListenAddress"
Write-Host "Port: $Port"
Write-Host 'Press Ctrl+C to stop the server.'

& $nodeCommand.Source $serverScript --root $resolvedRoot.Path --host $ListenAddress --port $Port
exit $LASTEXITCODE
