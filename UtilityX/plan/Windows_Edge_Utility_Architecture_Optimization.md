# Windows Edge Utility & Phone Companion — Architecture Optimization

## 1. Purpose

This document reviews the original project specification and explains where the current approach is not optimal for the project's primary goals:

- Very low background RAM usage
- Near-zero idle CPU usage
- Smooth 60/120 FPS UI
- Fast local file transfer
- Native Windows integration
- Local-first privacy
- Reliable long-running background operation

The goal is **not** to replace the original architecture. The goal is to keep its strengths while removing unnecessary overhead and architectural risks.

---

# 2. Current Approach

The original specification proposes:

- **Windows host:** Rust + Tauri v2
- **Desktop UI:** React + Vite + TypeScript
- **Styling:** Tailwind CSS
- **Animation:** Framer Motion
- **Screenshot editor:** Konva.js / Fabric.js
- **Screen capture:** Windows.Graphics.Capture
- **Windows integration:** windows-rs / Win32 APIs
- **Mobile:** Flutter or React Native
- **Networking:** TCP sockets + HTTP/2 streaming
- **Discovery:** Default Gateway heuristic + mDNS + QR pairing
- **Persistence:** Not explicitly defined

The architecture is fundamentally sound, but several parts can be improved for a utility that is expected to remain running in the background for long periods.

---

# 3. Why the Current Approach Is Not Fully Optimal

## 3.1 React/WebView2 for an Always-On Background Handle

The biggest architectural concern is using a React/WebView2 surface for the permanently visible edge handle.

Tauri is much lighter than Electron, but it still uses WebView2 for the frontend. Therefore:

```text
Rust
  ↓
Tauri
  ↓
WebView2
  ↓
React
  ↓
Edge Handle
```

The WebView2/React layer introduces memory and process overhead even though the edge handle itself is a very small UI.

### Why this matters

The application is supposed to behave like a lightweight Windows utility rather than a conventional desktop application.

A permanently running WebView should therefore be treated as an optimization target.

### Optimization

Do **not** prematurely rewrite the entire UI in native Windows rendering.

Instead:

1. Start with Tauri + React.
2. Measure actual memory and CPU usage in the packaged application.
3. Keep the React surface extremely small.
4. If profiling shows that the always-on handle is responsible for meaningful overhead, move only the tiny always-on shell to a more native implementation.
5. Keep the complex UI in React.

Recommended long-term split:

```text
Rust
├── Native Windows integration
├── Background services
├── Edge shell if profiling requires it
└── Core application logic

Tauri/WebView2
├── Drawer
├── Screenshot editor
├── Full Hub
├── Settings
└── History
```

This avoids unnecessary complexity until measurements prove it is needed.

---

# 3.2 The ≤25 MB RAM Requirement Is Too Aggressive as a Guarantee

The original specification defines:

- Background handle: ≤25 MB
- Drawer: ≤40 MB
- Full Hub: ≤65 MB

These are useful engineering targets, but they should not be treated as guaranteed properties.

Tauri/Rust can be very lightweight, but WebView2, graphics resources, loaded frontend assets, image buffers, and OS-level allocations can push real-world memory usage above these values.

### Optimization

Change the requirement from:

> The application must always remain below a fixed RAM number.

to:

> The application must be benchmarked against a defined idle/active memory budget, with regressions detected during development.

Measure:

- Rust process memory
- WebView2 memory
- GPU memory
- Screenshot buffers
- Drawer-open memory
- Hub-open memory
- Memory after closing Hub
- Memory after repeated screenshot/edit/discard cycles

The key metric should be **no uncontrolled memory growth**, not an arbitrary single number.

---

# 3.3 React Rendering Must Be Strictly Lifecycle-Driven

React itself is not a problem.

The problem would be continuously updating React state for things that do not need continuous updates.

For example, the following should NOT happen while the drawer is collapsed:

```text
CPU telemetry → React state → render
RAM telemetry → React state → render
Battery telemetry → React state → render
Network telemetry → React state → render
```

### Optimization

Use a lifecycle-driven model:

```text
Drawer CLOSED
    ↓
No telemetry polling
No unnecessary animations
No periodic React updates
No unnecessary network discovery
    ↓
Near-zero application work
```

When opened:

```text
Drawer OPEN
    ↓
Start required telemetry
Start UI updates
Start relevant animations
```

When closed:

```text
Stop those operations
```

This principle should be applied throughout the application.

---

# 3.4 Framer Motion Should Be Used Selectively

Framer Motion is suitable for the edge drawer and micro-interactions.

However, a background utility should avoid maintaining many continuously animated components.

### Optimization

Use Framer Motion for:

- Drawer open/close
- Hover transitions
- Small status transitions
- Short-lived UI feedback

Avoid:

- Continuous decorative animations
- Animating large lists
- Animating every status component
- Animation-driven polling

For static elements, use CSS transitions where possible.

---

# 3.5 Screenshot Memory Can Become the Largest RAM Consumer

The specification correctly uses RAM-only screenshot staging.

However, raw screenshots can become very large.

For example:

```text
3840 × 2160 × 4 bytes ≈ 31.6 MB
```

A single uncompressed 4K RGBA screenshot can therefore consume tens of megabytes.

Multiple staged screenshots can quickly exceed the intended memory budget.

### Optimization

Use a staged-image lifecycle:

```text
Capture
  ↓
RAM buffer
  ↓
Thumbnail
  ↓
Full-resolution buffer retained only while required
  ↓
Export / Transfer / Discard
  ↓
Release buffer
```

Recommendations:

- Generate small thumbnails for shelf cards.
- Do not duplicate full-resolution buffers unnecessarily.
- Release full-resolution image memory immediately after discard/export.
- Avoid keeping multiple copies of the same bitmap.
- Use compressed representations where they do not interfere with editing.
- Explicitly test repeated capture → edit → discard cycles for memory leaks.

The screenshot editor should operate on the full-resolution image only when necessary.

---

# 3.6 Canvas Choice Should Be Standardized

The specification currently says:

> Konva.js (or Fabric.js)

Avoid leaving this undecided once implementation starts.

### Recommended choice

Use:

**Konva.js**

for the initial implementation.

Reasons:

- Suitable for interactive canvas-based editing
- Good fit for vector annotations
- Straightforward scene/layer model
- Appropriate for arrows, rectangles, text, freehand drawing, and step markers

Do not introduce both libraries.

---

# 3.7 Networking Is More Complicated Than Necessary

The current specification proposes:

```text
TCP sockets
+
HTTP/2 streaming
```

This is technically viable but introduces additional complexity.

The core requirement is:

> Efficient, authenticated, resumable local file transfer.

The first implementation should therefore optimize for correctness and measurable throughput rather than protocol complexity.

### Recommended approach

Use:

```text
Control/API layer
        ↓
Authenticated local connection
        ↓
Chunked binary file transfer
        ↓
Resume support
        ↓
Integrity verification
```

Start with a single well-defined transport architecture.

Only introduce additional protocols if benchmarking demonstrates a real requirement.

---

# 3.8 File Transfer Should Not Copy Data Unnecessarily

A common performance mistake is:

```text
File
 ↓
Read entire file into RAM
 ↓
Copy into buffer
 ↓
Send buffer
```

This is unnecessary for large files.

### Optimization

Use streaming:

```text
Disk
 ↓
Fixed-size chunks
 ↓
Network
 ↓
Phone
```

Benefits:

- Low memory usage
- Stable transfer behavior
- Large files do not consume large amounts of RAM
- Easier transfer resumption

The same principle should be applied in the opposite direction.

---

# 3.9 SQLite Should Be Added

The original architecture does not define a persistent local database.

However, the application needs persistent information for:

- Paired devices
- Transfer history
- Clipboard history
- Screenshot metadata
- Application rules
- User settings

