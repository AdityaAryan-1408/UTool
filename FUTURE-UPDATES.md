# UtilityX — Future Updates & Feature Roadmap

Last updated: 2026-10-27

---

## Accepted Features

### 1. Smart Hardware Thermal & Battery Drain Profiler — "Watt Watcher"

**Problem:** Standard battery telemetry only shows the current percentage. When a laptop battery is draining unexpectedly, the user has to open Task Manager or Resource Monitor to track down which process is causing the spike. There is no glanceable, proactive power intelligence on Windows.

**Feature:**
- The notch hover peek displays a dynamic efficiency chip: `14.2W · 4h 15m remaining`.
- If a background process suddenly spikes power consumption or keeps the dedicated GPU awake (e.g., a background Chromium tab or stuck Electron updater), the notch's outward ear pulses amber with a 1-click **"Tame"** or **"Kill Process"** prompt.
- **One-Click Power Profile Switcher:** Toggle between Windows Ultimate Performance, Balanced, and Whisper Silent (limiting CPU package power states during long render/meeting sessions).
- **Session Drain Log:** A compact sparkline graph in the Stats tab showing wattage over the last hour, with annotations for which apps caused spikes.

**Technical Integration:**
- Windows Power Management API (`PowerGetActiveScheme`, `PowerSetActiveScheme`, `GetSystemPowerStatus`).
- Windows ETW / Performance Counters (`PdhAddCounterW` for CPU package power and process energy estimation).
- `NtQuerySystemInformation` for per-process CPU time deltas to estimate energy attribution.

**UI Location:** Hover peek chip + Stats tab sparkline + amber ear pulse alert.

---

### 2. Zero-Cloud Native OCR & Structured Data Snip — "Ghost Text"

**Problem:** Users frequently encounter unselectable text: error messages in native modal popups, text inside video tutorials, frozen remote desktop windows, locked PDFs, and game UI overlays. Existing screenshot tools only capture images.

**Feature:**
- Pull down from the notch with a shortcut (`Alt+T`) to draw a quick marquee over any region on screen.
- UtilityX extracts the text instantly using Windows' built-in offline OCR engine—100% private, zero network calls, near 0ms latency.
- **Smart Clipboard Transformation Chips** appear after extraction:
  - **Table Extractor:** Detects table grids and copies directly as formatted Markdown or CSV ready for Excel/Sheets.
  - **Regex Auto-Parsers:** Detects Hex/RGB colors, API endpoints, Unix timestamps, error tracebacks, or email addresses, providing one-click copy in normalized formats.
  - **Code Block Detect:** If the snipped text looks like source code (indentation, syntax keywords), wraps it in a fenced code block with auto-detected language.
  - **Translate Chip:** Quick inline translation via Windows' offline translation pack (no cloud API needed).

**Technical Integration:**
- WinRT `Windows.Media.Ocr.OcrEngine` (shipped locally in all Windows 10/11 installations; requires no Tesseract binaries or Python dependencies).
- `Windows.Graphics.Capture` for the screen region grab, feeding BGRA bitmap directly to OCR.
- Language pack detection via `OcrEngine.AvailableRecognizerLanguages`.

**UI Location:** Fullscreen marquee overlay (similar to Lasso) → floating result card with transformation chips.

---

### 3. Exam & Deadline Countdown — "D-Day Strip"

**Persona:** 🎓 Student

**Problem:** Students juggle multiple assignment deadlines, exam dates, and project submissions across different courses. Calendar apps are too heavy to check at a glance.

**Feature:**
- A compact horizontal strip in the Today tab showing upcoming deadlines as countdown chips:
  - `DSA Exam · 3d 14h` · `ML Assignment · 18h` · `Resume Submit · 6d`
- Chips change color as urgency increases:
  - Green (>3 days) → Amber (1-3 days) → Red (<24 hours) → Pulsing red (<6 hours).
- **Quick Add:** Type naturally: `"DSA exam friday 2pm"` and UtilityX parses the date intelligently.
- **Shelf Integration:** Dropping a file onto a deadline chip automatically tags it as a submission artifact for that deadline.

**Technical Integration:**
- Pure frontend with `localStorage` persistence (same pattern as the existing Today tab tasks).
- Natural language date parsing via a lightweight JS library (chrono-node or custom regex).
- No calendar API dependency; fully offline.

---

### 4. Clipboard Chain & Multi-Paste Queue — "Stack Paste" - Done

**Persona:** 💻 Developer + 👤 General User

