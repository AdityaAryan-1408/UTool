# UtilityX current state

Last updated: 2026-10-29

## 2026-10-29 clipboard, network, and responsiveness hardening

- Circle Search now decodes the `bitmapDataUrl` returned by native screen capture before cropping.
- Clipboard history capture can be paused from the Clipboard tab; saved history is encrypted with the current Windows user DPAPI key, migrated from the prior plaintext format, and limited to 30 days / 500 entries. Standard clipboard privacy markers are honored.
- Batch paste now includes only the newest five items copied in the previous 60 seconds.
- New Wi-Fi profiles are passed to the Native Wi-Fi API in memory instead of a plaintext temporary XML file.
- Wi-Fi scan/status now use the Native Wi-Fi API rather than parsing localized `netsh` output.
- Link previews reject loopback/private/reserved resolved addresses and automatic HTTP redirects.
- Installed-app scans now run on Tauri's blocking worker pool.
- Process CPU percentages now compare process CPU-time deltas against the system CPU-time delta between samples.
- The launcher now treats a denied state-note write as a warning and detects if the app exits during startup.
- Tauri startup build failures and Rust panics are now written to `%TEMP%\UtilityX-startup-error.txt` for diagnosis.
- Frontend production build and native debug build succeeded. The Codex launcher attempt exits with WebView2 `0x800700AA` (resource in use); the user reports the Main `.bat` launcher works, so manual verification should use that launcher.

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

- Most recent full native build: 2026-10-29. The Windows executable embeds the workspace Ollumi icon; the Today hero displays it beside the welcome text. Stats Memory follows the selected accent color. Frontend production and native builds succeeded; app remains stopped at the user's direction.
- Shelf drag-out remains removed at the user's request. Dragging files onto the notch to add them to Shelf works. The user manually launched the latest app via `Run-WinUtilX.bat` and reports it is currently running; the earlier isolated launcher/process checks were not a reliable indication of the user's desktop app state.
- Most recent frontend and native build: 2026-10-28, restored to pushed `9ad5492`. Build succeeded with the existing unused `UnregisterHotKey` warning. The user's manual launch confirms the current version runs; no startup defect has been established.
- Feature 6 Drop Convert was removed from the current app at the user's direction. Dragging files onto the notch still imports them into Shelf; no conversion UI or conversion code remains. The roadmap item is deferred for a future design isolated from the notch hit region.
- Removed the converter overlay entirely after it left the always-on-top window intercepting clicks. The converter now renders inline in Shelf and cannot create a full-window layer.

- The 2026-10-29 native build includes clipboard image previews, Shelf image thumbnails/link previews, in-memory screenshot drafts, the global Ctrl+Shift+X/Ctrl+Alt+X adjustable screen-capture shortcuts, native drag-to-Shelf import, and the Ollumi executable icon. Frontend and native builds succeeded; app remains stopped.
- Latest UI change: Screenshot capture uses an opaque fallback while capture is in progress, preventing the transparent always-on-top app window from showing through. The clipboard history no longer calls an undefined queue timer setter. Native capture now returns a browser-decodable bitmap URL and performs capture work off the WebView thread; the Rectangle/Square selector remains drag-based and displays clearer region-selection guidance.
- Screen capture is launched globally with Ctrl+Shift+X, has no Shelf button, and switches to Shelf with the selected region as a temporary in-memory draft. The capture flow restores focusability when launched from Clipboard, allowing the region selector to receive pointer input.
- Ctrl+Alt+X is registered as an alternate capture shortcut in case Ctrl+Shift+X is already claimed by another application. Settings and Shelf mention both.
- Clipboard image selection previews, Shelf image thumbnails, draggable rectangle/square screen capture with Save/Delete staging, and cached rich link preview cards in Shelf and Clipboard are included in the latest full native build. The user is verifying these features.
- Previous successful full build: 2026-10-21 (startup recovery; PID 17780).
- Executable: UtilityX/Main/target/debug/winutilx-task1.exe

## Change log

- 2026-10-28: Compared latest pushed source (`9ad5492`) with second-last (`e9ed738`) in isolated launcher checks. Those checks reported early process exits, but the user then launched the latest version manually via `Run-WinUtilX.bat` and confirmed it is running with drag-to-Shelf working. The earlier process check was misleading and is not evidence of an app startup defect. Shelf drag-out remains removed at the user's direction.
- 2026-10-28: Removed Feature 6's converter UI, conversion handlers/module, and converter-related notch focus/region state after repeated invisible-window behavior. Kept native drag-to-Shelf import and the browser-side duplicate-import guard. Frontend and native builds succeeded; app remains stopped.

