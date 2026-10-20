#![windows_subsystem = "console"]

use core::ffi::c_void;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicU32, Ordering};
use windows_sys::core::HRESULT;
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::Graphics::Gdi::*;
use windows_sys::Win32::Storage::FileSystem::*;
use windows_sys::Win32::System::Com::StructuredStorage::*;
use windows_sys::Win32::System::Com::*;
use windows_sys::Win32::System::DataExchange::*;
use windows_sys::Win32::System::Memory::*;
use windows_sys::Win32::System::Ole::*;
use windows_sys::Win32::UI::Shell::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

// ============================================================================
// COM Vtable Definitions & Constants
// ============================================================================

#[allow(non_snake_case)]
#[repr(C)]
pub struct IDataObjectVtbl {
    pub QueryInterface: unsafe extern "system" fn(*mut c_void, *const windows_sys::core::GUID, *mut *mut c_void) -> HRESULT,
    pub AddRef: unsafe extern "system" fn(*mut c_void) -> u32,
    pub Release: unsafe extern "system" fn(*mut c_void) -> u32,
    pub GetData: unsafe extern "system" fn(*mut c_void, *const FORMATETC, *mut STGMEDIUM) -> HRESULT,
    pub GetDataHere: unsafe extern "system" fn(*mut c_void, *const FORMATETC, *mut STGMEDIUM) -> HRESULT,
    pub QueryGetData: unsafe extern "system" fn(*mut c_void, *const FORMATETC) -> HRESULT,
    pub GetCanonicalFormatEtc: unsafe extern "system" fn(*mut c_void, *const FORMATETC, *mut FORMATETC) -> HRESULT,
    pub SetData: unsafe extern "system" fn(*mut c_void, *const FORMATETC, *const STGMEDIUM, BOOL) -> HRESULT,
    pub EnumFormatEtc: unsafe extern "system" fn(*mut c_void, u32, *mut *mut c_void) -> HRESULT,
    pub DAdvise: unsafe extern "system" fn(*mut c_void, *const FORMATETC, u32, *mut c_void, *mut u32) -> HRESULT,
    pub DUnadvise: unsafe extern "system" fn(*mut c_void, u32) -> HRESULT,
    pub EnumDAdvise: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT,
}

#[allow(non_snake_case)]
#[repr(C)]
pub struct IDropSourceVtbl {
    pub QueryInterface: unsafe extern "system" fn(*mut c_void, *const windows_sys::core::GUID, *mut *mut c_void) -> HRESULT,
    pub AddRef: unsafe extern "system" fn(*mut c_void) -> u32,
    pub Release: unsafe extern "system" fn(*mut c_void) -> u32,
    pub QueryContinueDrag: unsafe extern "system" fn(*mut c_void, BOOL, u32) -> HRESULT,
    pub GiveFeedback: unsafe extern "system" fn(*mut c_void, u32) -> HRESULT,
}

const IID_IUNKNOWN: windows_sys::core::GUID = windows_sys::core::GUID {
    data1: 0x00000000,
    data2: 0x0000,
    data3: 0x0000,
    data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
};

const IID_IDATAOBJECT: windows_sys::core::GUID = windows_sys::core::GUID {
    data1: 0x0000010e,
    data2: 0x0000,
    data3: 0x0000,
    data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
};

const IID_IDROPSOURCE: windows_sys::core::GUID = windows_sys::core::GUID {
    data1: 0x00000121,
    data2: 0x0000,
    data3: 0x0000,
    data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
};

const E_POINTER: HRESULT = 0x80004003u32 as i32;
const E_NOINTERFACE: HRESULT = 0x80004002u32 as i32;
const E_NOTIMPL: HRESULT = 0x80004001u32 as i32;
const E_OUTOFMEMORY: HRESULT = 0x8007000Eu32 as i32;
const E_FAIL: HRESULT = 0x80004005u32 as i32;
const DV_E_FORMATETC: HRESULT = 0x80040064u32 as i32;
const DV_E_TYMED: HRESULT = 0x80040069u32 as i32;
const DV_E_LINDEX: HRESULT = 0x80040068u32 as i32;
const DATA_S_SAMEFORMATETC: HRESULT = 0x00040130u32 as i32;
const OLE_E_ADVISENOTSUPPORTED: HRESULT = 0x80040003u32 as i32;
const DRAGDROP_S_DROP: HRESULT = 0x00040100u32 as i32;
const DRAGDROP_S_CANCEL: HRESULT = 0x00040101u32 as i32;
const DRAGDROP_S_USEDEFAULTCURSORS: HRESULT = 0x00040102u32 as i32;

unsafe fn guid_eq(a: *const windows_sys::core::GUID, b: &windows_sys::core::GUID) -> bool {
    let a = &*a;
    a.data1 == b.data1 && a.data2 == b.data2 && a.data3 == b.data3 && a.data4 == b.data4
}

