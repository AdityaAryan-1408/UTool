# Ollumi — GitHub Release & Packaging Guide

This guide walks through how to package **Ollumi** into a standalone Windows installer (`.exe`) and publish it to GitHub Releases so users can download, install, and run it with a single click.

---

## Overview: What Users Receive

Tauri generates standalone, production-ready Windows installers out of the box:
* **`Ollumi_x.x.x_x64-setup.exe` (NSIS Installer)**: Standard setup wizard. Installs the application, creates Start Menu and Desktop shortcuts, registers the uninstaller in Windows Settings, and launches Ollumi. **(Recommended default for distribution)**
* **`Ollumi_x.x.x_x64_en-US.msi` (MSI Package)**: Windows Installer package designed for enterprise deployment.
* **`Ollumi.exe` (Portable Binary)**: Self-contained executable requiring no installation.

---

## Step 1: Verify Build Configuration

Make sure your `tauri.conf.json` in `UtilityX/Main/crates/winutilx-task1/tauri.conf.json` has bundling enabled:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Ollumi",
  "version": "0.1.0",
  "identifier": "com.ollumi.desktop",
  "build": {
    "frontendDist": "../../spikes/spike-tauri-baseline/dist"
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  },
  "app": {
    "windows": [
      {
        "title": "Ollumi",
        "label": "main",
        "url": "index.html",
        "width": 880,
        "height": 72,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "resizable": false
      }
    ]
  }
}
```

> [!TIP]
> Setting `"installMode": "currentUser"` allows users to install the app into their local user directory without requiring Administrator / UAC elevation prompts.

---

## Step 2: Build the Production Release Locally

Run the following commands in PowerShell from the project root:

### 1. Build the React Frontend
```powershell
cd "d:\Aditya\Code\Projects\UTool\UtilityX\Main\spikes\spike-tauri-baseline"
npm install
npm run build
```
*Output: Production static assets compiled into `dist/`.*

### 2. Build the Tauri Native Binary & Windows Installer
```powershell
cd "d:\Aditya\Code\Projects\UTool\UtilityX\Main\crates\winutilx-task1"
cargo tauri build
```
*(If the Tauri CLI is not installed globally, install it once via `cargo install tauri-cli --version "^2.0.0"` or run `npx @tauri-apps/cli build`).*

This command automatically:
1. Strips and optimizes the Rust binary with release profile settings.
2. Embeds the frontend bundle directly inside the executable.
3. Generates the NSIS installer executable.

---

## Step 3: Locate the Compiled Binaries

When compilation finishes, your build artifacts will be located in:
```
UtilityX/Main/target/release/
```

Key output files:
* **NSIS Setup Installer**:
  `target/release/bundle/nsis/Ollumi_0.1.0_x64-setup.exe`
* **MSI Installer**:
  `target/release/bundle/msi/Ollumi_0.1.0_x64_en-US.msi`
* **Portable Executable**:
  `target/release/Ollumi.exe`

---

## Step 4: Publish to GitHub Releases

### 1. Tag the Release in Git
```powershell
git add .
git commit -m "chore: release v0.1.0"
git tag v0.1.0
git push origin main --tags
```

### 2. Create the GitHub Release
1. Open your repository on [GitHub](https://github.com).
2. Click on **Releases** on the right side of the repository home page.
3. Click **Draft a new release**.
4. In **Choose a tag**, select `v0.1.0`.
5. Enter a **Release title** (e.g. `Ollumi v0.1.0 — Desktop Companion`).
6. Add release notes describing the features.
7. Under **Attach binaries by dropping them here or selecting them**, upload:
   - `Ollumi_0.1.0_x64-setup.exe` (Primary installer)
   - `Ollumi.exe` (Optional standalone portable version)
8. Click **Publish release**.

---

## Step 5: Windows SmartScreen User Notice

> [!IMPORTANT]
> **Why SmartScreen Appears**:
> Windows Defender SmartScreen shows an alert on newly released executables that are not signed with a paid Extended Validation (EV) certificate ($300+/year).
>
> Users will see:
> *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

### User Instructions for your README / Release Notes
Add this note to your release page so users know how to proceed:

```markdown
### ⚠️ Note on Windows SmartScreen
When opening the installer for the first time, Windows Defender may show a warning:
1. Click **"More info"**.
2. Click **"Run anyway"**.

Ollumi is 100% open-source, local-first, and builds directly from this public repository.
```

---

## Step 6: Automated CI/CD with GitHub Actions (Optional)

To have GitHub automatically compile and publish `.exe` installers whenever you push a version tag, create `.github/workflows/release.yml`:

```yaml
name: Release Ollumi

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    runs-on: windows-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Install Frontend Dependencies & Build
        working-directory: UtilityX/Main/spikes/spike-tauri-baseline
        run: |
          npm ci
          npm run build

      - name: Build Tauri Binary & Publish Release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          projectPath: UtilityX/Main/crates/winutilx-task1
          tagName: ${{ github.ref_name }}
          releaseName: 'Ollumi ${{ github.ref_name }}'
          releaseDraft: false
          prerelease: false
```