- 2026-10-28: Fixed Shelf file-drop handling so native Tauri imports are not duplicated by the browser drop handler, and imported files no longer auto-open the conversion sheet. Replaced the converter overlay with an inline Shelf panel; opening it now restores focusability and reasserts the native expanded hit region, and blur will not hide the notch while conversion is active. Frontend and native builds succeeded; canonical UtilityX is running as PID 33232 for manual verification.

- 2026-10-27: Replaced the Shelf screenshot button with global Ctrl+Shift+X capture, documented the shortcut in Settings and Shelf, and switch to Shelf after a region is captured. Ensured capture can receive clicks when launched from Clipboard mode. Frontend production and full native builds succeeded; app was not started.
- 2026-10-27: Added Ctrl+Alt+X as a second global screen-capture binding after Ctrl+Shift+X did not trigger for the user. Frontend production build and native `cargo check` succeeded; the running executable has not been rebuilt/restarted with this binding.

- 2026-10-27: Made the screenshot overlay's capture/loading fallback opaque to prevent the notch/app UI from appearing over the desktop while a screenshot is being prepared. Frontend build and native `cargo check` succeeded; app restart remains pending.
- 2026-10-27: Fixed the undefined clipboard queue timer reference and moved screen-capture work off the WebView thread. Native capture now supplies a BMP data URL for asynchronous browser decoding, leaving the UI responsive for dragging a region. Frontend build and native `cargo check` succeeded; app restart remains pending.

- 2026-10-27: Added clipboard image preview from stored Windows DIB data, local image thumbnails in Shelf, temporary adjustable rectangle/square screen captures that remain in memory until explicitly saved or deleted, and cached rich HTTP(S) link previews on Shelf and Clipboard with browser open, clean URL copy, and Archive to Shelf. Marked Future Updates item 5 implemented. Frontend build and native build succeeded (one existing unused `UnregisterHotKey` warning); app remains stopped for manual verification.
- 2026-10-26: Made the Circle Search answer panel draggable from its header and added safe rendering for common Markdown headings, lists, emphasis, inline code, and HTTP(S) links. Frontend production build succeeded; the app was not restarted.
- 2026-10-24: Completed Power tab actions: Lock, Sleep, Restart, Shutdown, and Quit UtilityX. Replaced browser confirmation prompts with themed in-app confirmation dialogs, removed the inaccurate wallpaper-cycle warning, and increased the Power tab height so its Minimize control fits. User close requests still hide the app, while the explicit Quit command exits it. Frontend and native builds succeeded; restarted canonical UtilityX as PID 29740. Power actions remain unverified by design.
- 2026-10-24: Added keyword search for online wallpapers. Searches combine with the selected Wallhaven category, safely encode the query, and cache results by category plus term until Refresh. Frontend and native builds succeeded; restarted canonical UtilityX as PID 16488 for manual verification.
- 2026-10-24: Fixed the Local wallpaper listing to include only supported image files, so cycling settings/state JSON and other non-image files are hidden. Frontend and native builds succeeded; restarted canonical UtilityX as PID 27412 for verification.
- 2026-10-24: Added an Online wallpaper category selector for All, General, Anime, and People. Wallhaven requests now apply the selected category filter, fetched results are cached independently per category until Refresh, and stale responses cannot replace the currently selected category. Frontend and native builds succeeded; canonical app relaunched through `Start-UtilityX.ps1` and is running as PID 26320 for manual verification.

