use std::ptr::null_mut;
use windows_sys::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, CreatePen, CreateSolidBrush, DeleteObject, EndPaint, FillRect, RoundRect,
    SelectObject, HBRUSH, HPEN, PAINTSTRUCT, PS_SOLID,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, LoadCursorW, PostQuitMessage,
    RegisterClassW, SetLayeredWindowAttributes, SetWindowPos, ShowWindow, TranslateMessage,
    CS_HREDRAW, CS_VREDRAW, HCURSOR, HICON, HWND_TOPMOST, IDC_ARROW, LWA_ALPHA, MA_NOACTIVATE,
    MSG, SWP_NOACTIVATE, SW_SHOWNOACTIVATE, WM_DESTROY, WM_LBUTTONDOWN, WM_LBUTTONUP,
    WM_MOUSEACTIVATE, WM_MOUSEMOVE, WM_PAINT, WM_RBUTTONUP, WNDCLASSW, WS_EX_LAYERED,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

const WM_MOUSELEAVE: u32 = 0x02A3;
const TME_LEAVE: u32 = 0x00000002;
const MONITOR_DEFAULTTOPRIMARY: u32 = 1;

#[repr(C)]
struct TRACKMOUSEEVENT {
    cb_size: u32,
    dw_flags: u32,
    hwnd_track: HWND,
    dw_hover_time: u32,
}

#[repr(C)]
struct MONITORINFO {
    cb_size: u32,
    rc_monitor: RECT,
    rc_work: RECT,
    dw_flags: u32,
}

extern "system" {
    fn MonitorFromPoint(pt: POINT, dw_flags: u32) -> isize;
    fn GetMonitorInfoW(h_monitor: isize, lpmi: *mut MONITORINFO) -> i32;
    fn TrackMouseEvent(lp_event_track: *mut TRACKMOUSEEVENT) -> i32;
    fn InvalidateRect(h_wnd: HWND, lp_rect: *const RECT, b_erase: i32) -> i32;
}

static mut IS_HOVERED: bool = false;
static mut IS_DRAGGING: bool = false;
static mut DRAG_OFFSET_Y: i32 = 0;
static mut CURRENT_Y: i32 = 280;
static mut SCREEN_RIGHT: i32 = 1536;
static mut SCREEN_BOTTOM: i32 = 864;

