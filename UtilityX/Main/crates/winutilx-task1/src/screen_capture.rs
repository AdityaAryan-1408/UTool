use serde::Serialize;
use std::ffi::c_void;
use std::mem::size_of;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenCapture {
    pub width: u32,
    pub height: u32,
    pub bitmap_data_url: String,
}

#[repr(C)]
struct BitmapInfoHeader {
    size: u32,
    width: i32,
    height: i32,
    planes: u16,
    bit_count: u16,
    compression: u32,
    size_image: u32,
    x_pixels_per_meter: i32,
    y_pixels_per_meter: i32,
    colors_used: u32,
    colors_important: u32,
}

#[repr(C)]
struct BitmapInfo {
    header: BitmapInfoHeader,
    colors: [u32; 1],
}

#[link(name = "user32")]
extern "system" {
    fn GetDC(hwnd: *mut c_void) -> *mut c_void;
    fn ReleaseDC(hwnd: *mut c_void, hdc: *mut c_void) -> i32;
    fn GetSystemMetrics(index: i32) -> i32;
    fn SetWindowDisplayAffinity(hwnd: *mut c_void, affinity: u32) -> i32;
}

#[link(name = "dwmapi")]
extern "system" {
    fn DwmFlush() -> i32;
}

#[link(name = "gdi32")]
extern "system" {
    fn CreateCompatibleDC(hdc: *mut c_void) -> *mut c_void;
    fn CreateCompatibleBitmap(hdc: *mut c_void, width: i32, height: i32) -> *mut c_void;
    fn SelectObject(hdc: *mut c_void, object: *mut c_void) -> *mut c_void;
    fn SetStretchBltMode(hdc: *mut c_void, mode: i32) -> i32;
    fn StretchBlt(dst: *mut c_void, x: i32, y: i32, width: i32, height: i32, src: *mut c_void, src_x: i32, src_y: i32, src_width: i32, src_height: i32, rop: u32) -> i32;
    fn GetDIBits(hdc: *mut c_void, bitmap: *mut c_void, start_scan: u32, scan_lines: u32, bits: *mut c_void, info: *mut BitmapInfo, usage: u32) -> i32;
    fn DeleteObject(object: *mut c_void) -> i32;
    fn DeleteDC(hdc: *mut c_void) -> i32;
}

fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let value = (a << 16) | (b << 8) | c;
        output.push(TABLE[((value >> 18) & 63) as usize] as char);
        output.push(TABLE[((value >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    output
}

pub fn capture_primary_screen() -> Result<ScreenCapture, String> {
    unsafe {
        let source_width = GetSystemMetrics(0);
        let source_height = GetSystemMetrics(1);
        if source_width <= 0 || source_height <= 0 {
            return Err("Windows could not determine the primary display size.".into());
        }

        // Keep the IPC payload bounded on 4K displays while retaining enough
        // pixels for reading text and recognizing small UI elements.
        let scale = (1920.0 / source_width as f64).min(1920.0 / source_height as f64).min(1.0);
        let width = (source_width as f64 * scale).round().max(1.0) as i32;
        let height = (source_height as f64 * scale).round().max(1.0) as i32;
        let screen = GetDC(std::ptr::null_mut());
        if screen.is_null() { return Err("Windows could not open the display for capture.".into()); }
        let memory = CreateCompatibleDC(screen);
        if memory.is_null() {
            ReleaseDC(std::ptr::null_mut(), screen);
            return Err("Windows could not prepare display capture.".into());
        }
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        if bitmap.is_null() {
            DeleteDC(memory);
            ReleaseDC(std::ptr::null_mut(), screen);
            return Err("Windows could not allocate the display capture.".into());
        }
        let previous = SelectObject(memory, bitmap);
        SetStretchBltMode(memory, 4); // HALFTONE downsampling for large displays
        const SRCCOPY: u32 = 0x00CC0020;
        let copied = StretchBlt(memory, 0, 0, width, height, screen, 0, 0, source_width, source_height, SRCCOPY);
        let mut pixels = vec![0u8; width as usize * height as usize * 4];
        let mut info = BitmapInfo {
            header: BitmapInfoHeader {
                size: size_of::<BitmapInfoHeader>() as u32,
                width,
                height: -height, // top-down rows, matching browser canvas coordinates
                planes: 1,
                bit_count: 32,
                compression: 0, // BI_RGB
                size_image: pixels.len() as u32,
                x_pixels_per_meter: 0,
                y_pixels_per_meter: 0,
                colors_used: 0,
                colors_important: 0,
            },
            colors: [0],
        };
        SelectObject(memory, previous);
        let rows = if copied != 0 { GetDIBits(memory, bitmap, 0, height as u32, pixels.as_mut_ptr().cast(), &mut info, 0) } else { 0 };
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(std::ptr::null_mut(), screen);
        if rows == 0 { return Err("Windows could not read the captured display pixels.".into()); }
        for pixel in pixels.chunks_exact_mut(4) { pixel[3] = 255; }
        let image_size = pixels.len() as u32;
        let file_size = 54u32.saturating_add(image_size);
        let mut bmp = Vec::with_capacity(file_size as usize);
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&file_size.to_le_bytes());
        bmp.extend_from_slice(&[0; 4]);
        bmp.extend_from_slice(&54u32.to_le_bytes());
        bmp.extend_from_slice(&40u32.to_le_bytes());
        bmp.extend_from_slice(&width.to_le_bytes());
        bmp.extend_from_slice(&(-height).to_le_bytes());
        bmp.extend_from_slice(&1u16.to_le_bytes());
        bmp.extend_from_slice(&32u16.to_le_bytes());
        bmp.extend_from_slice(&0u32.to_le_bytes());
        bmp.extend_from_slice(&image_size.to_le_bytes());
        bmp.extend_from_slice(&[0; 16]);
        bmp.extend_from_slice(&pixels);
        let bitmap_data_url = format!("data:image/bmp;base64,{}", base64_encode(&bmp));
        Ok(ScreenCapture { width: width as u32, height: height as u32, bitmap_data_url })
    }
}

#[tauri::command]
pub async fn capture_screen(window: tauri::WebviewWindow) -> Result<ScreenCapture, String> {
    const WDA_NONE: u32 = 0;
    const WDA_EXCLUDEFROMCAPTURE: u32 = 0x0000_0011;
    // Store the raw HWND as an integer while the async command awaits its
    // worker; raw pointers are not Send across Tauri's async IPC boundary.
    let hwnd = window.hwnd().map_err(|error| format!("Could not access Ollumi for screen capture: {error}"))?.0 as usize;
    let was_visible = window.is_visible().unwrap_or(false);
    // Prefer hiding only this window from public capture APIs. This avoids
    // changing its visible state and prevents a DWM fade frame in the result.
    let excluded = unsafe { SetWindowDisplayAffinity(hwnd as *mut c_void, WDA_EXCLUDEFROMCAPTURE) != 0 };
    if !excluded && was_visible {
        window.hide().map_err(|error| format!("Could not hide Ollumi for screen capture: {error}"))?;
    }

    let capture_task = tauri::async_runtime::spawn_blocking(move || {
        unsafe { DwmFlush(); }
        if !excluded {
            // Older Windows versions may not support WDA_EXCLUDEFROMCAPTURE.
            // The fallback has no selector mounted yet, so the longer wait is
            // only a temporary notch hide and avoids sampling its fade.
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
        capture_primary_screen()
    }).await;

    if excluded {
        unsafe { SetWindowDisplayAffinity(hwnd as *mut c_void, WDA_NONE); }
    } else if was_visible {
        let _ = window.show();
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_focus();
    }

    capture_task.map_err(|error| format!("Screen capture task failed: {error}"))?
}