- 2026-10-21: Rebuilt and relaunched canonical UtilityX after the WebView startup failure. Restored `noRedirectionBitmap: true`; set the configured window visible at startup so it does not depend on the frontend visibility command. Confirmed the native process and its UtilityX-specific WebView2 browser, GPU, utility, and renderer processes are running (PID 17780). User reported white side backing during the diagnostic run with `noRedirectionBitmap: false`; transparent-edge verification is pending.
- 2026-10-21: Added Windows app icons and expanded app discovery to AppX manifests and uninstall registry entries, with persisted visual hiding and Restore/rescan. Removed the Stats footer row that crowded the battery card, constrained network error text to its card, and reduced Cloudflare download chunks to 50 MB. Frontend and native builds succeeded; canonical UtilityX is running as PID 24556 for user verification.
- 2026-10-21: Replaced Apps mock data with Windows Start menu and registered installed-app discovery, A–Z filtering, app launching, pinned apps, persistent per-app notes/reminders, and an Android placeholder for future phone-companion support. Frontend and native builds succeeded; the app remains stopped for manual verification.
- 2026-10-14: Established the canonical source paths and launcher workflow to prevent stale executable launches.
- 2026-10-14: Switched the UI to AMOLED black with neon-white accents and synchronized native hit-region motion with the notch animation.
- 2026-10-20: Fixed Shelf drag-out to start native Windows file dragging after pointer movement, added native notch drop-to-Shelf routing, Ctrl+V file import, ZIP retest readiness, and three-day automatic expiry through a Windows scheduled task. Manual remove/clear remain available. Frontend and native builds succeeded; canonical app is running for user retest.
- 2026-10-20: Replaced the Shelf drag source's hand-built file IDataObject with a Windows Shell-created object; changed Download to use Windows Save As; added a button to open the Shelf storage folder. Browser URL pasting still does not start network downloads; clipboard import currently accepts local file paths.
- 2026-10-20: Moved Today to the first tab and Shelf to second. Replaced static Today tasks/week/appointment/weather values with saved, date-based tasks, a dynamic week strip, a persistent 25/50-minute focus timer, configurable current weather by city, and a persistent quick note that clears on request and is replaced by pasted text.
- 2026-10-20: Replaced Clipboard mock items with automatic local text/image capture, copy-again/delete/clear actions, a one-minute recent-copy queue visible across tabs, and Ctrl+Shift+V batch paste oldest-to-newest. Clipboard focus mode keeps copy controls non-activating and allows a temporary focus mode for search. Frontend and native builds succeeded; UtilityX is running as PID 2336 for queue verification.
- 2026-10-20: Replaced Stats mock values with live Windows CPU, memory, 3D GPU counter (when available), system-drive, network traffic, battery, uptime, and top-process data. The connection test now measures TCP latency and jitter. Frontend build and native check succeeded; awaiting canonical full build and manual verification.
- 2026-10-20: Replaced the Stats TCP-only card with download and upload throughput checks, ping, jitter, and active adapter name; removed the bottom-left footer note that overlapped the battery row. After WebView fetch returned `Failed to fetch`, speed measurements moved to native WinHTTP and were set to 30 seconds per direction. Reworked upload requests to fixed-size bodies and exposed native error details. Added a time-based notch greeting with a locally saved customizable name. Frontend/native builds succeeded; UtilityX is running as PID 30704 for manual verification.







## Runtime status

- Server status: stopped at the user's direction.
- Running process: none.
- 2026-10-20: Removed the Shelf drag-out button, frontend handler, native command, and drag implementation at the user's direction. Copy, Save As, and Delete remain available. Frontend and native builds succeeded; relaunching for manual retest.
- 2026-10-20: Follow-up Shelf retest fixes: use a Shell-created data object and non-canonical AppData path for drag-out; add Save As and Shelf Location actions; capture pasted image data from web pages. Pasting a URL does not start a network download.

- 2026-10-14: Stopped the UtilityX server at the user's request; no other project instances were targeted.



- 2026-10-14: Rebuilt the Controls tab from a config-driven registry with animated inline Wi-Fi, Bluetooth, and audio sheets, interactive demo toggles/sliders/media controls, and monochrome range styling. Device discovery, connectivity, system audio routing, brightness, and media data remain demo-only; native integration is pending.



- 2026-10-14: Fixed the white flash on the transparent notch window by enabling Tauri's Windows noRedirectionBitmap option and explicitly setting the root WebView surface to transparent. Frontend and native builds succeeded; UtilityX restarted as PID 27676.




- 2026-10-14: Stopped UtilityX at the user's request (PID 27676). The next planned work is real Controls tab functionality.

