use serde::{Deserialize, Serialize};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::process::Command;
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

#[derive(Deserialize, Serialize)]
pub struct InstalledApp {
    id: String,
    name: String,
    launchable: bool,
    icon: Option<String>,
}

const APP_LIST_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing

function Convert-ImageToIconData([System.Drawing.Image]$source) {
    if ($null -eq $source) { return $null }
    $bitmap = [System.Drawing.Bitmap]::new(48, 48)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $stream = [System.IO.MemoryStream]::new()
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($source, 0, 0, 48, 48)
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        return 'data:image/png;base64,' + [Convert]::ToBase64String($stream.ToArray())
    } finally {
        $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
    }
}

function Get-ExeIconData([string]$path) {
    if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    try {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
        if ($null -eq $icon) { return $null }
        try { $image = $icon.ToBitmap(); try { return Convert-ImageToIconData $image } finally { $image.Dispose() } }
        finally { $icon.Dispose() }
    } catch { return $null }
}

function Get-ImageFileIconData([string]$path) {
    if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    try { $image = [System.Drawing.Image]::FromFile($path); try { return Convert-ImageToIconData $image } finally { $image.Dispose() } }
    catch { return $null }
}

$uninstallKeys = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$uninstallApps = @()
$uninstallByName = @{}
foreach ($keyPath in $uninstallKeys) {
    foreach ($entry in (Get-ItemProperty -Path $keyPath -ErrorAction SilentlyContinue)) {
        $name = ([string]$entry.DisplayName).Trim()
        if (-not $name -or $entry.SystemComponent -eq 1 -or $entry.ParentKeyName) { continue }
        $iconPath = [string]$entry.DisplayIcon
        $exe = $null
        if ($iconPath -match '^\s*"([^"\r\n]+\.exe)"') { $exe = $Matches[1] }
        elseif ($iconPath -match '^\s*(.+?\.exe)(?:,\s*-?\d+)?\s*$') { $exe = $Matches[1].Trim('"') }
        $key = $name.ToLowerInvariant()
        if (-not $uninstallByName.ContainsKey($key)) { $uninstallByName[$key] = [pscustomobject]@{ iconPath=$exe; icon=(Get-ExeIconData $exe) } }
        $uninstallApps += [pscustomobject]@{ name=$name; exe=$exe }
    }
}
$appxPackages = @(Get-AppxPackage -ErrorAction SilentlyContinue)
$appxIcons = @{}
foreach ($package in $appxPackages) {
    try {
        $manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'
        if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
        [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
        $packageFamily = [string]$package.PackageFamilyName
        foreach ($appNode in $manifest.SelectNodes("//*[local-name()='Application']")) {
            $appId = [string]$appNode.GetAttribute('Id')
            $visual = $appNode.SelectSingleNode("./*[local-name()='VisualElements']")
            if ($null -eq $visual) { continue }
            $logo = [string]$visual.GetAttribute('Square44x44Logo')
            if (-not $logo) { $logo = [string]$visual.GetAttribute('Square150x150Logo') }
            if (-not $logo) { continue }
            $logoPath = Join-Path $package.InstallLocation $logo
            if (-not (Test-Path -LiteralPath $logoPath)) {
                $parent = Split-Path -Parent $logoPath
                $stem = [System.IO.Path]::GetFileNameWithoutExtension($logoPath)
                $variant = Get-ChildItem -LiteralPath $parent -Filter ($stem + '*') -File -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1
                if ($variant) { $logoPath = $variant.FullName }
            }
            $data = Get-ImageFileIconData $logoPath
            if ($data) { $appxIcons[($packageFamily + '!' + $appId).ToLowerInvariant()] = $data }
        }
    } catch { }
}

function Get-AppIcon([string]$appId, [string]$name) {
    $key = $name.ToLowerInvariant()
    if ($uninstallByName.ContainsKey($key) -and $uninstallByName[$key].icon) { return $uninstallByName[$key].icon }
    $shortcutPath = $null
    if (Test-Path -LiteralPath $appId -PathType Leaf) { $shortcutPath = $appId }
    if ($shortcutPath -and [System.IO.Path]::GetExtension($shortcutPath) -ieq '.lnk') {
        try {
            $shell = New-Object -ComObject WScript.Shell
            $shortcut = $shell.CreateShortcut($shortcutPath)
            $iconPath = ([string]$shortcut.IconLocation -split ',')[0].Trim('"')
            if (Test-Path -LiteralPath $iconPath -PathType Leaf) { $data = Get-ExeIconData $iconPath; if ($data) { return $data } }
            $data = Get-ExeIconData ([string]$shortcut.TargetPath)
            if ($data) { return $data }
        } catch { }
    }
    if ($appId.Contains('!')) {
        $iconKey = $appId.ToLowerInvariant()
        if ($appxIcons.ContainsKey($iconKey)) { return $appxIcons[$iconKey] }
        $family = $appId.Split('!')[0].ToLowerInvariant()
        $package = $appxPackages | Where-Object { ([string]$_.PackageFamilyName).ToLowerInvariant() -eq $family } | Select-Object -First 1
        if ($package) {
            $exe = Get-ChildItem -LiteralPath $package.InstallLocation -Filter '*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($exe) { return Get-ExeIconData $exe.FullName }
        }
    }
    if ($uninstallByName.ContainsKey($key)) { return $uninstallByName[$key].icon }
    return $null
}

$apps = [System.Collections.Generic.List[object]]::new()
$names = @{}
foreach ($entry in (Get-StartApps)) {
    $name = ([string]$entry.Name).Trim()
    $appId = ([string]$entry.AppID).Trim()
    if (-not $name -or -not $appId) { continue }
    $key = $name.ToLowerInvariant()
    if ($names.ContainsKey($key)) { continue }
    $id = 'start:' + $appId
    $apps.Add([pscustomobject]@{ id=$id; name=$name; launchable=$true; icon=(Get-AppIcon $appId $name) })
    $names[$key] = $true
}
$uninstallApps | Sort-Object -Property @{ Expression = { $_.name }; Ascending = $true } | ForEach-Object {
    $name = $_.name
    $key = $name.ToLowerInvariant()
    if ($names.ContainsKey($key)) { return }
    $exe = $_.exe
    $launchable = $exe -and (Test-Path -LiteralPath $exe -PathType Leaf)
    $id = if ($launchable) { 'exe:' + $exe } else { 'info:' + $name }
    $icon = if ($uninstallByName.ContainsKey($key)) { $uninstallByName[$key].icon } else { $null }
    $apps.Add([pscustomobject]@{ id=$id; name=$name; launchable=[bool]$launchable; icon=$icon })
    $names[$key] = $true
}
$sorted = @($apps | Sort-Object -Property @{ Expression = { $_.name }; Ascending = $true })
ConvertTo-Json -InputObject $sorted -Compress
"#;

#[tauri::command]
pub fn apps_list_installed() -> Result<Vec<InstalledApp>, String> {
    let output = Command::new("powershell.exe")
        .creation_flags(0x08000000)
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", APP_LIST_SCRIPT])
        .output()
        .map_err(|error| format!("Could not read the Windows installed-app list: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() { "Windows could not read the installed-app list.".into() } else { detail });
    }
    let json = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(json.trim()).map_err(|error| format!("Windows returned an invalid installed-app list: {error}"))
}

fn wide(value: &str) -> Vec<u16> {
    std::ffi::OsStr::new(value).encode_wide().chain(Some(0)).collect()
}

#[tauri::command]
pub fn apps_launch_app(id: String) -> Result<(), String> {
    let (target, args) = if let Some(app_id) = id.strip_prefix("start:") {
        if app_id.is_empty() || app_id.chars().any(|ch| ch.is_control()) {
            return Err("This app has an invalid Windows app identifier.".into());
        }
        if std::path::Path::new(app_id).is_file() {
            (app_id.to_string(), None)
        } else {
            ("explorer.exe".to_string(), Some(format!("shell:AppsFolder\\{app_id}")))
        }
    } else if let Some(path) = id.strip_prefix("exe:") {
        let target = std::path::Path::new(path);
        if !target.is_absolute() || !target.is_file() || !target.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("exe")) {
            return Err("Windows could not find this app's launch file.".into());
        }
        (path.to_string(), None)
    } else {
        return Err("This installed item does not have a launch action.".into());
    };

    let operation = wide("open");
    let target_wide = wide(&target);
    let args_wide = args.as_deref().map(wide);
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target_wide.as_ptr(),
            args_wide.as_ref().map_or(std::ptr::null(), |value| value.as_ptr()),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if (result as isize) <= 32 {
        return Err("Windows could not open this app.".into());
    }
    Ok(())
}
