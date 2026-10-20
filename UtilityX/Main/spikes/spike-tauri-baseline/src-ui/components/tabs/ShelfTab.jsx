import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  CheckCircle2,
  ChevronUp,
  Code,
  Download,
  FileArchive,
  FileText,
  Image as ImageIcon,
  Inbox,
  Link as LinkIcon,
  LoaderCircle,
  Trash2,
  UploadCloud,
} from 'lucide-react';

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / (1024 ** unitIndex);
  return `${amount.toFixed(unitIndex === 0 || amount >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function classifyFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/zip' || ['zip', '7z', 'rar', 'tar', 'gz'].includes(extension)) return 'archive';
  if (file.type === 'application/internet-shortcut' || extension === 'url') return 'link';
  if (file.type === 'application/json' || ['json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'rs', 'py', 'md', 'xml', 'yml', 'yaml'].includes(extension)) return 'code';
  return 'doc';
}

async function describeFile(file) {
  const type = classifyFile(file);
  let detail = file.type || file.name.split('.').pop()?.toUpperCase() || 'File';
  if (type === 'image' && globalThis.createImageBitmap) {
    try {
      const bitmap = await createImageBitmap(file);
      detail = `${bitmap.width} × ${bitmap.height}`;
      bitmap.close?.();
    } catch {
      detail = 'Image';
    }
  }

  return {
    id: makeId(),
    file,
    name: file.name,
    bytes: file.size,
    type,
    detail,
    status: 'In memory · this session',
    converted: false,
  };
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = ZIP_CRC_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function write16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function write32(view, offset, value) {
  view.setUint32(offset, value, true);
}

async function createZipFile(items) {
  const localParts = [];
  const directoryParts = [];
  const encoder = new TextEncoder();
  let localOffset = 0;

  for (const item of items) {
    const nameBytes = encoder.encode(item.name.replace(/[\\/]+/g, '_'));
    const content = new Uint8Array(await item.file.arrayBuffer());
    if (content.byteLength > 0xFFFFFFFF || localOffset > 0xFFFFFFFF) {
      throw new Error('This batch is too large for a standard ZIP archive.');
    }
    const checksum = crc32(content);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    write32(localView, 0, 0x04034B50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, 0);
    write16(localView, 12, 0x0021);
    write32(localView, 14, checksum);
    write32(localView, 18, content.byteLength);
    write32(localView, 22, content.byteLength);
    write16(localView, 26, nameBytes.length);
    write16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, content);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    write32(centralView, 0, 0x02014B50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, 0x0021);
    write32(centralView, 16, checksum);
    write32(centralView, 20, content.byteLength);
    write32(centralView, 24, content.byteLength);
    write16(centralView, 28, nameBytes.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    directoryParts.push(centralHeader);
    localOffset += localHeader.length + content.byteLength;
  }

  if (items.length > 0xFFFF || localOffset > 0xFFFFFFFF) {
    throw new Error('This batch exceeds the size limits for a standard ZIP archive.');
  }

  const directorySize = directoryParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  write32(endView, 0, 0x06054B50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, items.length);
  write16(endView, 10, items.length);
  write32(endView, 12, directorySize);
  write32(endView, 16, localOffset);
  write16(endView, 20, 0);

  const fileName = `UtilityX_Shelf_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  return new File([...localParts, ...directoryParts, endRecord], fileName, { type: 'application/zip' });
}

function createDroppedTextItem(text) {
  const value = text.trim();
  if (!value) return null;

  let file;
  let type = 'code';
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      const shortcut = `[InternetShortcut]\r\nURL=${url.href}\r\n`;
      file = new File([shortcut], `${url.hostname || 'Web_Link'}.url`, { type: 'application/internet-shortcut' });
      type = 'link';
    }
  } catch {
    // Non-URL text is staged as a plain text snippet below.
  }

  if (!file) {
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '');
    file = new File([value], `Snippet_${timestamp}.txt`, { type: 'text/plain' });
  }

  return {
    id: makeId(),
    file,
    name: file.name,
    bytes: file.size,
    type,
    detail: type === 'link' ? 'Internet shortcut' : 'Text snippet',
    status: 'In memory · this session',
    converted: false,
  };
}

