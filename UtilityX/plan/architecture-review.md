# Windows Edge Utility: Architecture Review & Optimization Plan

**Scope:** Review of the current spec (Tauri v2 + React/WebView2 for every surface) against its own NFRs, and a proposed hybrid architecture that actually meets them.

**Short verdict:** The stack choice is sound. The *architecture* (one WebView-based window for everything, including the always-on handle) is what breaks the targets. Fix the architecture, keep most of the stack.

---

## 1. Why the Current Approach Is Not Optimal

### 1.1 The memory targets are not achievable as designed

| NFR in spec | Target | Realistic with all-WebView design | Root cause |
| :--- | :--- | :--- | :--- |
| Handle daemon | ≤ 25 MB | **60-120 MB** | WebView2 spawns separate `msedgewebview2.exe` processes (browser, renderer, GPU, utility). Task Manager groups them under the app. |
| Drawer open | ≤ 40 MB | **90-150 MB** | Same overhead, plus React runtime and Framer Motion. |
| Full Hub | ≤ 65 MB | **120-200 MB** | Only reclaimed if the webview and every window sharing that WebView2 environment are destroyed. |
| Cold startup | ≤ 25 MB | **Not possible** | A webview alive at startup alone exceeds this. |
| Hub open time | 300 ms | **400-800 ms cold** | WebView2 cold creation is slow. A warm webview fixes it but costs permanent RAM. |

The Rust process itself is only ~10-20 MB. The webview is the cost, and the spec keeps one alive permanently for a thin strip of pixels.

### 1.2 Structural problems that follow from "everything is a webview"

1. **Drop target conflict.** Tauri/WebView2 already registers its own `IDropTarget` on the window. Calling `RegisterDragDrop` on the same HWND conflicts. Tauri's drag-drop events give file paths but handle text and URLs poorly.
2. **Focus stealing.** `WS_EX_NOACTIVATE` does not reliably hold with WebView2: its child HWNDs can still take focus on click, and typing in a non-activating window is painful.
3. **Click-blocking.** A full-size transparent drawer window swallows clicks meant for apps underneath. Animating content inside it is not enough; the window itself must be resized or made click-through when collapsed.
4. **Idle CPU.** Hidden webviews are not automatically suspended. 0.0% requires deliberate lifecycle control.

### 1.3 Spec claims that are wrong or risky

| # | Issue | Why it is a problem |
| :--- | :--- | :--- |
| 1 | **Drag-out via `CF_DIBV5`** | Many apps (Discord included) do not accept a bitmap format via drag-drop. The reliable method is a custom `IDataObject` exposing `CFSTR_FILEDESCRIPTORW` + `CFSTR_FILECONTENTS` backed by an `IStream`. This is the hardest piece of the project. |
| 2 | **"Zero disk writes"** | WebView2 writes its user data folder (cache, cookies, `EBWebView`) to AppData, which violates NFR-5 in spirit. |
| 3 | **Screenshot RAM** | A 4K RGBA frame is ~33 MB. Raw bitmap + Konva canvas + WebView copy + undo history can reach 150-250 MB per capture. |
| 4 | **Fullscreen detection** | `EVENT_SYSTEM_FOREGROUND` reports a foreground change, not fullscreen state. Also, exclusive-fullscreen games cover topmost windows regardless. |
| 5 | **Capture border** | Windows.Graphics.Capture shows a yellow border on Windows 10 and early Win11. Removing it needs `IsBorderRequired = false` on a recent Win11 build. |
| 6 | **35-80+ MB/s throughput** | Many phones default hotspots to 2.4 GHz (3-10 MB/s real-world). 5 GHz speed varies heavily by chipset. This is a best case, not an acceptance criterion. |
| 7 | **Hardcoded gateway IPs** | Android hotspot subnets vary. `192.168.43.1` and `172.20.10.1` are not reliable. |
| 8 | **HTTP/2 over plain TCP + custom AES-256 key exchange** | Mobile HTTP/2 libraries mostly expect TLS, and hand-rolled crypto is a security liability. |
| 9 | **iOS auto-connect** | iOS kills backgrounded sockets and requires a Local Network permission prompt. Auto-connect is realistic on Android only (foreground service). |