// ============================================================================
// OLE IDataObject Implementation
// ============================================================================

#[repr(C)]
pub struct MyDataObject {
    pub vtbl: *const IDataObjectVtbl,
    pub ref_count: AtomicU32,
    pub filename: String,
    pub content: Vec<u8>,
    pub cf_file_descriptor: u32,
    pub cf_file_contents: u32,
    pub enable_hdrop: bool,
}

unsafe extern "system" fn data_object_query_interface(
    this: *mut c_void,
    riid: *const windows_sys::core::GUID,
    ppv_object: *mut *mut c_void,
) -> HRESULT {
    if ppv_object.is_null() {
        return E_POINTER;
    }
    if guid_eq(riid, &IID_IUNKNOWN) || guid_eq(riid, &IID_IDATAOBJECT) {
        *ppv_object = this;
        data_object_add_ref(this);
        S_OK
    } else {
        *ppv_object = null_mut();
        E_NOINTERFACE
    }
}

unsafe extern "system" fn data_object_add_ref(this: *mut c_void) -> u32 {
    let obj = &*(this as *const MyDataObject);
    obj.ref_count.fetch_add(1, Ordering::SeqCst) + 1
}

unsafe extern "system" fn data_object_release(this: *mut c_void) -> u32 {
    let obj = &*(this as *const MyDataObject);
    let count = obj.ref_count.fetch_sub(1, Ordering::SeqCst) - 1;
    if count == 0 {
        let _ = Box::from_raw(this as *mut MyDataObject);
    }
    count
}

unsafe extern "system" fn data_object_get_data(
    this: *mut c_void,
    pformatetc: *const FORMATETC,
    pmedium: *mut STGMEDIUM,
) -> HRESULT {
    if pformatetc.is_null() || pmedium.is_null() {
        return E_POINTER;
    }
    let obj = &*(this as *const MyDataObject);
    let cf = (*pformatetc).cfFormat as u32;

    if cf == obj.cf_file_descriptor {
        println!("  -> [GetData] Supplying FileGroupDescriptorW ('{}', {} bytes)", obj.filename, obj.content.len());
        let total_size = core::mem::size_of::<FILEGROUPDESCRIPTORW>();
        let hmem = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_size);
        if hmem == null_mut() {
            return E_OUTOFMEMORY;
        }
        let p = GlobalLock(hmem) as *mut FILEGROUPDESCRIPTORW;
        (*p).cItems = 1;
        let desc = &mut (*p).fgd[0];
        desc.dwFlags = (FD_FILESIZE | FD_ATTRIBUTES) as u32;
        desc.nFileSizeLow = obj.content.len() as u32;
        desc.nFileSizeHigh = 0;
        desc.dwFileAttributes = FILE_ATTRIBUTE_NORMAL;

        let wide: Vec<u16> = obj.filename.encode_utf16().chain(std::iter::once(0)).collect();
        let copy_len = wide.len().min(260);
        let dest_ptr = core::ptr::addr_of_mut!((*desc).cFileName) as *mut u16;
        core::ptr::copy_nonoverlapping(wide.as_ptr(), dest_ptr, copy_len);

        GlobalUnlock(hmem);

        (*pmedium).tymed = TYMED_HGLOBAL as u32;
        (*pmedium).u.hGlobal = hmem;
        (*pmedium).pUnkForRelease = null_mut();
        return S_OK;
    } else if cf == obj.cf_file_contents {
        let requested_tymed = (*pformatetc).tymed;
        println!("  -> [GetData] Supplying FileContents stream (tymed flag: {})", requested_tymed);

        if (requested_tymed & (TYMED_ISTREAM as u32)) != 0 {
            let hmem = GlobalAlloc(GMEM_MOVEABLE, obj.content.len());
            if hmem == null_mut() {
                return E_OUTOFMEMORY;
            }
            let p = GlobalLock(hmem) as *mut u8;
            core::ptr::copy_nonoverlapping(obj.content.as_ptr(), p, obj.content.len());
            GlobalUnlock(hmem);

            let mut pstm: *mut c_void = null_mut();
            let hr = CreateStreamOnHGlobal(hmem, 1, &mut pstm);
            if hr < 0 {
                GlobalFree(hmem);
                return hr;
            }

            (*pmedium).tymed = TYMED_ISTREAM as u32;
            (*pmedium).u.pstm = pstm;
            (*pmedium).pUnkForRelease = null_mut();
            return S_OK;
        } else if (requested_tymed & (TYMED_HGLOBAL as u32)) != 0 {
            let hmem = GlobalAlloc(GMEM_MOVEABLE, obj.content.len());
            if hmem == null_mut() {
                return E_OUTOFMEMORY;
            }
            let p = GlobalLock(hmem) as *mut u8;
            core::ptr::copy_nonoverlapping(obj.content.as_ptr(), p, obj.content.len());
            GlobalUnlock(hmem);

            (*pmedium).tymed = TYMED_HGLOBAL as u32;
            (*pmedium).u.hGlobal = hmem;
            (*pmedium).pUnkForRelease = null_mut();
            return S_OK;
        } else {
            return DV_E_TYMED;
        }
    } else if obj.enable_hdrop && cf == CF_HDROP as u32 {
        println!("  -> [GetData] Supplying CF_HDROP fallback (materializing to %TEMP% for Discord/Chrome)");
        let temp_dir = std::env::temp_dir().join("WinUtilX_VirtualDrops");
        let _ = std::fs::create_dir_all(&temp_dir);
        let file_path = temp_dir.join(&obj.filename);
        if let Err(e) = std::fs::write(&file_path, &obj.content) {
            eprintln!("  [ERROR] Failed to write temp drop file: {:?}", e);
            return E_FAIL;
        }

        let path_str = file_path.to_str().unwrap_or_default();
        let wide_path: Vec<u16> = path_str.encode_utf16().chain(std::iter::once(0)).chain(std::iter::once(0)).collect();
        let dropfiles_size = core::mem::size_of::<DROPFILES>();
        let total_bytes = dropfiles_size + wide_path.len() * 2;

        let hmem = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_bytes);
        if hmem == null_mut() {
            return E_OUTOFMEMORY;
        }
        let p = GlobalLock(hmem) as *mut u8;
        let df = p as *mut DROPFILES;
        (*df).pFiles = dropfiles_size as u32;
        (*df).fWide = 1;

        let dest = p.add(dropfiles_size) as *mut u16;
        core::ptr::copy_nonoverlapping(wide_path.as_ptr(), dest, wide_path.len());
        GlobalUnlock(hmem);

        (*pmedium).tymed = TYMED_HGLOBAL as u32;
        (*pmedium).u.hGlobal = hmem;
        (*pmedium).pUnkForRelease = null_mut();
        return S_OK;
    }

    DV_E_FORMATETC
}