**Problem:** The Clipboard tab is currently mock data, so copied items are lost as soon as the clipboard changes. Making queue mode opt-in would also alter ordinary Ctrl+C/Ctrl+V behavior and risk unexpected pastes.

**Feature:**
- Clipboard capture is always on; no queue mode needs to be activated. Each copied text item or image is added to a persistent local history in copy-time order.
- The Clipboard tab lists captured items and provides one-click copy, search, remove, and clear actions.
- A numbered recent-copy queue appears in the notch across tabs for one minute after a copy, then returns to its normal display.
- Normal Ctrl+V remains the operating system's regular paste. Ctrl+Shift+V explicitly batch-pastes captured history from oldest to newest, so queued items do not unexpectedly replace ordinary pastes.
- While Clipboard is selected, the notch window is made non-activating so clicking its history controls can leave keyboard focus in the app being pasted into.

**Technical Integration:**
- Native Windows clipboard listener via AddClipboardFormatListener in Rust.
- Text and DIB image data are stored locally under UtilityX app data; copy actions restore the selected item to the Windows clipboard.
- Ctrl+Shift+V is registered as a global hotkey and sends a paste for each history item in chronological order.
---

### 5. Rich Link Preview Cards — "Link Preview"

**Status: Implemented in UtilityX/Main.** Shelf and Clipboard detect HTTP(S) links, fetch a bounded page preview, and show cached metadata offline.

**Problem:** Pasting a URL into the Shelf or Clipboard currently stores it as a raw text string. You can't tell at a glance what the link is — whether it's a GitHub repo, a YouTube video, an Amazon product, or a documentation page.

**Feature:**
- Pasting or dropping a URL into the Shelf auto-fetches the page's metadata and renders a rich card:
  - **Title** (from `<title>` or `og:title`).
  - **Favicon** (site icon).
  - **Open Graph image** (the social preview thumbnail).
  - **Description snippet** (first 1-2 lines from `og:description`).
  - **Domain badge** (e.g., `github.com`, `youtube.com`).
- One-click actions: **Open in Browser**, **Copy Clean URL** (strips tracking params like `utm_source`, `fbclid`), **Archive to Shelf**.
- Works offline for previously fetched links (metadata is cached locally).

**Technical Integration:**
- Rust-side WinHTTP GET with a 64 KB body limit to read page metadata without blocking the UI thread.
- Parses Open Graph/title/description and favicon tags, resolves relative preview URLs, and caches results under UtilityX app data for offline viewing.
- Cached in the Shelf's local app data alongside the file entries.

---

### 6. Universal File Format Converter — "Drop Convert"

**Problem:** Converting a file format (PNG → WebP, MOV → GIF, DOCX → PDF, FLAC → MP3) currently requires opening a separate app, uploading to a website, or installing a CLI tool. There's no fast, inline, private way to do it.

**Feature:**
- Drag any file onto the notch and a compact radial/pill menu appears with instant conversion options based on the detected file type:
  - **Image:** PNG ↔ WebP ↔ JPG ↔ ICO ↔ AVIF ↔ BMP
  - **Video:** MP4 ↔ GIF ↔ WebM (with quality/size presets)
  - **Audio:** MP3 ↔ WAV ↔ FLAC ↔ OGG ↔ AAC
  - **Document:** Markdown → HTML, HTML → PDF
  - **Data:** JSON ↔ YAML ↔ CSV ↔ TOML
- Converted file is saved to the Shelf with the new extension. Original is untouched.
- **Batch Mode:** Drop multiple files to convert them all in one pass.
- 100% offline. No uploads, no cloud processing.

**Technical Integration:**
- Image conversions via the `image` crate in Rust (already available in the ecosystem).
- Video/audio via bundled FFmpeg binary or Windows Media Foundation codecs.
- Text format conversions via lightweight Rust parsers (`serde_json`, `serde_yaml`, `csv`).
- Conversion runs on a background thread with a progress indicator in the notch.

**Status (2026-10-28):** The converter UI was removed at user direction after the full-screen transparent notch became invisible while still intercepting clicks. Dragging files to the notch and adding them to Shelf remains supported. Revisit conversion only with a design isolated from the notch's full-screen hit region.

---

### 7. Hands-Free Voice Typing — "Whisper Type"

**Problem:** Sometimes you want to type a long message, search query, or note without touching the keyboard — during a stretch, while eating, or when your hands are occupied. Windows has built-in dictation (`Win+H`) but it's clunky, inaccurate, and opens a distracting system overlay.

