param(
    [switch]$IncludeMsi
)

$ErrorActionPreference = 'Stop'

$mainDir = $PSScriptRoot
$uiDir = Join-Path $mainDir 'spikes\spike-tauri-baseline'
$crateDir = Join-Path $mainDir 'crates\winutilx-task1'
$configPath = Join-Path $crateDir 'tauri.conf.json'
$tauriConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$version = [string]$tauriConfig.version
if ($version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw "Tauri config has an invalid semantic version: '$version'"
}

$binaryName = "Ollumi_$version"
$overlayPath = Join-Path ([System.IO.Path]::GetTempPath()) "ollumi-tauri-config-$PID.json"
$overlayJson = @{ mainBinaryName = $binaryName } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($overlayPath, $overlayJson, [System.Text.UTF8Encoding]::new($false))

$previousTargetDir = $env:CARGO_TARGET_DIR
$env:CARGO_TARGET_DIR = Join-Path $mainDir 'target'
try {
    Push-Location $uiDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE." }
    }
    finally { Pop-Location }

    Push-Location $crateDir
    try {
        $bundles = @('nsis')
        if ($IncludeMsi) { $bundles += 'msi' }
        $buildArgs = @('tauri', 'build', '--config', $overlayPath, '--bundles') + $bundles
        cargo @buildArgs
        if ($LASTEXITCODE -ne 0) { throw "Tauri release build failed with exit code $LASTEXITCODE." }
    }
    finally { Pop-Location }
}
finally {
    $env:CARGO_TARGET_DIR = $previousTargetDir
    Remove-Item -LiteralPath $overlayPath -ErrorAction SilentlyContinue
}

$releaseExe = Join-Path $mainDir "target\release\$binaryName.exe"
$nsisInstaller = Join-Path $mainDir "target\release\bundle\nsis\Ollumi_${version}_x64-setup.exe"
if (-not (Test-Path -LiteralPath $releaseExe -PathType Leaf)) {
    throw "Build completed without producing the expected versioned executable: $releaseExe"
}
if (-not (Test-Path -LiteralPath $nsisInstaller -PathType Leaf)) {
    throw "Build completed without producing the expected NSIS installer: $nsisInstaller"
}

Write-Host "Built Ollumi ${version}: $releaseExe"
Write-Host "NSIS installer: $nsisInstaller"
if ($IncludeMsi) {
    $msiInstaller = Join-Path $mainDir "target\release\bundle\msi\Ollumi_${version}_x64_en-US.msi"
    if (-not (Test-Path -LiteralPath $msiInstaller -PathType Leaf)) { throw "Expected MSI installer was not produced: $msiInstaller" }
    Write-Host "MSI installer: $msiInstaller"
}