unsafe extern "system" fn data_object_get_data_here(
    _this: *mut c_void,
    _pformatetc: *const FORMATETC,
    _pmedium: *mut STGMEDIUM,
) -> HRESULT {
    E_NOTIMPL
}

unsafe extern "system" fn data_object_query_get_data(
    this: *mut c_void,
    pformatetc: *const FORMATETC,
) -> HRESULT {
    if pformatetc.is_null() {
        return E_POINTER;
    }
    let obj = &*(this as *const MyDataObject);
    let cf = (*pformatetc).cfFormat as u32;
    let tymed = (*pformatetc).tymed;

    if cf == obj.cf_file_descriptor {
        if (tymed & (TYMED_HGLOBAL as u32)) != 0 {
            return S_OK;
        }
        return DV_E_TYMED;
    } else if cf == obj.cf_file_contents {
        if (*pformatetc).lindex != 0 && (*pformatetc).lindex != -1 {
            return DV_E_LINDEX;
        }
        if (tymed & ((TYMED_ISTREAM | TYMED_HGLOBAL) as u32)) != 0 {
            return S_OK;
        }
        return DV_E_TYMED;
    } else if obj.enable_hdrop && cf == CF_HDROP as u32 {
        if (tymed & (TYMED_HGLOBAL as u32)) != 0 {
            return S_OK;
        }
        return DV_E_TYMED;
    }

    DV_E_FORMATETC
}

unsafe extern "system" fn data_object_get_canonical_format_etc(
    _this: *mut c_void,
    _pformatetc_in: *const FORMATETC,
    _pformatetc_out: *mut FORMATETC,
) -> HRESULT {
    DATA_S_SAMEFORMATETC
}

unsafe extern "system" fn data_object_set_data(
    _this: *mut c_void,
    _pformatetc: *const FORMATETC,
    _pmedium: *const STGMEDIUM,
    _f_release: BOOL,
) -> HRESULT {
    E_NOTIMPL
}

unsafe extern "system" fn data_object_enum_format_etc(
    this: *mut c_void,
    dw_direction: u32,
    ppenum_format_etc: *mut *mut c_void,
) -> HRESULT {
    if dw_direction != DATADIR_GET as u32 {
        return E_NOTIMPL;
    }
    let obj = &*(this as *const MyDataObject);
    let mut formats = Vec::new();

    // 1. FileGroupDescriptorW
    formats.push(FORMATETC {
        cfFormat: obj.cf_file_descriptor as u16,
        ptd: null_mut(),
        dwAspect: DVASPECT_CONTENT,
        lindex: -1,
        tymed: TYMED_HGLOBAL as u32,
    });

    // 2. FileContents
    formats.push(FORMATETC {
        cfFormat: obj.cf_file_contents as u16,
        ptd: null_mut(),
        dwAspect: DVASPECT_CONTENT,
        lindex: 0,
        tymed: (TYMED_ISTREAM | TYMED_HGLOBAL) as u32,
    });

    // 3. CF_HDROP (if universal mode)
    if obj.enable_hdrop {
        formats.push(FORMATETC {
            cfFormat: CF_HDROP,
            ptd: null_mut(),
            dwAspect: DVASPECT_CONTENT,
            lindex: -1,
            tymed: TYMED_HGLOBAL as u32,
        });
    }

    SHCreateStdEnumFmtEtc(
        formats.len() as u32,
        formats.as_ptr(),
        ppenum_format_etc,
    )
}