**Feature:**
- Global hotkey (configurable, default `Alt+D`) activates a tiny floating mic pill near the notch.
- Speak naturally and text is injected directly into whatever text field currently has focus — browser address bar, IDE, chat app, terminal, or any input.
- **Smart Cleanup:** Automatically corrects filler words ("um", "uh", "like"), fixes punctuation, and capitalizes sentence starts (reusing the existing Dictation Studio's cleanup logic).
- **Inline Preview:** The notch briefly shows the recognized text before injecting it, with a quick cancel gesture.
- Works entirely offline using Windows' built-in speech recognition engine.

**Technical Integration:**
- WinRT `Windows.Media.SpeechRecognition.SpeechRecognizer` in continuous dictation mode.
- `SendInput` to inject the recognized text into the focused application.
- Reuses the text-cleanup pipeline from the existing DictationModal component.

---

### 8. Prefixed Quick Web Search — "Quick Search"

**Problem:** Opening a browser, clicking the address bar, navigating to the right site, and typing a query is too many steps for a simple lookup. Especially when you just want to quickly check something on YouTube, GitHub, Amazon, StackOverflow, or Google without context-switching away from your workflow.

**Feature:**
- Global hotkey (`Alt+S`) opens a compact floating search bar anchored below the notch — minimal, single-line, instant focus.
- **Prefix Shortcuts** route the query to the right site and open results directly in the default browser:
  - `yt how to cook pasta` → YouTube search
  - `gh tauri-apps/tauri` → GitHub repo/search
  - `am wireless mouse under 2000` → Amazon search
  - `so rust async closure` → StackOverflow search
  - `npm framer-motion` → npmjs.com package page
  - `w React hooks` → Wikipedia search
  - `r/programming` → Reddit subreddit
  - No prefix → default Google search
- **Recents:** The bar remembers the last 10 searches with instant recall via arrow keys.
- **Inline Calculator:** If the input is a math expression (`sqrt(144) + 15%`), show the result inline without opening a browser.

**Technical Integration:**
- Floating Tauri webview or DOM overlay anchored to the notch.
- URL template map stored in a simple JSON config (user-extensible).
- `shell_open` / `ShellExecuteW` to launch the constructed URL in the default browser.
- Math evaluation via a lightweight JS expression parser.

---

### 9. AI Circle to Search — "Circle Search"

**Problem:** The existing Lasso overlay lets you draw a freehand circle on screen, but currently it only shows hardcoded mock results. The real power is connecting it to an AI model so you can circle *anything* — a product, an error message, a UI element, a math equation, a plant, a game character — and instantly get context about it.

**Feature:**
- **Hotkey** (`Ctrl+Shift+S` or `Alt+C`): Activates the fullscreen lasso overlay (already built).
- Draw a circle around anything on screen. UtilityX captures the circled region as a screenshot.
- The captured image is sent to the user's configured AI vision model (Gemini, GPT-4o, Claude) along with an optional typed or spoken follow-up question.
- **AI Response Card:** A floating glassmorphic card appears near the circled region with:
  - **Identified item** (product name, error explanation, species, translation, etc.).
  - **Contextual actions:** "Search on Google", "Open on Amazon", "Copy explanation", "Save to Shelf".
  - **Follow-up input:** Ask a follow-up question about the same circled region without re-circling.
- **Use cases:**
  - Circle a product on a website → get price comparisons and reviews.
  - Circle an error traceback in terminal → get an explanation and fix suggestion.
  - Circle a math equation in a PDF → get the step-by-step solution.
  - Circle text in a foreign language → get an instant translation.
  - Circle a UI design → get accessibility feedback or color palette extraction.

**Technical Integration:**
- Screen region capture via `Windows.Graphics.Capture` or `BitBlt` from the device context.
- Image encoded as base64 and sent via HTTP POST to the configured AI provider's vision endpoint.
- API key stored locally in UtilityX's encrypted app data (never transmitted anywhere except the user's chosen AI provider).
- Reuses and upgrades the existing `LassoOverlay.jsx` component.

---

### 10. Persistent Context Memory — "Memory"

**Problem:** Every interaction with a typical AI assistant starts from zero. It doesn't remember your preferences, your project context, your schedule, your codebase conventions, or what you asked it yesterday. This makes repeated interactions frustratingly repetitive.