---

## 2. How I Will Optimize It

### 2.1 Core change: split the app into native and webview surfaces

**Principle:** anything that is always running must be native. Anything rich and on-demand can be a webview.

```
┌──────────────────────────────────────────────────────────┐
│  Core process (Rust, always on)  ~10-20 MB               │
│  ├─ Native Win32 handle (layered, no-activate window)    │
│  ├─ Native drawer (Slint or egui)  ← drop target, shelf  │
│  ├─ SetWinEventHook + fullscreen check                   │
│  ├─ Capture engine (master bitmaps live here)            │
│  ├─ Network service (TLS + WebSocket + chunked HTTP)     │
│  └─ OLE: IDropTarget / IDropSource / virtual-file        │
│       IDataObject                                        │
├──────────────────────────────────────────────────────────┤
│  On-demand windows (Tauri v2 + React)                    │
│  ├─ Annotation editor  (created on "Edit", destroyed     │
│  │                      on close)                        │
│  └─ Full Hub           (created on open, destroyed on    │
│                         close)                           │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Projected footprint after the change

| State | Spec target | Projected (hybrid) |
| :--- | :--- | :--- |
| Handle only (idle) | ≤ 25 MB | **~10-20 MB** |
| Native drawer open | ≤ 40 MB | **~25-40 MB** |
| Hub or editor open | ≤ 65 MB | **~120-200 MB** (webview), freed on close |
| Idle CPU | 0.0% | **0.0%** (event-driven, no polling while collapsed) |

The Hub and editor numbers stay high because they are webviews. That is acceptable: they are short-lived, and the cost is paid only while the user is actively using them.

### 2.3 Drawer decision

| Option | RAM | Open feel | Verdict |
| :--- | :--- | :--- | :--- |
| Webview created on hover, destroyed after idle | Low | 200-500 ms lag on first open | Undermines the "smooth slide" goal |
| Hidden webview kept warm | +60-90 MB permanent | Instant | Breaks the RAM budget |
| **Native drawer (Slint/egui)** | Lowest | Instant, 60+ FPS | **Chosen.** Also sidesteps the drop-target conflict entirely. |

Trade-off: no React/Tailwind/Framer Motion in the drawer. Drawer content is simple (chips, meters, buttons), so this is a small loss.

### 2.4 Targeted fixes for each risky item

| Problem | Fix |
| :--- | :--- |
| Drag-out from RAM | Custom `IDataObject` with `CFSTR_FILEDESCRIPTORW` + `CFSTR_FILECONTENTS` over an `IStream`. Spike first. |
| Drop target conflict | Native drawer owns its own `IDropTarget`. No webview on that HWND. |
| Focus stealing | Native handle/drawer with `WS_EX_NOACTIVATE`. Text inputs only in the Hub. |
| Click-blocking | Resize the window to the handle strip when collapsed; never leave a large transparent window. |
| Screenshot RAM | Master bitmap stays in Rust. Serve downscaled previews to the UI through a custom URI scheme (not base64 over IPC). Load full-res only inside the editor. Cap undo history. |
| Disk pollution | WebView2 in incognito/in-memory mode with a controlled data dir wiped on exit. Verify with Process Monitor. |
| Fullscreen detection | `SetWinEventHook` + window-rect-vs-monitor comparison + `SHQueryUserNotificationState`. |
| Capture border | `IsBorderRequired = false` where supported. Capture the full monitor frame first, then show the selection overlay over the frozen frame. |
| Idle CPU | Event-driven only. Telemetry polling runs only while the drawer is visible. |

### 2.5 Networking and mobile fixes

| Spec | Replacement |
| :--- | :--- |
| Hardcoded gateway IPs | Read the default gateway from the active adapter and probe the service port. No fixed addresses. |
| HTTP/2 over TCP + custom AES-256 | **TLS 1.3 (`rustls`)** with a self-signed cert; **fingerprint pinned via the QR code**. WebSocket for control messages, chunked HTTP for files, CRC32 plus resume retained. |
| 35 MB/s acceptance criterion | Report measured throughput; treat 35 MB/s as best case on 5 GHz. |
| Auto-connect on both platforms | Android first (foreground service). iOS: manual connect plus Local Network permission flow. |
| Flutter vs React Native | **React Native** for faster delivery given existing React/TS skills. Choose Flutter only if trackpad latency proves inadequate. Share-sheet receiver needs native code either way. |

---

## 3. Revised NFRs

Measure as **total process-tree private bytes** (core + all `msedgewebview2.exe` children), not just the main process.

| NFR | Revised target |
| :--- | :--- |
| Handle only | ≤ 20 MB |
| Native drawer open | ≤ 40 MB |
| Editor or Hub open | ≤ 200 MB, fully reclaimed within a few seconds of close |
| Idle CPU, drawer collapsed | 0.0% |
| Hub cold open | ≤ 800 ms (≤ 300 ms is a stretch goal, not a requirement) |
| Local transfer | Report measured MB/s; ≥ 35 MB/s on 5 GHz is best case |
| Disk residue after discard/exit | Zero files from the app outside the install directory and user-chosen save locations |

---

## 4. Revised Roadmap

### Phase 0: Spikes (new, 1-2 weeks, throwaway code)

Kill the highest-risk assumptions before committing.

- [ ] **Spike A:** Virtual-file drag-out from RAM into Discord, Chrome upload field, Explorer, and Outlook.
- [ ] **Spike B:** Non-activating, always-on-top window hosting a webview. Test typing in IDEs and games.
- [ ] **Spike C:** Measured Tauri baseline: process-tree memory with one webview alive and after destroying it.
- [ ] **Spike D:** Native drawer prototype in Slint vs egui. Measure RAM and animation smoothness.

**Exit criteria:** each spike has a pass/fail result and a measured number. Any failure changes the plan before Phase 1.

### Phase 1: Native handle + drawer shell + app awareness
Native layered window, spring-animated drawer, foreground hook, fullscreen detection, lazy telemetry.

### Phase 2: Networking bridge *(moved up from Phase 4)*
TLS + WebSocket + chunked transfer, QR fingerprint pairing, gateway probing, Lock PC endpoint. Gives a working end-to-end demo early with lower risk than the annotation canvas.

### Phase 3: Drop shelf and file stager
Native `IDropTarget` / `IDropSource`, chip cards, format conversion, zip, URL cleaner, clipboard stack.

### Phase 4: Screenshot engine + annotation editor
Capture, frozen-frame snip overlay, RAM-resident master bitmap, Tauri/Konva editor window, virtual-file drag-out (from Spike A).

### Phase 5: Mobile companion
Android first. Share-sheet receiver, command center, clipboard sync.

### Phase 6: Full Hub and release hardening
On-demand Hub window, history, settings, autostart, clean uninstaller. Verify the memory reclaim on close.

---

## 5. Scope Cuts for v1

| Cut | Reason |
| :--- | :--- |
| Virtual presentation trackpad | Latency-sensitive, large surface area, does not prove the core idea. |
| Per-app volume sliders | Needs WASAPI session management; master volume is enough. |
| mDNS fallback | Gateway probing covers the main use case (hotspot). |
| iOS auto-connect | Platform limits make it unreliable. Ship Android first. |

---

## 6. Decision Summary

| Decision | Choice |
| :--- | :--- |
| Keep Tauri v2 + React? | **Yes**, for the Hub and editor only |
| Always-on surfaces | **Native Win32 + Slint/egui** |
| Transport security | **TLS 1.3 with QR-pinned cert**, no custom crypto |
| First milestone | **Phase 0 spikes**, then native shell |
| NFR style | **Measured, process-tree totals** |