unsafe extern "system" fn data_object_dadvise(
    _this: *mut c_void,
    _pformatetc: *const FORMATETC,
    _advf: u32,
    _p_adv_sink: *mut c_void,
    _pdw_connection: *mut u32,
) -> HRESULT {
    OLE_E_ADVISENOTSUPPORTED
}

unsafe extern "system" fn data_object_dunadvise(_this: *mut c_void, _dw_connection: u32) -> HRESULT {
    OLE_E_ADVISENOTSUPPORTED
}

unsafe extern "system" fn data_object_enum_dadvise(_this: *mut c_void, _ppenum_advise: *mut *mut c_void) -> HRESULT {
    OLE_E_ADVISENOTSUPPORTED
}

static DATA_OBJECT_VTBL: IDataObjectVtbl = IDataObjectVtbl {
    QueryInterface: data_object_query_interface,
    AddRef: data_object_add_ref,
    Release: data_object_release,
    GetData: data_object_get_data,
    GetDataHere: data_object_get_data_here,
    QueryGetData: data_object_query_get_data,
    GetCanonicalFormatEtc: data_object_get_canonical_format_etc,
    SetData: data_object_set_data,
    EnumFormatEtc: data_object_enum_format_etc,
    DAdvise: data_object_dadvise,
    DUnadvise: data_object_dunadvise,
    EnumDAdvise: data_object_enum_dadvise,
};

// ============================================================================
// OLE IDropSource Implementation
// ============================================================================

#[repr(C)]
pub struct MyDropSource {
    pub vtbl: *const IDropSourceVtbl,
    pub ref_count: AtomicU32,
}

unsafe extern "system" fn drop_source_query_interface(
    this: *mut c_void,
    riid: *const windows_sys::core::GUID,
    ppv_object: *mut *mut c_void,
) -> HRESULT {
    if ppv_object.is_null() {
        return E_POINTER;
    }
    if guid_eq(riid, &IID_IUNKNOWN) || guid_eq(riid, &IID_IDROPSOURCE) {
        *ppv_object = this;
        drop_source_add_ref(this);
        S_OK
    } else {
        *ppv_object = null_mut();
        E_NOINTERFACE
    }
}

unsafe extern "system" fn drop_source_add_ref(this: *mut c_void) -> u32 {
    let src = &*(this as *const MyDropSource);
    src.ref_count.fetch_add(1, Ordering::SeqCst) + 1
}

unsafe extern "system" fn drop_source_release(this: *mut c_void) -> u32 {
    let src = &*(this as *const MyDropSource);
    let count = src.ref_count.fetch_sub(1, Ordering::SeqCst) - 1;
    if count == 0 {
        let _ = Box::from_raw(this as *mut MyDropSource);
    }
    count
}

unsafe extern "system" fn drop_source_query_continue_drag(
    _this: *mut c_void,
    f_escape_pressed: BOOL,
    grf_key_state: u32,
) -> HRESULT {
    if f_escape_pressed != 0 {
        return DRAGDROP_S_CANCEL;
    }
    const MK_LBUTTON: u32 = 0x0001;
    if (grf_key_state & MK_LBUTTON) == 0 {
        return DRAGDROP_S_DROP;
    }
    S_OK
}

unsafe extern "system" fn drop_source_give_feedback(_this: *mut c_void, _dw_effect: u32) -> HRESULT {
    DRAGDROP_S_USEDEFAULTCURSORS
}

static DROP_SOURCE_VTBL: IDropSourceVtbl = IDropSourceVtbl {
    QueryInterface: drop_source_query_interface,
    AddRef: drop_source_add_ref,
    Release: drop_source_release,
    QueryContinueDrag: drop_source_query_continue_drag,
    GiveFeedback: drop_source_give_feedback,
};

// ============================================================================
// In-Memory Test Assets (Zero disk files)
// ============================================================================

