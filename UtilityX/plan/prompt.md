# UI/UX Design Prompts for Google Stitch

Use the prompts below in **Google Stitch** (or other AI design and prototyping tools) to generate the UI designs for both the **Windows PC Edge Utility** and the **Mobile Companion App**.

---

## Global Design System & Aesthetic Guidelines

Before generating individual screens, adhere to this overarching design language:

* **Theme:** Premium Cyber-Minimalist Dark Glassmorphism (inspired by Windows 11 Fluent Mica + OriginOS/macOS aesthetics).
* **Color Palette:**
  * Background Base: Obsidian Black (`#080C14`), Deep Slate Surface (`#0F172A`).
  * Glassmorphic Surfaces: `rgba(15, 23, 42, 0.65)` with `backdrop-filter: blur(24px)` and `1px solid rgba(255, 255, 255, 0.08)` borders.
  * Primary Accent: Electric Cyan (`#00F2FE`) & Neon Emerald (`#10B981`).
  * Alert / Thermal Accent: Sunset Amber (`#F59E0B`) & Crimson Glow (`#EF4444`).
  * Typography: Modern geometric sans-serif (Inter, Outfit, or Plus Jakarta Sans).
* **Motion & Animation Language:**
  * Fluid spring physics (`cubic-bezier(0.16, 1, 0.3, 1)`).
  * 60/120Hz smooth transitions, subtle interactive glow on hover, tactile depth on press.

---

# DESIGN 1: Windows PC Edge Utility & Hub (Desktop)

### Prompt for Google Stitch:

