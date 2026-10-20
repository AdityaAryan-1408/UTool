# Legacy entry point retained for existing shortcuts. Always use the canonical
# build and launch flow so this shortcut cannot start a stale copied executable.
& (Join-Path $PSScriptRoot 'Start-UtilityX.ps1') @args
exit $LASTEXITCODE