- 2026-10-15: Added the first native Controls integrations: persistent Keep-Awake on a dedicated worker thread, display brightness through Windows WMI, master volume and speaker/microphone mute through Core Audio, and global media transport key actions. The Controls UI now invokes these native handlers and displays bridge errors; unsupported quick toggles are disabled instead of changing only local state. Frontend and native builds succeeded. Runtime behavior has not yet been manually checked.
- Historical note (superseded 2026-10-24): At that point Wi-Fi, Bluetooth, audio routing, hotspot, and Night Light integrations were pending and the Wi-Fi/Bluetooth sheets were demos.
- 2026-10-24: Replaced Controls tab's demo Wi-Fi entries with live `netsh wlan` status/scanning and connect/disconnect commands, including saved-profile connections and temporary profile creation for secured/open networks. Removed fabricated Bluetooth and audio endpoint lists; Bluetooth pairing, audio device routing, hotspot, Night Light, and notification focus are clearly handed off to Windows Settings. Existing native brightness, volume/mute, microphone mute, and Keep-Awake controls remain. Frontend and native builds succeeded. Manual runtime verification is pending.
- 2026-10-24: Removed the Mobile tab from visible navigation while deferring phone-companion work. Its source remains in the project. Frontend build and runtime launch are pending.
- 2026-10-24: Implemented the first Gemini Circle Search path: global Ctrl+Shift+S activation, full-screen lasso hit area, primary-display capture and local crop, no-key prompt, DPAPI-encrypted Gemini key storage with save/test/remove settings, Gemini vision responses, optional Google Search grounding/citations, follow-up questions, browser search, copy answer, and Save to Shelf. Screenshot pixels are captured locally and only the selected crop is sent when Circle Search is invoked; no image is written to disk. Frontend and native builds succeeded. Runtime/API behavior awaits manual verification; the app was not started.
- 2026-10-15: After the user reported failed brightness, laggy volume, console flashes, and a taskbar icon, corrected brightness to call `WmiSetBrightness` through `Invoke-CimMethod`, replaced per-action PowerShell/Core Audio compilation with in-process COM calls, suppressed the remaining hidden PowerShell host window, and reapplied `skip_taskbar` after the overlay is shown. Frontend/native build succeeded. The app remains stopped; these runtime fixes still need the user's visual/device verification.

- 2026-10-15: Replaced the mock lofi hover card and static media panel with Windows GSMTC session metadata and transport controls; the compact media card appears only for a playing session. Brightness writes now tolerate a missing WMI `ReturnValue` (which previously produced a false error after applying the change), return Windows' readback value, and the Controls tab polls brightness every 2.2 seconds while avoiding slider drags. Frontend/native build succeeded. Canonical app is running as PID 20708 from `UtilityX/Main/target/debug/winutilx-task1.exe` for user verification.
- 2026-10-15: Fixed missing browser audio detection. GSMTC metadata is preferred when available; because its session manager requires the `globalMediaControl` package capability and the development executable is unpackaged, added Core Audio active-session detection plus a process/window-title fallback and media-key transport fallback. Compact hover now follows actual active audio sessions, and browser window titles can supply track context when GSMTC is unavailable. Canonical app rebuilt and running as PID 24476 from `UtilityX/Main/target/debug/winutilx-task1.exe` for user verification.

- 2026-10-15: Removed all media detection, media-session polling, hover media UI, and expanded media transport controls at the user's direction. Hover now only displays the selected system statistics. Replaced the Controls tab media panel with buttons that open Windows Display and Sound settings. Frontend/native build succeeded; canonical app is running as PID 24696 from `UtilityX/Main/target/debug/winutilx-task1.exe`.

- 2026-10-24: Changed Gemini API-key connection testing to run on Tauri's blocking worker pool, so a slow Google response no longer stalls the UI thread. Selected the current multimodal Gemini 3.8 Flash model after Flash-Lite and 3.6 returned empty text, shortened WinHTTP phase timeouts (including response wait from 90s to 15s), and added one short retry for transient HTTP 429/5xx responses. Improved empty-response handling to surface Gemini's finish reason and distinguish token exhaustion from safety blocks; connection testing now requires actual text. Circle Search retries one empty STOP with an explicit concise-text instruction, uses Google's minimal REST image request shape (image part before prompt; no generation override), and reports model version/output count/part shape if still empty. Build/runtime verification is pending.
- 2026-10-24: Clarified Circle Search's Google action as text-only: it no longer falls back to the literal query "search selected image" and explains that Google does not receive the circled crop. Removed automatic retries for HTTP 429 quota errors and empty Gemini STOP responses because they cannot resolve the quota and were consuming extra calls. Build/runtime verification is pending.
- 2026-10-26: Corrected Gemini's Settings connection-check request to use the supported `low` thinking level instead of unsupported `minimal`. Gemini HTTP errors now include the structured error object with the API key redacted, so quota metric, quota ID, and status details can be inspected. Native build succeeded. Prepared a temporary direct REST diagnostic script that asks for the key without echoing or saving it, tests text, and optionally tests an image; external API verification awaits user execution. App not launched.
- 2026-10-26: Direct REST checks with the user's key succeeded for Gemini 3.6 Flash text and image generation; Gemini 3.8 Flash text and image generation timed out without an HTTP response. Switched UtilityX to Gemini 3.6 Flash, set low thinking for Circle Search image requests, raised the connection-test output budget, and increased the WinHTTP receive timeout from 15 to 60 seconds. Native `cargo build` succeeded with one existing unused `UnregisterHotKey` warning; app not launched.
- 2026-10-26: After manual Circle Search returned empty STOP candidates with 162 and 138 output tokens, set simple visual identification requests to Gemini 3.6's supported `minimal` thinking level, kept `low` for web-grounded requests, and clarified the concise visible-answer prompt. The exact saved crop replayed successfully via direct REST with the new key (HTTP 200, 4.5 seconds, correct answer). Added a single retry for empty STOP/unspecified responses only. Frontend and native builds succeeded; the updated app is running as PID 9540.
- 2026-10-26: Switched Circle Search from Gemini to Groq's Qwen 3.8 27B vision model using Groq Chat Completions with a base64 image data URL. Updated API-key settings and DPAPI storage to Groq, and remove the obsolete encrypted Gemini key when a Groq key is saved or removed. Removed the Gemini web-grounding action because it is not available through this Groq request; the separate Google text-search action remains. Frontend production build and native build succeeded (one existing unused `UnregisterHotKey` warning); launched canonical app as PID 31460 for key entry and manual verification.