const HANDLE_HEIGHT: i32 = 120;
const COLLAPSED_WIDTH: i32 = 14;
const EXPANDED_WIDTH: i32 = 42;

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        // CRITICAL: Never activate this window on click
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,

        WM_MOUSEMOVE => {
            let mut tme = TRACKMOUSEEVENT {
                cb_size: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                dw_flags: TME_LEAVE,
                hwnd_track: hwnd,
                dw_hover_time: 0,
            };
            TrackMouseEvent(&mut tme);

            if !IS_HOVERED && !IS_DRAGGING {
                IS_HOVERED = true;
                // Expand handle on hover
                SetWindowPos(
                    hwnd, HWND_TOPMOST,
                    SCREEN_RIGHT - EXPANDED_WIDTH, CURRENT_Y,
                    EXPANDED_WIDTH, HANDLE_HEIGHT,
                    SWP_NOACTIVATE,
                );
                SetLayeredWindowAttributes(hwnd, 0, 240, LWA_ALPHA);
                InvalidateRect(hwnd, null_mut(), 1);
                println!("  [hover] Expanded");
            }

            if IS_DRAGGING {
                let y = (lparam >> 16) as i16 as i32;
                let new_y = (CURRENT_Y + y - DRAG_OFFSET_Y)
                    .clamp(10, SCREEN_BOTTOM - HANDLE_HEIGHT - 50);
                CURRENT_Y = new_y;
                let w = if IS_HOVERED { EXPANDED_WIDTH } else { COLLAPSED_WIDTH };
                SetWindowPos(
                    hwnd, HWND_TOPMOST,
                    SCREEN_RIGHT - w, CURRENT_Y, w, HANDLE_HEIGHT,
                    SWP_NOACTIVATE,
                );
            }
            0
        }

        WM_MOUSELEAVE => {
            if !IS_DRAGGING {
                IS_HOVERED = false;
                // Collapse handle
                SetWindowPos(
                    hwnd, HWND_TOPMOST,
                    SCREEN_RIGHT - COLLAPSED_WIDTH, CURRENT_Y,
                    COLLAPSED_WIDTH, HANDLE_HEIGHT,
                    SWP_NOACTIVATE,
                );
                SetLayeredWindowAttributes(hwnd, 0, 160, LWA_ALPHA);
                InvalidateRect(hwnd, null_mut(), 1);
                println!("  [leave] Collapsed");
            }
            0
        }

        WM_LBUTTONDOWN => {
            IS_DRAGGING = true;
            DRAG_OFFSET_Y = (lparam >> 16) as i16 as i32;
            println!("👉 [CLICK] Handle clicked — your text editor kept focus!");
            0
        }

        WM_LBUTTONUP => {
            IS_DRAGGING = false;
            0
        }

        WM_RBUTTONUP => {
            println!("🛑 Right-click — closing.");
            PostQuitMessage(0);
            0
        }

        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);

            let w = if IS_HOVERED { EXPANDED_WIDTH } else { COLLAPSED_WIDTH };

            // Background: dark slate (#0F172A)
            let bg: HBRUSH = CreateSolidBrush(0x002A170F as COLORREF);
            let rect = RECT { left: 0, top: 0, right: w, bottom: HANDLE_HEIGHT };
            FillRect(hdc, &rect, bg);
            DeleteObject(bg as _);

            // Border: electric cyan (#00F2FE -> 0x00FEF200 in BBGGRR)
            let cyan: COLORREF = 0x00FEF200;
            let pen: HPEN = CreatePen(PS_SOLID as i32, 2, cyan);
            let slate: HBRUSH = CreateSolidBrush(0x003D2A1A as COLORREF); // slightly lighter slate

            let old_pen = SelectObject(hdc, pen as _);
            let old_brush = SelectObject(hdc, slate as _);

            // Rounded pill shape
            RoundRect(hdc, 1, 4, w - 1, HANDLE_HEIGHT - 4, 12, 12);

            // Center grip indicator
            let grip: HBRUSH = CreateSolidBrush(cyan);
            let old_grip = SelectObject(hdc, grip as _);
            let cy = HANDLE_HEIGHT / 2;

            if IS_HOVERED {
                // Three grip dots when expanded
                RoundRect(hdc, w / 2 - 8, cy - 20, w / 2 - 4, cy + 20, 3, 3);
                RoundRect(hdc, w / 2 - 1, cy - 20, w / 2 + 3, cy + 20, 3, 3);
                RoundRect(hdc, w / 2 + 6, cy - 20, w / 2 + 10, cy + 20, 3, 3);
            } else {
                // Single grip line when collapsed
                RoundRect(hdc, 4, cy - 16, 8, cy + 16, 3, 3);
            }

            SelectObject(hdc, old_grip);
            DeleteObject(grip as _);
            SelectObject(hdc, old_pen);
            SelectObject(hdc, old_brush);
            DeleteObject(pen as _);
            DeleteObject(slate as _);

            EndPaint(hwnd, &ps);
            0
        }

        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }

        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn encode_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn main() {
    println!("===========================================================");
    println!("  PHASE 0 — SPIKE B: Non-Activating Floating Edge Handle   ");
    println!("===========================================================");

    unsafe {
        // Get monitor bounds
        let pt = POINT { x: 0, y: 0 };
        let hmon = MonitorFromPoint(pt, MONITOR_DEFAULTTOPRIMARY);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cb_size = std::mem::size_of::<MONITORINFO>() as u32;
        GetMonitorInfoW(hmon, &mut mi);

        SCREEN_RIGHT = mi.rc_monitor.right;
        SCREEN_BOTTOM = mi.rc_monitor.bottom;
        CURRENT_Y = SCREEN_BOTTOM / 2 - HANDLE_HEIGHT / 2;

        println!("Monitor: {} x {}", SCREEN_RIGHT, SCREEN_BOTTOM);

        let class_name = encode_wide("WinUtilX_SpikeB");

        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: null_mut(),
            hIcon: 0 as HICON,
            hCursor: LoadCursorW(null_mut(), IDC_ARROW), // ← proper arrow cursor
            hbrBackground: null_mut(),
            lpszMenuName: null_mut(),
            lpszClassName: class_name.as_ptr(),
        };
        RegisterClassW(&wc);

        let title = encode_wide("WinUtilX Handle");
        let ex_style = WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED;
        let x = SCREEN_RIGHT - COLLAPSED_WIDTH;

        let hwnd = CreateWindowExW(
            ex_style,
            class_name.as_ptr(), title.as_ptr(),
            WS_POPUP,
            x, CURRENT_Y, COLLAPSED_WIDTH, HANDLE_HEIGHT,
            null_mut(), null_mut(), null_mut(), null_mut(),
        );

        if hwnd.is_null() {
            eprintln!("❌ Failed to create window!");
            return;
        }

        // Semi-transparent idle state
        SetLayeredWindowAttributes(hwnd, 0, 160, LWA_ALPHA);
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        SetWindowPos(hwnd, HWND_TOPMOST, x, CURRENT_Y, COLLAPSED_WIDTH, HANDLE_HEIGHT, SWP_NOACTIVATE);

        println!("✅ Edge handle docked at right edge (X={}, Y={})", x, CURRENT_Y);
        println!();
        println!("--- TEST INSTRUCTIONS ---");
        println!("1. Open Notepad or any editor and TYPE something.");
        println!("2. Look at the RIGHT EDGE of your screen — a subtle dark bar.");
        println!("3. HOVER over it → it expands with a cyan accent.");
        println!("4. CLICK it → terminal prints a message, your editor stays focused.");
        println!("5. DRAG it up/down → repositions along the edge.");
        println!("6. RIGHT-CLICK → closes this test.");
        println!();
        println!("Waiting for input...");

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    println!("\n✅ Spike B completed.");
}