### Recommended addition

Use:

**SQLite**

with Rust.

Suggested logical tables:

```text
settings
paired_devices
transfer_history
clipboard_history
screenshots
app_rules
```

SQLite is appropriate because:

- Local-first
- No server
- Very low overhead
- Reliable persistence
- Excellent for small structured datasets

### Important

Do not store large screenshot binaries in SQLite.

Store metadata and file paths for explicitly saved screenshots.

Ephemeral screenshots remain in RAM.

---

# 3.10 The Full Hub Should Be Lazy-Loaded

The original specification correctly says the Full Hub is opened on demand.

Keep this architecture.

Recommended lifecycle:

```text
Application startup
    ↓
Rust background core
    ↓
Tiny edge UI
    ↓
Hub NOT loaded

User opens Hub
    ↓
Create Hub window
    ↓
Load required UI
    ↓
User closes Hub
    ↓
Destroy/release Hub resources
```

Do not keep a hidden full dashboard WebView alive indefinitely.

---

# 3.11 Telemetry Should Be Event-Driven Wherever Possible

Foreground-window awareness is already planned through Windows event hooks.

Continue this approach.

Prefer:

```text
OS event
    ↓
Rust handler
    ↓
Update application state
```

instead of:

```text
while true:
    poll OS
    sleep
```

Use polling only where the underlying metric genuinely requires it.

For example:

- Foreground application → event-driven
- Window changes → event-driven
- User interaction → event-driven
- Battery/CPU display → low-frequency polling only while visible
- Network diagnostics → on demand

---

# 3.12 Mobile Stack: Prefer Flutter

The original specification allows:

```text
Flutter or React Native
```

For this project, standardize on:

**Flutter**

The mobile application is primarily a custom utility involving:

- Local networking
- QR pairing
- Remote controls
- File transfer
- Share Sheet
- Clipboard synchronization
- Trackpad input

Flutter is a good fit for a highly customized cross-platform UI while still allowing native platform integration.

Recommended:

```text
Android / iOS
    ↓
Flutter
    ↓
Dart networking layer
    ↓
Native platform integrations where required
```

---

# 4. Optimized Final Technology Stack

## Windows

### Core

**Rust**

Used for:

- Background service
- Networking
- File operations
- Image processing
- Security
- Persistence
- Windows API integration

### Windows integration

**windows-rs / Win32 / WinRT**

Used for:

- Window management
- Foreground process monitoring
- Global shortcuts
- Screen capture
- OLE drag & drop
- Clipboard
- Audio controls
- System locking
- Hardware/system information

### Desktop framework

**Tauri v2**

Used for:

- Web UI integration
- Window lifecycle
- IPC
- Multi-window application structure

### Frontend

**React + TypeScript + Vite**

Used for:

- Drawer
- Settings
- Screenshot editor
- Full Hub
- History
- Device management

### Styling

**Tailwind CSS**

### Animation

**Framer Motion**

Use selectively.

### Screenshot editor

**Konva.js**

### Persistence

**SQLite**

---

# 5. Optimized Architecture

```text
                    WINDOWS
                       │
             ┌─────────▼─────────┐
             │       RUST        │
             │   Core Runtime    │
             └─────────┬─────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
   Win32/WinRT     Networking        SQLite
       │               │                │
       │               │                │
       ▼               ▼                ▼
 Windows APIs      TCP/HTTP         Local State
 Capture           Discovery
 Clipboard         Pairing
 OLE               Transfer
 Audio
 Hotkeys
       │
       │
       ▼
 ┌─────────────────────────────────────┐
 │              TAURI v2               │
 │                                     │
 │  WebView2 / React / TypeScript      │
 │                                     │
 │  ┌─────────┐ ┌─────────┐ ┌───────┐ │
 │  │ Drawer  │ │ Editor  │ │ Hub   │ │
 │  └─────────┘ └─────────┘ └───────┘ │
 │                                     │
 │      Konva + Tailwind + Motion      │
 └─────────────────┬───────────────────┘
                   │
                   │ Local Wi-Fi
                   │
          ┌────────▼─────────┐
          │     FLUTTER      │
          │ Mobile Companion │
          └──────────────────┘
```