**Feature:**
- UtilityX maintains a **local memory store** — a structured knowledge base that persists across sessions and is automatically fed as context to the AI agent (Feature #11).
- **Automatic Memory Capture:**
  - When the AI agent completes a task or answers a question, key facts are extracted and stored: `"User prefers Rust over Python"`, `"User's main project is UtilityX, a Tauri app"`, `"User's exam schedule: DSA on Friday"`.
  - Circle Search results, Shelf file metadata, Today tab tasks, and deadline data can optionally be indexed into memory.
- **Manual Memory Pins:** The user can explicitly tell the agent: `"Remember that my API key for OpenAI is stored in .env"` or `"Remember I use pnpm, not npm"`.
- **Memory Browser:** A dedicated panel (accessible from Settings or a new Memory tab) showing all stored memory entries as searchable, deletable cards.
- **Privacy Controls:**
  - All memory is stored locally in UtilityX's app data folder as a JSON/SQLite file. Never uploaded anywhere.
  - One-click "Forget Everything" wipe.
  - Individual memory entries can be deleted.
  - Memory is only sent to the AI provider when the agent is actively invoked (not passively).

**Technical Integration:**
- Local SQLite database (via `rusqlite` crate) or flat JSON file in UtilityX app data.
- Semantic search over memory entries using embedding vectors (optional, via the same AI API) or simple keyword/tag matching.
- Memory context is prepended as a system prompt to every AI agent request.
- Max context window management: oldest/least-relevant memories are pruned when the token budget is exceeded.

---

### 11. In-App AI Agent — "Soul"

**Problem:** AI assistants like ChatGPT, Gemini, and Claude live in browser tabs — disconnected from your actual desktop environment. They can't see your screen, can't access your files, can't control your system, and can't remember what you told them yesterday. You constantly copy-paste context back and forth.

**Feature:**
- A full conversational AI agent that lives inside the UtilityX notch, with deep integration into every UtilityX feature.
- **Setup:** The user provides their own API key (Gemini, OpenAI, Anthropic, or local Ollama endpoint) in Settings. UtilityX never proxies through any third-party server — requests go directly from the user's machine to their chosen provider.
- **Activation:** Click the Soul flame icon in the notch, or use a global hotkey (`Alt+A`), or speak via Whisper Type.
- **Chat Interface:** A compact chat panel slides down from the notch with a message input, conversation history, and streaming AI responses rendered in Markdown with syntax highlighting.
- **Native Tool Use — the agent can act on your computer:**
  - **File Operations:** "Move all PNGs from Downloads to the Shelf" → agent uses Shelf commands.
  - **System Controls:** "Set brightness to 40% and turn on Keep-Awake" → agent invokes existing Controls tab Tauri commands.
  - **Web Search:** "Find the cheapest RTX 4060 on Amazon" → agent uses Quick Search and returns results.
  - **Circle Search:** "What's this on my screen?" → triggers Circle Search capture and sends to vision model.
  - **Today Tab:** "Add 'submit ML assignment' to my tasks for Friday" → agent creates a task and D-Day deadline.
  - **Power Actions:** "Lock my PC in 30 minutes" → schedules a delayed lock command.
  - **Shelf Actions:** "Archive that link I just dropped" → agent saves the link to Shelf.
  - **Open Apps:** "Open VS Code and Chrome side by side" → agent launches apps and positions windows.
- **Memory Integration:** Every conversation is informed by the persistent Memory store (Feature #10). The agent remembers your preferences, project context, and past interactions.
- **Multi-Model Support:**
  - **Gemini** (via Google AI Studio API key) — recommended default, supports vision.
  - **OpenAI** (GPT-4o, GPT-4o-mini) — supports vision and function calling.
  - **Anthropic** (Claude) — supports vision and tool use.
  - **Local Ollama** — for fully offline, private AI with no API key needed.
- **Personality Presets:** Reuses the existing LoadoutHub personality system ("True Chad", "Zen Companion", "Senior Architect", "Concise Minimalist") to set the agent's tone and verbosity.

**Technical Integration:**
- Rust-side HTTP client (`reqwest` crate) for direct API calls to the configured provider.
- Function calling / tool use protocol mapped to existing Tauri `invoke_handler` commands — the AI model receives a tool schema describing available UtilityX actions, and the agent executes them via the same Tauri bridge the UI uses.
- Streaming responses via SSE/chunked transfer displayed progressively in the chat UI.
- API keys encrypted at rest using Windows DPAPI (`CryptProtectData`) and stored in UtilityX app data.
- Conversation history stored locally alongside the Memory database.
- Token budget management: conversation is summarized and compressed when approaching the model's context limit.
