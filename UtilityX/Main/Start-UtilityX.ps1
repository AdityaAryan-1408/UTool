param(
    [switch]$BuildOnly
)

$ErrorActionPreference = 'Stop'
$mainDir = $PSScriptRoot
$uiDir = Join-Path $mainDir 'spikes\spike-tauri-baseline'
$manifestPath = Join-Path $mainDir 'crates\winutilx-task1\Cargo.toml'
$exePath = Join-Path $mainDir 'target\debug\winutilx-task1.exe'
$statePath = [System.IO.Path]::GetFullPath((Join-Path $mainDir '..\plan\CURRENT-STATE.md'))

$launchablePaths = @(
    (Join-Path $mainDir 'WinUtilX.exe'),
    $exePath
)
$running = Get-Process -Name winutilx-task1,WinUtilX -ErrorAction SilentlyContinue |
    Where-Object {
        $processPath = $_.Path
        $processPath -and ($launchablePaths | Where-Object { $_ -ieq $processPath })
    }
foreach ($process in $running) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -Timeout 5 -ErrorAction SilentlyContinue
}

Push-Location $uiDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

$previousTargetDir = $env:CARGO_TARGET_DIR
$env:CARGO_TARGET_DIR = Join-Path $mainDir 'target'
try {
    cargo build --manifest-path $manifestPath
    $cargoExitCode = $LASTEXITCODE
}
finally {
    $env:CARGO_TARGET_DIR = $previousTargetDir
}
if ($cargoExitCode -ne 0) {
    throw "Native build failed with exit code $cargoExitCode."
}
if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Build completed without producing the expected executable: $exePath"
}

$buildTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
$state = Get-Content -LiteralPath $statePath -Raw
$state = $state -replace '(?m)^- Build status:.*$', "- Build status: successful ($buildTime)."
$state = $state -replace '(?m)^- Last successful build:.*$', "- Last successful build: $buildTime"
$state = $state -replace '(?m)^- Executable:.*$', '- Executable: UtilityX/Main/target/debug/winutilx-task1.exe'
Set-Content -LiteralPath $statePath -Value $state -Encoding utf8

Write-Host "Built current UtilityX app: $exePath"
Write-Host "State recorded in: $statePath"

if ($BuildOnly) {
    exit 0
}

$started = Start-Process -FilePath $exePath -WorkingDirectory $mainDir -PassThru
Write-Host "Started UtilityX from the current build (PID $($started.Id))."