- 2026-10-20: Moved Shelf to the first tab and Controls to second-last. Implemented persistent per-item Shelf storage under the app's local app-data folder, restore on app start, native Windows file drag-out, open with the system default app, reveal in Explorer, copy-file-to-clipboard for pasting into other apps, download, remove, clear, WebP conversion, and ZIP creation. Frontend production build and native `cargo check` succeeded. The app has not been launched for runtime testing; the user will verify the features manually.
- 2026-10-28: Changed Screen Capture from Ctrl+Alt+S to Ctrl+Alt+Shift+X to avoid the HP system-info shortcut on Ctrl+Shift+S. Updated native registration, Settings, Shelf guidance, and browser preview. UI and native builds succeeded. Launch attempt failed because WebView2 reported HRESULT 0x800700AA (the requested resource is in use); the canonical app is currently stopped, and runtime shortcut verification remains pending.
- 2026-10-28: Changed Screen Capture to the three-key Ctrl+Alt+X chord. Mounted the opaque capture selector before expanding the full-screen native hit region, and waited for DWM composition to finish hiding the app before grabbing pixels to avoid capturing a fading UtilityX frame. UI production build and native build succeeded. Launch retry still exits because WebView2 reports HRESULT 0x800700AA (requested resource in use); app is stopped and runtime verification is pending.
- 2026-10-29: Refactored Screen Capture to obtain the desktop bitmap before opening the selector. Temporarily applies `WDA_EXCLUDEFROMCAPTURE` to UtilityX so the GDI capture can omit its own window without hiding/showing it; uses a 300 ms hide-and-wait fallback when the affinity API is unavailable. The selector opens with the bitmap preloaded, avoiding an opaque loading frame and the prior expanded-settings flash. UI and native builds succeeded. Runtime verification of GDI exclusion and visual transitions remains pending.
- 2026-10-28: Removed unimplemented startup and interface-sound settings, removed the unsupported Alt+backslash and Dictation shortcut claims, and aligned Settings/help with the native Ctrl+Shift+H, Ctrl+Shift+S, Ctrl+Alt+S, and Ctrl+Shift+V bindings. Added a persisted full-screen auto-hide preference and a native 400 ms foreground-window monitor check scoped to the notch's display; it hides only when another app covers that display and restores after leaving full screen. UI production build and native `cargo check` succeeded. The app was already running during the changes, so its current process is still the previous build; close it and launch with `Main/Run-WinUtilX.bat` or `Main/Start-UtilityX.ps1` to run the new native behavior. Runtime testing remains pending.

- 2026-10-29: Audited first-run personal data and began Stage 2 rebrand. Clipboard history, Shelf files, and local wallpapers are stored per-user under Tauri app data and are not shipped as project fixtures; new installs start with empty histories and local libraries. Removed the hardcoded Aditya greeting fallback (blank name now shows only the time greeting). Rebranded the active app UI/window to Ollumi, introduced five accent presets and AMOLED/Frosted Glass surfaces, migrated existing frontend preferences from the prior WinUtilX/UtilityX localStorage keys, and standardized native/frontend events to `ollumi-*` with listeners that retain old event-name compatibility. Kept the Tauri identifier `com.winutilx.desktop` to preserve existing user data and the Shelf expiry task location across upgrades. `npm.cmd run build` and `cargo build` succeeded; runtime appearance verification pending.
- 2026-10-29: Updated the Stats Memory gauge to follow the selected accent color. Added a compact personalized welcome hero to Today and increased the Today tab height to fit it. Frontend production and native builds succeeded; app remains stopped at the user's direction.
- 2026-10-29: Applied the workspace `Icon.png` as the Windows executable icon and as the image beside the Today welcome hero. Frontend production and native builds succeeded; the app remains stopped.



















