function getItemIcon(type) {
  switch (type) {
    case 'image': return <ImageIcon className="h-4 w-4 text-cyan-300" />;
    case 'code': return <Code className="h-4 w-4 text-emerald-300" />;
    case 'archive': return <FileArchive className="h-4 w-4 text-amber-300" />;
    case 'link': return <LinkIcon className="h-4 w-4 text-sky-300" />;
    default: return <FileText className="h-4 w-4 text-blue-300" />;
  }
}

export default function ShelfTab({ onCollapse, accent }) {
  const [items, setItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const accentColor = accent?.primary || '#F5F7FF';
  const accentBg = accent?.bgAlpha || 'rgba(255, 255, 255, 0.10)';
  const accentBorder = accent?.borderAlpha || 'rgba(255, 255, 255, 0.24)';
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);

  const showToast = (message) => {
    setToastMsg(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(''), 2600);
  };

  const stageFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file instanceof File);
    if (files.length === 0) return;
    setBusyAction('stage');
    try {
      const staged = await Promise.all(files.map(describeFile));
      setItems((current) => [...staged, ...current]);
      showToast(`${staged.length} ${staged.length === 1 ? 'file' : 'files'} added to the in-memory shelf`);
    } catch (error) {
      showToast(`Could not stage files: ${error?.message || error}`);
    } finally {
      setBusyAction('');
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) {
      await stageFiles(files);
      return;
    }

    const uriList = event.dataTransfer?.getData('text/uri-list') || '';
    const droppedText = uriList.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('#'))
      || event.dataTransfer?.getData('text/plain')
      || '';
    const item = createDroppedTextItem(droppedText);
    if (item) {
      setItems((current) => [item, ...current]);
      showToast(item.type === 'link' ? 'Link staged as an Internet shortcut' : 'Text staged as a snippet');
    }
  };

  const handleFilePicker = (event) => {
    stageFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const handleRemove = (id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    showToast('Item removed from the shelf');
  };

  const handleClearAll = () => {
    setItems([]);
    showToast('Shelf cleared');
  };

  const handleDownload = (item) => {
    const url = URL.createObjectURL(item.file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    showToast(`Downloading ${item.name}`);
  };

  const handleConvert = async (id) => {
    const item = items.find((entry) => entry.id === id);
    if (!item || item.type !== 'image') return;
    setBusyAction(id);
    try {
      const bitmap = await createImageBitmap(item.file);
      const width = bitmap.width;
      const height = bitmap.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image conversion is unavailable in this window.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const webpBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode this image.'))), 'image/webp', 0.92);
      });
      const webpName = item.name.replace(/\.[^.]+$/, '') + '.webp';
      const webpFile = new File([webpBlob], webpName, { type: 'image/webp', lastModified: Date.now() });
      const reduction = item.bytes > 0 ? Math.round((1 - webpFile.size / item.bytes) * 100) : 0;
      setItems((current) => current.map((entry) => entry.id === id ? {
        ...entry,
        file: webpFile,
        name: webpFile.name,
        bytes: webpFile.size,
        detail: `${width} × ${height}`,
        status: reduction > 0 ? `WebP · ${reduction}% smaller` : 'Converted to WebP in memory',
        converted: true,
      } : entry));
      showToast(`Converted to WebP${reduction > 0 ? ` · ${reduction}% smaller` : ''}`);
    } catch (error) {
      showToast(`Image conversion failed: ${error?.message || error}`);
    } finally {
      setBusyAction('');
    }
  };

  const handleZipBatch = async () => {
    if (items.length < 2) return;
    setBusyAction('zip');
    try {
      const zipFile = await createZipFile(items);
      const zipItem = {
        id: makeId(),
        file: zipFile,
        name: zipFile.name,
        bytes: zipFile.size,
        type: 'archive',
        detail: `${items.length} files · uncompressed ZIP`,
        status: 'ZIP created in memory',
        converted: true,
      };
      setItems([zipItem]);
      showToast(`Created ${zipFile.name}`);
    } catch (error) {
      showToast(`Could not create ZIP: ${error?.message || error}`);
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-white">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <div style={{ backgroundColor: accentBg, borderColor: accentBorder }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border">
            <Inbox className="h-4 w-4" style={{ color: accentColor }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide">The Drop Shelf</span>
              <span style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }} className="rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold">Session memory</span>
            </div>
            <p className="truncate text-[10px] text-slate-400">Files stay in memory until the app closes; nothing is copied into the project.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={handleZipBatch} disabled={items.length < 2 || Boolean(busyAction)} className="flex items-center gap-1.5 rounded-xl border border-white/5 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" title="Create an uncompressed ZIP from the staged files">
            {busyAction === 'zip' ? <LoaderCircle className="h-3 w-3 animate-spin text-amber-300" /> : <Archive className="h-3 w-3 text-amber-300" />}
            <span>{busyAction === 'zip' ? 'Zipping' : 'Zip batch'}</span>
          </button>
          <button type="button" onClick={handleClearAll} disabled={items.length === 0 || Boolean(busyAction)} className="flex items-center gap-1 rounded-xl border border-white/5 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-all hover:bg-rose-500/20 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 className="h-3 w-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={handleFilePicker} />
        <button
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false); }}
          onDrop={handleDrop}
          style={dragOver ? { borderColor: accentColor, backgroundColor: accentBg } : {}}
          className={`group flex w-[32%] min-w-[150px] shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-dashed p-3 text-center transition-all hover:border-white/30 disabled:cursor-wait ${dragOver ? '' : 'border-white/15 bg-slate-900/40'}`}
        >
          <div style={{ backgroundColor: accentBg, borderColor: accentBorder }} className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl border shadow-md transition-transform group-hover:scale-105">
            {busyAction === 'stage' ? <LoaderCircle className="h-5 w-5 animate-spin" style={{ color: accentColor }} /> : <UploadCloud className="h-5 w-5" style={{ color: accentColor }} />}
          </div>
          <span className="text-xs font-bold transition-colors group-hover:text-white">Drop files here</span>
          <span className="mt-1 text-[10px] leading-tight text-slate-400">or click to browse</span>
          <span className="mt-3 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[9px] text-slate-500">Files, links, or text</span>
        </button>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-slate-400">
            <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
            <span>{formatBytes(totalBytes)} in memory</span>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {items.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full min-h-36 flex-col items-center justify-center rounded-2xl border border-white/5 bg-slate-900/20 py-8 text-xs text-slate-500">
                  <Inbox className="mb-1 h-6 w-6 text-slate-600" />
                  <span>Shelf is empty</span>
                  <span className="mt-1 text-[10px] text-slate-600">Add a file to stage it for this session.</span>
                </motion.div>
              ) : items.map((item) => (
                <motion.div key={item.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="group flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-2.5 shadow-md transition-colors hover:border-white/20">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-slate-800">{getItemIcon(item.type)}</div>
                    <div className="min-w-0">
                      <div className="max-w-[230px] truncate text-xs font-bold text-white" title={item.name}>{item.name}</div>
                      <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-slate-400">
                        <span className="shrink-0">{formatBytes(item.bytes)}</span>
                        <span className="text-slate-600">·</span>
                        <span className="truncate font-mono text-slate-500">{item.detail}</span>
                      </div>
                      <div className="truncate text-[9px] text-cyan-300/80">{item.status}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.type === 'image' && !item.converted && (
                      <button type="button" onClick={() => handleConvert(item.id)} disabled={Boolean(busyAction)} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:opacity-40" title="Convert the image to WebP in memory">
                        {busyAction === item.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : 'WebP'}
                      </button>
                    )}
                    <button type="button" onClick={() => handleDownload(item)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white" title={`Download ${item.name}`} aria-label={`Download ${item.name}`}>
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => handleRemove(item.id)} disabled={Boolean(busyAction)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40" title="Remove from shelf" aria-label={`Remove ${item.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex h-6 items-center justify-center">
        <AnimatePresence>
          {toastMsg && (
            <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }} className="flex max-w-full items-center gap-1.5 truncate rounded-full border px-3 py-1 text-[10px] font-medium">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{toastMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-center border-t border-white/5 pt-1">
        <button type="button" onClick={onCollapse} className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white">
          <ChevronUp className="h-3.5 w-3.5" />
          <span>Minimize</span>
        </button>
      </div>
    </div>
  );
}