fn make_text_content() -> Vec<u8> {
    format!(
        "======================================================================\r\n\
         WINUTILX — EPHEMERAL VIRTUAL FILE STREAM (SPIKE A PROTOTYPE)\r\n\
         ======================================================================\r\n\
         Generated On: {}\r\n\
         Delivered Via: Pure Win32 OLE IDataObject\r\n\
         Formats: CFSTR_FILEDESCRIPTORW + CFSTR_FILECONTENTS (IStream)\r\n\
         Storage Overhead: 0 bytes on disk before the drop!\r\n\
         \r\n\
         SUCCESS: If you can read this file, Windows Explorer extracted this\r\n\
         file directly from an in-memory stream without touching disk beforehand!\r\n\
         ======================================================================\r\n",
        "2026-10-07"
    )
    .into_bytes()
}

fn adler32(data: &[u8]) -> u32 {
    let mut s1 = 1u32;
    let mut s2 = 0u32;
    for &b in data {
        s1 = (s1 + b as u32) % 65521;
        s2 = (s2 + s1) % 65521;
    }
    (s2 << 16) | s1
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFFFFFFu32;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xEDB88320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

fn make_test_png(width: u32, height: u32) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR
    let mut ihdr_data = Vec::new();
    ihdr_data.extend_from_slice(&width.to_be_bytes());
    ihdr_data.extend_from_slice(&height.to_be_bytes());
    ihdr_data.push(8); // 8 bits per channel
    ihdr_data.push(2); // RGB
    ihdr_data.push(0); // compression
    ihdr_data.push(0); // filter
    ihdr_data.push(0); // interlace

    let mut ihdr_chunk = Vec::new();
    ihdr_chunk.extend_from_slice(b"IHDR");
    ihdr_chunk.extend_from_slice(&ihdr_data);
    let ihdr_crc = crc32(&ihdr_chunk);

    out.extend_from_slice(&(ihdr_data.len() as u32).to_be_bytes());
    out.extend_from_slice(&ihdr_chunk);
    out.extend_from_slice(&ihdr_crc.to_be_bytes());

    // Scanlines: Cyber cyan box with emerald center
    let mut scanlines = Vec::new();
    for y in 0..height {
        scanlines.push(0u8);
        for x in 0..width {
            if x < 3 || y < 3 || x >= width - 3 || y >= height - 3 {
                scanlines.extend_from_slice(&[0, 242, 254]); // Electric Cyan border
            } else if x >= 12 && x < 20 && y >= 12 && y < 20 {
                scanlines.extend_from_slice(&[16, 185, 129]); // Neon Emerald center
            } else {
                scanlines.extend_from_slice(&[15, 23, 42]); // Deep Slate background
            }
        }
    }

    let adler = adler32(&scanlines);
    let mut zlib_stream = Vec::new();
    zlib_stream.extend_from_slice(&[0x78, 0x01]);
    let len = scanlines.len() as u16;
    let nlen = !len;
    zlib_stream.push(0x01);
    zlib_stream.extend_from_slice(&len.to_le_bytes());
    zlib_stream.extend_from_slice(&nlen.to_le_bytes());
    zlib_stream.extend_from_slice(&scanlines);
    zlib_stream.extend_from_slice(&adler.to_be_bytes());

    // IDAT
    let mut idat_chunk = Vec::new();
    idat_chunk.extend_from_slice(b"IDAT");
    idat_chunk.extend_from_slice(&zlib_stream);
    let idat_crc = crc32(&idat_chunk);

    out.extend_from_slice(&(zlib_stream.len() as u32).to_be_bytes());
    out.extend_from_slice(&idat_chunk);
    out.extend_from_slice(&idat_crc.to_be_bytes());

    // IEND
    let mut iend_chunk = Vec::new();
    iend_chunk.extend_from_slice(b"IEND");
    let iend_crc = crc32(&iend_chunk);
    out.extend_from_slice(&0u32.to_be_bytes());
    out.extend_from_slice(&iend_chunk);
    out.extend_from_slice(&iend_crc.to_be_bytes());

    out
}

// ============================================================================
// UI Test Harness Window
// ============================================================================

struct AppState {
    cf_file_descriptor: u32,
    cf_file_contents: u32,
    drag_pending_card: u8,
    drag_start_pos: (i32, i32),
    status_msg: String,
}

static G_STATE: std::sync::Mutex<Option<AppState>> = std::sync::Mutex::new(None);

const CARD1_RECT: RECT = RECT { left: 24, top: 90, right: 260, bottom: 290 };
const CARD2_RECT: RECT = RECT { left: 284, top: 90, right: 520, bottom: 290 };

unsafe fn point_in_rect(pt: (i32, i32), r: &RECT) -> bool {
    pt.0 >= r.left && pt.0 <= r.right && pt.1 >= r.top && pt.1 <= r.bottom
}

unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = core::mem::zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);

            let mut client: RECT = core::mem::zeroed();
            GetClientRect(hwnd, &mut client);

            // Dark Obsidian background
            let bg_brush = CreateSolidBrush(0x00140C08); // BGR: #080C14
            FillRect(hdc, &client, bg_brush);
            DeleteObject(bg_brush as _);

            SetBkMode(hdc, TRANSPARENT as _);

            // Title
            SetTextColor(hdc, 0x00FEF200); // Electric Cyan
            let title: Vec<u16> = "WinUtilX — Spike A: Virtual File Drag-Out\0".encode_utf16().collect();
            let mut title_rect = RECT { left: 24, top: 16, right: client.right - 24, bottom: 44 };
            DrawTextW(hdc, title.as_ptr(), -1, &mut title_rect, DT_LEFT | DT_SINGLELINE);

            // Subtitle
            SetTextColor(hdc, 0x0094A3B8); // Slate 400
            let sub: Vec<u16> = "Test dragging files directly into Explorer, Discord, or Chrome:\0".encode_utf16().collect();
            let mut sub_rect = RECT { left: 24, top: 48, right: client.right - 24, bottom: 74 };
            DrawTextW(hdc, sub.as_ptr(), -1, &mut sub_rect, DT_LEFT | DT_SINGLELINE);

            // Card 1: Pure Virtual Text File
            let card1_bg = CreateSolidBrush(0x002A170F); // Slate 900
            let cyan_pen = CreatePen(PS_SOLID as _, 2, 0x00FEF200); // Cyan
            let old_brush = SelectObject(hdc, card1_bg as _);
            let old_pen = SelectObject(hdc, cyan_pen as _);
            RoundRect(hdc, CARD1_RECT.left, CARD1_RECT.top, CARD1_RECT.right, CARD1_RECT.bottom, 12, 12);
            SelectObject(hdc, old_brush);
            SelectObject(hdc, old_pen);
            DeleteObject(card1_bg as _);
            DeleteObject(cyan_pen as _);

            SetTextColor(hdc, 0x00FEF200);
            let c1_title: Vec<u16> = "[ PURE VIRTUAL STREAM ]\0".encode_utf16().collect();
            let mut r = RECT { left: CARD1_RECT.left + 14, top: CARD1_RECT.top + 14, right: CARD1_RECT.right - 14, bottom: CARD1_RECT.top + 38 };
            DrawTextW(hdc, c1_title.as_ptr(), -1, &mut r, DT_LEFT | DT_SINGLELINE);

            SetTextColor(hdc, 0x00FFFFFF);
            let c1_name: Vec<u16> = "WinUtilX_Virtual_Snip.txt\0".encode_utf16().collect();
            r = RECT { left: CARD1_RECT.left + 14, top: CARD1_RECT.top + 40, right: CARD1_RECT.right - 14, bottom: CARD1_RECT.top + 64 };
            DrawTextW(hdc, c1_name.as_ptr(), -1, &mut r, DT_LEFT | DT_SINGLELINE);

            SetTextColor(hdc, 0x0094A3B8);
            let c1_desc: Vec<u16> = "• 0 bytes on disk\r\n• FileGroupDescriptorW\r\n• IStream on HGlobal\r\n• Explorer Folders & Desktop\r\n\r\n>>> CLICK & DRAG ME <<<\0".encode_utf16().collect();
            r = RECT { left: CARD1_RECT.left + 14, top: CARD1_RECT.top + 72, right: CARD1_RECT.right - 14, bottom: CARD1_RECT.bottom - 14 };
            DrawTextW(hdc, c1_desc.as_ptr(), -1, &mut r, DT_LEFT);

            // Card 2: Universal Droppable Image
            let card2_bg = CreateSolidBrush(0x002A170F);
            let emerald_pen = CreatePen(PS_SOLID as _, 2, 0x0081B910); // Neon Emerald
            let old_brush2 = SelectObject(hdc, card2_bg as _);
            let old_pen2 = SelectObject(hdc, emerald_pen as _);
            RoundRect(hdc, CARD2_RECT.left, CARD2_RECT.top, CARD2_RECT.right, CARD2_RECT.bottom, 12, 12);
            SelectObject(hdc, old_brush2);
            SelectObject(hdc, old_pen2);
            DeleteObject(card2_bg as _);
            DeleteObject(emerald_pen as _);

            SetTextColor(hdc, 0x0081B910);
            let c2_title: Vec<u16> = "[ UNIVERSAL DROP (+HDROP) ]\0".encode_utf16().collect();
            let mut r2 = RECT { left: CARD2_RECT.left + 14, top: CARD2_RECT.top + 14, right: CARD2_RECT.right - 14, bottom: CARD2_RECT.top + 38 };
            DrawTextW(hdc, c2_title.as_ptr(), -1, &mut r2, DT_LEFT | DT_SINGLELINE);

            SetTextColor(hdc, 0x00FFFFFF);
            let c2_name: Vec<u16> = "WinUtilX_Test_Snip.png\0".encode_utf16().collect();
            r2 = RECT { left: CARD2_RECT.left + 14, top: CARD2_RECT.top + 40, right: CARD2_RECT.right - 14, bottom: CARD2_RECT.top + 64 };
            DrawTextW(hdc, c2_name.as_ptr(), -1, &mut r2, DT_LEFT | DT_SINGLELINE);

            SetTextColor(hdc, 0x0094A3B8);
            let c2_desc: Vec<u16> = "• Valid 32x32 PNG Image\r\n• Virtual Stream + HDROP\r\n• Discord, Slack, Chrome,\r\n  and Explorer support!\r\n\r\n>>> CLICK & DRAG ME <<<\0".encode_utf16().collect();
            r2 = RECT { left: CARD2_RECT.left + 14, top: CARD2_RECT.top + 72, right: CARD2_RECT.right - 14, bottom: CARD2_RECT.bottom - 14 };
            DrawTextW(hdc, c2_desc.as_ptr(), -1, &mut r2, DT_LEFT);

            // Bottom Status Box
            let status_box = RECT { left: 24, top: 310, right: client.right - 24, bottom: client.bottom - 20 };
            let box_brush = CreateSolidBrush(0x001F1A14);
            FillRect(hdc, &status_box, box_brush);
            DeleteObject(box_brush as _);

            if let Ok(guard) = G_STATE.lock() {
                if let Some(state) = guard.as_ref() {
                    SetTextColor(hdc, 0x0038BDF8); // Light cyan
                    let msg_w: Vec<u16> = format!("Status: {}\0", state.status_msg).encode_utf16().collect();
                    let mut status_r = RECT {
                        left: status_box.left + 12,
                        top: status_box.top + 12,
                        right: status_box.right - 12,
                        bottom: status_box.bottom - 12,
                    };
                    DrawTextW(hdc, msg_w.as_ptr(), -1, &mut status_r, DT_LEFT | DT_SINGLELINE);
                }
            }

            EndPaint(hwnd, &ps);
            0
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;

            if let Ok(mut guard) = G_STATE.lock() {
                if let Some(state) = guard.as_mut() {
                    if point_in_rect((x, y), &CARD1_RECT) {
                        state.drag_pending_card = 1;
                        state.drag_start_pos = (x, y);
                        state.status_msg = "Card 1 pressed. Drag mouse out of window to begin...".to_string();
                        InvalidateRect(hwnd, null_mut(), 1);
                    } else if point_in_rect((x, y), &CARD2_RECT) {
                        state.drag_pending_card = 2;
                        state.drag_start_pos = (x, y);
                        state.status_msg = "Card 2 pressed. Drag mouse out of window to begin...".to_string();
                        InvalidateRect(hwnd, null_mut(), 1);
                    }
                }
            }
            0
        }
        WM_MOUSEMOVE => {
            let (card_to_drag, cf_desc, cf_cont) = if let Ok(mut guard) = G_STATE.lock() {
                if let Some(state) = guard.as_mut() {
                    if state.drag_pending_card != 0 {
                        let x = (lparam & 0xFFFF) as i16 as i32;
                        let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
                        let dx = x - state.drag_start_pos.0;
                        let dy = y - state.drag_start_pos.1;
                        if dx * dx + dy * dy >= 16 {
                            let card = state.drag_pending_card;
                            state.drag_pending_card = 0;
                            (Some(card), state.cf_file_descriptor, state.cf_file_contents)
                        } else {
                            (None, 0, 0)
                        }
                    } else {
                        (None, 0, 0)
                    }
                } else {
                    (None, 0, 0)
                }
            } else {
                (None, 0, 0)
            };

            if let Some(card) = card_to_drag {
                let (filename, content, enable_hdrop) = if card == 1 {
                    (
                        "WinUtilX_Virtual_Snip.txt".to_string(),
                        make_text_content(),
                        false, // Pure virtual: NO HDROP
                    )
                } else {
                    (
                        "WinUtilX_Test_Snip.png".to_string(),
                        make_test_png(32, 32),
                        true, // Universal: HDROP enabled
                    )
                };

                println!("\n================================================================================");
                println!("[DRAG INITIATED] Card {}: '{}' (size: {} bytes, enable_hdrop: {})", card, filename, content.len(), enable_hdrop);
                println!("Dragging out... Drop onto Windows Explorer (desktop/folder), Discord, or Chrome!");
                println!("================================================================================");

                let data_obj = Box::into_raw(Box::new(MyDataObject {
                    vtbl: &DATA_OBJECT_VTBL,
                    ref_count: AtomicU32::new(1),
                    filename,
                    content,
                    cf_file_descriptor: cf_desc,
                    cf_file_contents: cf_cont,
                    enable_hdrop,
                }));

                let drop_src = Box::into_raw(Box::new(MyDropSource {
                    vtbl: &DROP_SOURCE_VTBL,
                    ref_count: AtomicU32::new(1),
                }));

                let mut drop_effect: u32 = 0;
                let hr = DoDragDrop(
                    data_obj as *mut c_void,
                    drop_src as *mut c_void,
                    (DROPEFFECT_COPY | DROPEFFECT_MOVE) as u32,
                    &mut drop_effect,
                );

                // Release local ownership references
                drop_source_release(drop_src as *mut c_void);
                data_object_release(data_obj as *mut c_void);

                let status_msg = if hr == DRAGDROP_S_DROP {
                    let effect_str = if (drop_effect & DROPEFFECT_MOVE as u32) != 0 {
                        "DROPEFFECT_MOVE"
                    } else if (drop_effect & DROPEFFECT_COPY as u32) != 0 {
                        "DROPEFFECT_COPY"
                    } else {
                        "DROPEFFECT_NONE"
                    };
                    println!("[DRAG SUCCESS] ✅ File dropped successfully! Effect: {}", effect_str);
                    format!("Drop SUCCESS! Target accepted file (effect: {}). Check your folder/chat!", effect_str)
                } else if hr == DRAGDROP_S_CANCEL {
                    println!("[DRAG CANCELLED] ⚠️ Drag was cancelled by user or dropped on unsupported target.");
                    "Drag cancelled or dropped on an unsupported target.".to_string()
                } else {
                    println!("[DRAG FINISHED] Returned HRESULT: 0x{:08X}", hr as u32);
                    format!("Drag completed (HRESULT: 0x{:08X})", hr as u32)
                };

                if let Ok(mut guard) = G_STATE.lock() {
                    if let Some(state) = guard.as_mut() {
                        state.status_msg = status_msg;
                    }
                }
                InvalidateRect(hwnd, null_mut(), 1);
            }
            0
        }
        WM_LBUTTONUP => {
            if let Ok(mut guard) = G_STATE.lock() {
                if let Some(state) = guard.as_mut() {
                    if state.drag_pending_card != 0 {
                        state.drag_pending_card = 0;
                        state.status_msg = "Click and drag either card to begin drag-and-drop.".to_string();
                        InvalidateRect(hwnd, null_mut(), 1);
                    }
                }
            }
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn main() {
    println!("================================================================================");
    println!("     WINUTILX — SPIKE A: VIRTUAL FILE DRAG-OUT PROTOTYPE");
    println!("================================================================================");
    println!("Objective: Validate zero-disk OLE drag-out into Windows Explorer & Discord.");
    println!("Architecture: IDataObject with FileGroupDescriptorW + IStream + %TEMP% HDROP.");
    println!("================================================================================\n");

    unsafe {
        SetProcessDPIAware();

        let hr = OleInitialize(null_mut());
        if hr < 0 {
            eprintln!("[FATAL] OleInitialize failed with HRESULT: 0x{:08X}", hr as u32);
            return;
        }

        let cf_desc = RegisterClipboardFormatW(CFSTR_FILEDESCRIPTORW);
        let cf_cont = RegisterClipboardFormatW(CFSTR_FILECONTENTS);

        println!("[OLE] Initialized successfully.");
        println!("[OLE] Registered Clipboard Format 'FileGroupDescriptorW': ID {}", cf_desc);
        println!("[OLE] Registered Clipboard Format 'FileContents': ID {}", cf_cont);
        println!("[OLE] Standard Clipboard Format 'CF_HDROP': ID {}\n", CF_HDROP);

        *G_STATE.lock().unwrap() = Some(AppState {
            cf_file_descriptor: cf_desc,
            cf_file_contents: cf_cont,
            drag_pending_card: 0,
            drag_start_pos: (0, 0),
            status_msg: "Ready! Click and drag either card into Explorer, Discord, or Chrome.".to_string(),
        });

        let class_name: Vec<u16> = "WinUtilXSpikeAClass\0".encode_utf16().collect();
        let wnd_class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: null_mut(),
            hIcon: null_mut(),
            hCursor: LoadCursorW(null_mut(), IDC_ARROW),
            hbrBackground: null_mut(),
            lpszMenuName: null_mut(),
            lpszClassName: class_name.as_ptr(),
        };

        RegisterClassW(&wnd_class);

        let title: Vec<u16> = "WinUtilX Spike A — Virtual File Drag-Out\0".encode_utf16().collect();
        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            560,
            420,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
        );

        if hwnd == null_mut() {
            eprintln!("[FATAL] Failed to create test window!");
            OleUninitialize();
            return;
        }

        ShowWindow(hwnd, SW_SHOW);
        UpdateWindow(hwnd);

        println!("--------------------------------------------------------------------------------");
        println!("GUI Window is open! You will see two cards:");
        println!("  1. [PURE VIRTUAL STREAM]    -> Drag into Windows Explorer desktop or folder");
        println!("  2. [UNIVERSAL DROP (+HDROP)] -> Drag into Discord, Chrome, Slack, or Explorer");
        println!("--------------------------------------------------------------------------------\n");

        let mut msg: MSG = core::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        OleUninitialize();
    }
}