---

# 6. Performance Rules

The following rules should be treated as architecture-level constraints.

## Rule 1 — Nothing should continuously work while hidden

If the user cannot see or use a component, stop unnecessary work associated with it.

## Rule 2 — Never poll when an OS event exists

Prefer Windows event hooks and callbacks.

## Rule 3 — Never load the entire file into RAM

Use streaming for large files.

## Rule 4 — Never duplicate large image buffers unnecessarily

A 4K screenshot can consume tens of megabytes uncompressed.

## Rule 5 — Do not keep the Full Hub alive

Create it on demand and release it when closed.

## Rule 6 — Keep React state granular

A telemetry update should not cause the entire drawer to re-render.

## Rule 7 — Measure before optimizing further

Use profiling to determine whether WebView2, React, image processing, or another component is actually responsible for memory/CPU usage.

## Rule 8 — Optimize the background path first

The application is primarily a background utility.

The most important performance state is:

```text
Application running
Drawer collapsed
No transfer
No screenshot editing
No Hub
```

That state should perform essentially no unnecessary work.

---

# 7. Revised Performance Targets

Instead of treating the original numbers as absolute guarantees, use them as engineering targets.

### Background

Target:

- Very low CPU usage
- Minimal WebView activity
- No active telemetry polling
- No continuous animations
- Stable memory over long periods

### Drawer

Target:

- 60+ FPS
- No noticeable input latency
- Telemetry active only while visible

### Screenshot editor

Target:

- Smooth interaction at common resolutions
- No unnecessary bitmap duplication
- Full-resolution buffer released when no longer required

### File transfer

Target:

- Network-limited throughput
- Streaming rather than whole-file buffering
- Resume support
- Integrity verification

### Hub

Target:

- Fast startup
- Lazy loading
- Resources released when closed

---

# 8. Final Recommended Stack

| Component | Final choice | Reason |
|---|---|---|
| Windows core | **Rust** | Low overhead + native APIs |
| Desktop framework | **Tauri v2** | Lightweight compared with Electron |
| UI | **React + TypeScript + Vite** | Fast development + mature ecosystem |
| Styling | **Tailwind CSS** | Lightweight and productive |
| Animation | **Framer Motion** | Good for drawer/micro-interactions |
| Canvas | **Konva.js** | Suitable screenshot annotation engine |
| Windows API | **windows-rs** | Native Win32/WinRT access |
| Screen capture | **Windows.Graphics.Capture** | Native Windows capture |
| Database | **SQLite** | Local, lightweight persistence |
| Networking | **Rust streaming transport** | Low memory + high throughput |
| Discovery | **mDNS + gateway detection** | Local network discovery |
| Pairing | **QR + authenticated cryptographic handshake** | Simple local pairing |
| Mobile | **Flutter** | Strong custom UI + native integration |
| Large-file handling | **Chunked streaming** | Prevents RAM spikes |

---

# 9. Bottom Line

The original architecture is already strong. The main issue is not that the selected technologies are outdated or inherently slow.

The real optimization is **how the technologies are used**.

The final philosophy should be:

```text
Rust handles the work.
React handles the UI.
WebView exists only where UI is required.
Windows APIs handle Windows-specific functionality.
SQLite handles small persistent state.
RAM handles ephemeral screenshots.
Streaming handles large files.
Flutter handles the mobile companion.
```

Most importantly:

> **Do not optimize by removing React or Tauri prematurely. Optimize the application lifecycle first, profile the real packaged application, and only introduce native rendering for the always-on edge shell if measurements justify it.**

This keeps the project technically sophisticated without turning it into an unnecessarily complex native Windows codebase.