> **Project Name:** Windows Edge Shelf & Productivity Hub  
> **Target Platform:** Desktop (Windows 11, High-DPI, 16:9 / 21:9 Aspect Ratios)  
> **Style:** Windows 11 Fluent Design, Frosted Mica Acrylic, Neon Accent Lighting  
> 
> **Design Request:**
> Generate a comprehensive 4-state desktop UI suite for a modern Windows productivity utility featuring an always-visible edge dock, a slide-out shelf, an in-memory screenshot editor, and a full management hub.
> 
> ---
> 
> #### Screen 1: The Floating Edge Handle & Slide-Out Drawer (Main Interaction)
> * **State A — Floating Edge Handle (Docked):**
>   * A sleek, ultra-minimal vertical pill (`8px` wide, `72px` high) docked to the right screen edge.
>   * 30% translucent dark acrylic with a subtle vertical glowing gradient (`#00F2FE` to `#10B981`).
>   * Micro-indicator: Tiny pulsing green dot showing "Phone Connected via Hotspot".
>   * Hover state: Handle smoothly expands to `24px` width with a soft ambient radial glow and reveals a subtle chevron icon.
> * **State B — Slide-Out Shelf Drawer (Expanded):**
>   * A `380px` wide, full-height or docked panel sliding out from the right screen edge with smooth spring motion.
>   * Deep frosted glass (`rgba(15, 23, 42, 0.75)` with 30px blur and delicate 1px light border).
>   * **Header Section:**
>     * Mini PC Telemetry Bar: Compact circular SVG pills for CPU (`24%`), RAM (`42%`), Battery (`88% ⚡ 4h 12m`), and live Hotspot Transfer Speed (`68.4 MB/s`).
>     * Expand to Full Hub button (`↗`), and Settings gear (`⚙️`).
>   * **Drop Shelf Section (The Collector Zone):**
>     * A dashed dropzone header: *"Drop files, images, or links here"*.
>     * 3 staged item cards currently held in the shelf:
>       1. Image Chip: Thumbnail of a screenshot with quick pill tags: `[PNG]` `1.4 MB`, with hover actions: `[Convert to WebP]` `[Send to Phone]`.
>       2. Document Chip: `Financial_Report.pdf` (`4.2 MB`) with a drag handle.
>       3. Web Snippet Chip: Cleaned GitHub URL card with favicon.
>     * Bottom Shelf Actions: Floating pill buttons: `[ ⚡ Send All to Phone ]`, `[ 📦 Zip All ]`, `[ 🗑️ Clear Shelf ]`.
> 
> ---
> 
> #### Screen 2: Ephemeral Screenshot Snip & Instant Annotation Studio
> * **State A — The Snip Overlay:**
>   * Fullscreen dimmed desktop overlay (`rgba(0, 0, 0, 0.4)`).
>   * An active rectangular selection box with animated dashed cyan border and 8 glowing corner/edge resize handles.
>   * Attached tooltip showing dimensions (`1420 × 860 px`) and a 4x zoom loupe showing the exact pixel crosshair and RGB hex code (`#00F2FE`).
> * **State B — Floating Annotation Canvas & Toolbar:**
>   * The captured region is frozen on screen with a modern floating island toolbar positioned neatly above it.
>   * **Toolbar Icons (Floating Glass Capsule):**
>     * Tools: Selection Arrow, Freehand Pen, Vector Arrow, Rounded Rectangle, Text Pill (`"T"`), Step Badge Marker (`"①"`), Blur / Redaction Tool (`"░"`), Crop.
>     * Color Palette Dots: Cyan, Emerald, Amber, White, Red, with a line-width slider.
>   * **Direct Actions Bar (Bottom-Right Floating Pill):**
>     * Prominent buttons:
>       * `[ 📱 Send to Phone ]` (Primary emerald gradient button).
>       * `[ 📋 Copy & Discard ]` (Ghost button).
>       * `[ 💾 Save... (PNG/WebP) ]` (Dropdown button).
>       * `[ 🗑️ Discard ]` (Red subtle trash icon).
> 
> ---
> 
> #### Screen 3: Full Desktop Management Hub (Dashboard Window)
> * **Window Frame:** Modern frameless Windows 11 window (`1050 × 680 px`) with smooth rounded corners, custom minimize/close buttons, and translucent dark navigation sidebar.
> * **Sidebar Navigation:**
>   * Items: `📱 Phone Companion`, `📦 Stash Vault`, `📋 Clipboard History`, `🖼️ Screenshot Archive`, `⚙️ Settings & Rules`.
> * **Active View: "Phone Companion & Hotspot Link":**
>   * **Top Banner:** Active connection card showing *"Connected to OnePlus 12 via Mobile Hotspot (Direct Gateway 192.168.43.1)"*. Signal strength gauge, latency (`< 2ms`), and local link bandwidth (`80 MB/s max`).
>   * **Quick Remote Actions:** One-click tiles for `[ 🔒 Lock PC Now ]`, `[ ⚡ Flush DNS & Reset Hotspot ]`, `[ 📤 Push File Batch ]`.
>   * **Recent Transfer Table:** Clean, tabular log of files sent and received: File Name, Size, Direction (PC ➔ Phone), Transfer Rate (`64.2 MB/s`), Timestamp, and Action (`[ Open Folder ]`).
>   * **Pairing Drawer:** Secondary panel showing the 1-time cryptographic QR Code generator to pair new devices.
> * **Secondary View: "Settings & App Rules":**
>   * Visual toggle list for App Auto-Hide rules: Process name inputs (`valorant.exe`, `vlc.exe`), Fullscreen Game Auto-Hide toggle, and Edge Handle opacity/docking sliders (Left vs. Right edge).

---

# DESIGN 2: Mobile Companion App (Phone)

### Prompt for Google Stitch:

> **Project Name:** Desktop Companion & Remote Command Center  
> **Target Platform:** Mobile (iOS / Android 14/15, 19.5:9 Aspect Ratio)  
> **Style:** High-End Automotive/Cyberpunk Minimalist Dark Mode, Tactile Glass Cards, Neon Accents  
> 
> **Design Request:**
> Generate a 3-tab mobile companion app interface that pairs with a Windows PC over local hotspot/Wi-Fi to provide zero-latency remote controls, blazing-fast batch file transfer, and an adaptive contextual macro deck.
> 
> ---
> 
> #### Screen 1: Command Center (Main Remote Dashboard)
> * **Top Status Bar & Device Header:**
>   * Device Pill: *"Aditya's Laptop (Windows 11)"* with glowing green connection badge (`🟢 Hotspot Direct Link`).
>   * Telemetry Glance: Compact chip showing laptop's live battery (`88% ⚡`), CPU usage (`22%`), and internal temps (`48°C`).
> * **Hero Action (The Master Lock Button):**
>   * A large, tactile, hexagonal or rounded-square button with a subtle cyan neon rim:
>   * Title: **"LOCK PC"** with a sleek lock icon.
>   * Subtitle: *"Tap to trigger instant Windows lock"*.
>   * Micro-interaction: Depresses with haptic feedback glow upon tap.
> * **System Audio & Media Card:**
>   * Tactile horizontal slider for Laptop Master Volume (`64%`) with mute toggle.
>   * Active media playback card: Showing current playing Spotify track or YouTube video title from PC with Play/Pause, Skip, and scrub bar.
> * **Quick Utilities Grid (2x2 Glass Cards):**
>   * Card 1: `[ 📋 Send Clipboard ]` (Shows last text copied on phone, 1-tap to paste to PC).
>   * Card 2: `[ 🖱️ Trackpad Mode ]` (Expands into virtual laptop touch surface).
>   * Card 3: `[ ☕ Keep-Awake ]` (Toggle to prevent laptop sleep during renders).
>   * Card 4: `[ 💤 Sleep / Hibernate ]` (With safety confirmation modal).
> 
> ---
> 
> #### Screen 2: High-Speed File Transfer & Drop Hub
> * **Header:** *"Local Hotspot Direct Transfer"* with note: *"100% Offline • 0 KB Mobile Data Used"*.
> * **Live Speed Gauge (Hero Visual):**
>   * An animated circular/arc speedometer showing active transfer rate: **`68.4 MB/s`** with an animated pulsing wave connecting the Phone icon to the Laptop icon.
> * **Active Batch Transfer Queue:**
>   * Card 1: `Project_Videos.zip` (1.4 GB) — Progress bar at `78%`, ETA: `4s remaining`.
>   * Card 2: `IMG_20261005_Batch.tar` (320 MB) — `Completed 🟢`.
> * **Send to Laptop Dropzone:**
>   * A wide dashed glass upload box: *"Tap to select Photos or Files from device"*.
>   * Quick buttons: `[ 📷 Send Latest Photo ]`, `[ 📁 Browse Files ]`.
> 
> ---
> 
> #### Screen 3: Adaptive Contextual Macro Deck (Stream Deck Mode)
> * **Header:** Dynamically reflects the laptop's currently active foreground application:
>   * E.g., *"Active on Laptop: Visual Studio Code"* (or Photoshop / YouTube).
> * **Dynamic Button Matrix (3x3 Rounded Glass Tiles):**
>   * When coding (VS Code active):
>     * Tile 1: `[ 🚀 Run Debug ]` (Cyan accent)
>     * Tile 2: `[ 💾 Git Commit ]` (Emerald accent)
>     * Tile 3: `[ 🧹 Format Code ]`
>     * Tile 4: `[ 🖥️ Terminal ]`
>     * Tile 5: `[ 🔍 Global Search ]`
>     * Tile 6: `[ 🛑 Kill Frozen Task ]` (Amber/Red emergency button)
>   * When browsing/media:
>     * Tiles automatically transform into: `[ New Tab ]`, `[ Mute Tab ]`, `[ Bookmark ]`, `[ PiP Mode ]`.
> * **Footer Navigation Bar:**
>   * 3 minimal icons with active glow indicator: `[ ⚡ Controller ]`, `[ 📤 Transfers ]`, `[ 🎛️ Macro Deck ]`.
