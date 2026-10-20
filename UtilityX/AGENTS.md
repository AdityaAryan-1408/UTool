# UtilityX workspace rules

- All application changes belong under this `UtilityX` directory. The only active app workspace is `Main`.
- `Main/crates/winutilx-task1` contains the native Tauri application.
- `Main/spikes/spike-tauri-baseline/src-ui` contains the React UI used by that app. The folder name is historical; it is the current UI source.
- Do not edit or launch the sibling `UTool/Test` or `UTool/WinUtilX` copies unless the user explicitly asks. If these folders are not present that means they are deleted.
- Do not launch a copied `.exe` directly. Use `Main/Start-UtilityX.ps1`, which builds the UI and native app before launch.
- After changing app source, update `plan/CURRENT-STATE.md` with changed areas and build state. The launcher records each successful build there.
- Keep previous folders and their contents unless the user confirms they can be removed.
