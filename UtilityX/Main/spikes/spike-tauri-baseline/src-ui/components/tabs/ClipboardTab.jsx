import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, Copy, FileText, Image as ImageIcon, Search, Trash2, Check, ChevronUp } from 'lucide-react';
import { invokeTauriStrict } from '../../utils/tauriBridge';
import LinkPreviewCard from '../LinkPreviewCard';

const formatTime = (timestamp) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp * 1000));

function detectLink(value) {
  const text = value.trim();
  if (!/^https?:\/\//i.test(text) || /\s/.test(text)) return '';
  try { const url = new URL(text); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}

export default function ClipboardTab({ onCollapse, accent }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedImage, setSelectedImage] = useState('');
  const [selectedImageError, setSelectedImageError] = useState('');
  const [selectedUrl, setSelectedUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState('');

  const refreshItems = useCallback(async () => {
    try {
      const history = await invokeTauriStrict('clipboard_list_items');
      setItems(Array.isArray(history) ? history : []);
      setSelectedId((current) => history?.some((item) => item.id === current) ? current : history?.at(-1)?.id ?? null);
      setError('');
    } catch (failure) {
      setError(failure?.message || 'Could not read clipboard history.');
    }
  }, []);

  useEffect(() => {
    refreshItems();
    const handleUpdate = () => refreshItems();
    window.addEventListener('utilityx-clipboard-history-updated', handleUpdate);
    return () => window.removeEventListener('utilityx-clipboard-history-updated', handleUpdate);
  }, [refreshItems]);

  const selectedItem = items.find((item) => item.id === selectedId) || items.at(-1) || null;
  const filteredItems = useMemo(() => items.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || item.preview.toLowerCase().includes(query);
    const matchesType = filterType === 'All' || (filterType === 'Text' ? item.kind === 'text' : item.kind === 'image');
    return matchesSearch && matchesType;
  }), [items, searchQuery, filterType]);
  useEffect(() => {
    let cancelled = false;
    setSelectedImage('');
    setSelectedImageError('');
    setSelectedUrl('');
    if (!selectedItem) {
      setSelectedText('');
      return undefined;
    }
    if (selectedItem.kind === 'image') {
      setSelectedText('');
      invokeTauriStrict('clipboard_image_preview', { id: selectedItem.id })
        .then((url) => { if (!cancelled) setSelectedImage(url); })
        .catch((failure) => { if (!cancelled) setSelectedImageError(failure?.message || 'Could not preview this clipboard image.'); });
      return () => { cancelled = true; };
    }
    invokeTauriStrict('clipboard_read_item', { id: selectedItem.id })
      .then((text) => { if (!cancelled) { setSelectedText(text); setSelectedUrl(detectLink(text)); } })
      .catch(() => { if (!cancelled) setSelectedText(selectedItem.preview); });
    return () => { cancelled = true; };
  }, [selectedItem?.id, selectedItem?.kind]);

  const copyItem = async (item) => {
    try {
      await invokeTauriStrict('clipboard_copy_item', { id: item.id });
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((current) => current === item.id ? null : current), 1300);
      setError('');
    } catch (failure) {
      setError(failure?.message || 'Could not copy this item.');
    }
  };

  const deleteItem = async (event, item) => {
    event.stopPropagation();
    try {
      await invokeTauriStrict('clipboard_delete_item', { id: item.id });
      await refreshItems();
    } catch (failure) {
      setError(failure?.message || 'Could not remove this item.');
    }
  };

  const clearHistory = async () => {
    try {
      await invokeTauriStrict('clipboard_clear');
      await refreshItems();
    } catch (failure) {
      setError(failure?.message || 'Could not clear clipboard history.');
    }
  };

  const accentColor = accent?.primary || '#F5F7FF';
  const enableSearchInput = async (event) => {
    event.preventDefault();
    const input = event.currentTarget;
    try {
      await invokeTauriStrict('set_clipboard_focus_mode', { enabled: false });
      input.focus();
    } catch (failure) {
      setError(failure?.message || 'Could not focus clipboard search.');
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/70 border border-white/5">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input value={searchQuery} onMouseDown={enableSearchInput} onChange={(event) => setSearchQuery(event.target.value)} placeholder={`Search ${items.length} copied items...`} className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none" />
        </div>
        <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-white/5">
          {['All', 'Text', 'Images'].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} style={filterType === type ? { backgroundColor: accentColor, color: '#050505' } : {}} className={`px-3 py-1 rounded-lg text-[11px] font-semibold ${filterType === type ? '' : 'text-slate-400 hover:text-white'}`}>{type}</button>
          ))}
        </div>
        <button onClick={clearHistory} disabled={!items.length} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/5 text-slate-400 hover:text-rose-300 disabled:opacity-40 text-xs"><Trash2 className="w-3.5 h-3.5" /> Clear</button>
      </div>

      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
        <div className="col-span-7 rounded-2xl bg-slate-900/60 border border-white/5 overflow-y-auto p-2 space-y-1.5">
          {filteredItems.length === 0 ? (
            <div className="h-full min-h-32 flex flex-col items-center justify-center text-center text-slate-500 px-5">
              <Clipboard className="w-6 h-6 mb-2 opacity-60" />
              <span className="text-xs font-medium text-slate-300">{items.length ? 'No matching clipboard items' : 'Copy text or an image to start your history'}</span>
              <span className="text-[10px] mt-1">Copied items are saved locally as you copy them.</span>
            </div>
          ) : filteredItems.map((item) => (
            <div key={item.id} onClick={() => setSelectedId(item.id)} style={selectedItem?.id === item.id ? { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.22)' } : {}} className={`p-2.5 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-2 ${selectedItem?.id === item.id ? '' : 'bg-slate-800/40 border-transparent hover:border-white/10'}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-slate-300">{item.kind === 'image' ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}</div>
                <div className="min-w-0"><div className="text-xs font-semibold text-white truncate">{item.preview}</div><div className="text-[10px] text-slate-500 mt-0.5">{item.kind === 'image' ? 'Image' : 'Text'} · {formatTime(item.copiedAt)} · {item.bytes < 1024 ? `${item.bytes} B` : `${(item.bytes / 1024).toFixed(1)} KB`}</div></div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={(event) => { event.stopPropagation(); copyItem(item); }} title="Copy this item again" className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10">{copiedId === item.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</button>
                <button onClick={(event) => deleteItem(event, item)} title="Remove from history" className="p-1.5 rounded-md text-slate-500 hover:text-rose-300 hover:bg-white/10"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="col-span-5 rounded-2xl bg-slate-900/60 border border-white/5 p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <div className="text-xs font-bold text-white">Preview</div>
            {selectedItem && <button onClick={() => copyItem(selectedItem)} style={{ backgroundColor: accentColor, color: '#050505' }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold">{copiedId === selectedItem.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy</button>}
          </div>
          <div className="mt-3 flex-1 min-h-0 rounded-xl bg-slate-950/70 border border-white/5 p-3 overflow-y-auto text-xs text-slate-200 font-mono leading-relaxed whitespace-pre-wrap break-words">
            {selectedItem ? selectedItem.kind === 'image'
              ? selectedImage ? <div className="flex h-full min-h-28 flex-col items-center justify-center gap-2"><img src={selectedImage} alt="Copied clipboard image" className="max-h-full max-w-full rounded-lg object-contain" /><span className="text-[10px] text-slate-400">Click Copy, then paste into an image-compatible app.</span></div> : <div className="h-full min-h-28 flex flex-col items-center justify-center text-slate-400"><ImageIcon className="w-8 h-8 mb-2" /><span>{selectedImageError || 'Loading image preview…'}</span></div>
              : selectedUrl ? <div className="flex h-full flex-col gap-3"><LinkPreviewCard url={selectedUrl} showArchive compact /><div className="break-all text-[10px] text-slate-500">{selectedText || selectedItem.preview}</div></div>
                : selectedText || selectedItem.preview
              : <div className="h-full flex items-center justify-center text-slate-600 font-sans">Select a copied item to preview</div>}
          </div>
          {error && <div className="text-[10px] text-rose-300 mt-2">{error}</div>}
          <div className="flex justify-between items-center pt-2 mt-2 border-t border-white/5 text-[10px] text-slate-500"><span>Ctrl+Shift+V · Batch paste oldest to newest</span><span>Local history</span></div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-slate-400">
        <span>Copy normally anywhere. UtilityX saves text and images automatically; click Copy to put an item back on the clipboard.</span>
        <button onClick={onCollapse} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] font-medium border border-white/5"><ChevronUp className="w-3.5 h-3.5" /> Minimize</button>
      </div>
    </div>
  );
}
