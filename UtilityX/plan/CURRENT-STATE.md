# UtilityX current state

Last updated: 2026-10-20

## Source of truth

- Active workspace: `UtilityX/Main`
- Native application source: `UtilityX/Main/crates/winutilx-task1`
- UI source: `UtilityX/Main/spikes/spike-tauri-baseline/src-ui`
- UI build project: `UtilityX/Main/spikes/spike-tauri-baseline`
- Supported build and launch entry point: `UtilityX/Main/Start-UtilityX.ps1`
- Authoritative built executable: `UtilityX/Main/target/debug/winutilx-task1.exe`

The `spike-tauri-baseline` folder name is historical. Its React UI is the frontend consumed by the native `winutilx-task1` Tauri app, as configured in `crates/winutilx-task1/tauri.conf.json`.

## Launch rules

- Use `Start-UtilityX.ps1` (or `Run-WinUtilX.bat`, which delegates to it). It rebuilds the frontend and native app before starting the authoritative executable.
- The launcher pins Cargo's target directory to `UtilityX/Main/target`, keeping builds and the authoritative executable inside the active workspace.
- Do not start `UtilityX/Main/WinUtilX.exe` directly. It is a copied executable and can become stale; it is retained for now and is not the source of truth.
- The separate `WinUtilX` directory at the workspace root is an older copy and is not part of the active app.

## Latest build

- Frontend production build and native `cargo build -p winutilx-task1` succeeded after the Clipboard implementation.
- Last successful full build: 2026-10-20.
- Executable: UtilityX/Main/target/debug/winutilx-task1.exe

## Change log

- 2026-10-14: Established the canonical source paths and launcher workflow to prevent stale executable launches.
- 2026-10-14: Switched the UI to AMOLED black with neon-white accents and synchronized native hit-region motion with the notch animation.
- 2026-10-20: Fixed Shelf drag-out to start native Windows file dragging after pointer movement, added native notch drop-to-Shelf routing, Ctrl+V file import, ZIP retest readiness, and three-day automatic expiry through a Windows scheduled task. Manual remove/clear remain available. Frontend and native builds succeeded; canonical app is running for user retest.
- 2026-10-20: Replaced the Shelf drag source's hand-built file IDataObject with a Windows Shell-created object; changed Download to use Windows Save As; added a button to open the Shelf storage folder. Browser URL pasting still does not start network downloads; clipboard import currently accepts local file paths.
- 2026-10-20: Moved Today to the first tab and Shelf to second. Replaced static Today tasks/week/appointment/weather values with saved, date-based tasks, a dynamic week strip, a persistent 25/50-minute focus timer, configurable current weather by city, and a persistent quick note that clears on request and is replaced by pasted text.
- 2026-10-20: Replaced Clipboard mock items with automatic local text/image capture, copy-again/delete/clear actions, a one-minute recent-copy queue visible across tabs, and Ctrl+Shift+V batch paste oldest-to-newest. Clipboard focus mode keeps copy controls non-activating and allows a temporary focus mode for search. Frontend and native builds succeeded; UtilityX is running as PID 2336 for queue verification.







## Runtime status

- Server status: running from the canonical launcher for the user's Clipboard queue verification (PID 2336).
- Running process: PID 28568, `UtilityX/Main/target/debug/winutilx-task1.exe`.
- 2026-10-20: Removed the Shelf drag-out button, frontend handler, native command, and drag implementation at the user's direction. Copy, Save As, and Delete remain available. Frontend and native builds succeeded; relaunching for manual retest.
- 2026-10-20: Follow-up Shelf retest fixes: use a Shell-created data object and non-canonical AppData path for drag-out; add Save As and Shelf Location actions; capture pasted image data from web pages. Pasting a URL does not start a network download.

- 2026-10-14: Stopped the UtilityX server at the user's request; no other project instances were targeted.



- 2026-10-14: Rebuilt the Controls tab from a config-driven registry with animated inline Wi-Fi, Bluetooth, and audio sheets, interactive demo toggles/sliders/media controls, and monochrome range styling. Device discovery, connectivity, system audio routing, brightness, and media data remain demo-only; native integration is pending.



- 2026-10-14: Fixed the white flash on the transparent notch window by enabling Tauri's Windows noRedirectionBitmap option and explicitly setting the root WebView surface to transparent. Frontend and native builds succeeded; UtilityX restarted as PID 27676.




- 2026-10-14: Stopped UtilityX at the user's request (PID 27676). The next planned work is real Controls tab functionality.

- 2026-10-15: Added the first native Controls integrations: persistent Keep-Awake on a dedicated worker thread, display brightness through Windows WMI, master volume and speaker/microphone mute through Core Audio, and global media transport key actions. The Controls UI now invokes these native handlers and displays bridge errors; unsupported quick toggles are disabled instead of changing only local state. Frontend and native builds succeeded. Runtime behavior has not yet been manually checked.
- Still pending from `CONTROLS-SPEC.md`: Wi-Fi radio/scan/connect, Bluetooth radio/discovery/pair/connect, audio endpoint enumeration/routing, mobile hotspot, and Night Light. Wi-Fi and Bluetooth sheets still contain demo data, so do not treat those sheets as real controls yet.
- 2026-10-15: After the user reported failed brightness, laggy volume, console flashes, and a taskbar icon, corrected brightness to call `WmiSetBrightness` through `Invoke-CimMethod`, replaced per-action PowerShell/Core Audio compilation with in-process COM calls, suppressed the remaining hidden PowerShell host window, and reapplied `skip_taskbar` after the overlay is shown. Frontend/native build succeeded. The app remains stopped; these runtime fixes still need the user's visual/device verification.

- 2026-10-15: Replaced the mock lofi hover card and static media panel with Windows GSMTC session metadata and transport controls; the compact media card appears only for a playing session. Brightness writes now tolerate a missing WMI `ReturnValue` (which previously produced a false error after applying the change), return Windows' readback value, and the Controls tab polls brightness every 2.2 seconds while avoiding slider drags. Frontend/native build succeeded. Canonical app is running as PID 20708 from `UtilityX/Main/target/debug/winutilx-task1.exe` for user verification.
- 2026-10-15: Fixed missing browser audio detection. GSMTC metadata is preferred when available; because its session manager requires the `globalMediaControl` package capability and the development executable is unpackaged, added Core Audio active-session detection plus a process/window-title fallback and media-key transport fallback. Compact hover now follows actual active audio sessions, and browser window titles can supply track context when GSMTC is unavailable. Canonical app rebuilt and running as PID 24476 from `UtilityX/Main/target/debug/winutilx-task1.exe` for user verification.

- 2026-10-15: Removed all media detection, media-session polling, hover media UI, and expanded media transport controls at the user's direction. Hover now only displays the selected system statistics. Replaced the Controls tab media panel with buttons that open Windows Display and Sound settings. Frontend/native build succeeded; canonical app is running as PID 24696 from `UtilityX/Main/target/debug/winutilx-task1.exe`.

- 2026-10-20: Moved Shelf to the first tab and Controls to second-last. Implemented persistent per-item Shelf storage under the app's local app-data folder, restore on app start, native Windows file drag-out, open with the system default app, reveal in Explorer, copy-file-to-clipboard for pasting into other apps, download, remove, clear, WebP conversion, and ZIP creation. Frontend production build and native `cargo check` succeeded. The app has not been launched for runtime testing; the user will verify the features manually.






















