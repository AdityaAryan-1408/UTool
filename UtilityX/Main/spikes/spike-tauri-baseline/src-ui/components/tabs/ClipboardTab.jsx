import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  FileText, 
  ExternalLink, 
  ImageIcon, 
  Code2, 
  Pin, 
  Copy, 
  Trash2, 
  ChevronUp,
  Check
} from 'lucide-react';

const SAMPLE_CLIPBOARD_ITEMS = [
  {
    id: 1,
    category: 'PINNED',
    type: 'Text',
    preview: 'mail42@example.com',
    fullContent: 'mail42@example.com',
    size: '18 characters · 1 word · 1 line',
    time: 'Pinned',
    isPinned: true
  },
  {
    id: 2,
    category: 'TODAY',
    type: 'Text',
    preview: "Hey Arsh, what's up? How about we go get some coffee at 10 in the morning...",
    fullContent: "Hey Arsh, what's up? How about we go get some coffee at 10 in the morning, and then hang out at the park for a bit?",
    size: '104 characters · 22 words · 1 line',
    time: 'Today, 9:41 AM',
    isPinned: false
  },
  {
    id: 3,
    category: 'TODAY',
    type: 'Link',
    preview: 'https://www.amazon.in/dp/B08N5WRWNW',
    fullContent: 'https://www.amazon.in/dp/B08N5WRWNW?ref_=cm_sw_r_cp_ud_dp_8803G',
    size: '56 characters · 1 link',
    time: 'Today, 9:15 AM',
    isPinned: false
  },
  {
    id: 4,
    category: 'TODAY',
    type: 'Code',
    preview: 'ngrok http --url=good-3800',
    fullContent: 'ngrok http --url=good-3800.ngrok-free.app 5173',
    size: '42 characters · Shell command',
    time: 'Today, 8:40 AM',
    isPinned: false
  },
  {
    id: 5,
    category: 'TODAY',
    type: 'Image',
    preview: 'Image · 1920x1080 (Screenshot)',
    fullContent: 'Image buffer · 1920x1080 RGBA PNG (1.4 MB)',
    size: '1920x1080 · 1.4 MB PNG',
    time: 'Today, 8:12 AM',
    isPinned: false
  }
];

export default function ClipboardTab({ onCollapse, accent }) {
  const [items, setItems] = useState(SAMPLE_CLIPBOARD_ITEMS);
  const [selectedId, setSelectedId] = useState(2);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [copied, setCopied] = useState(false);

  const accentColor = accent?.primary || '#00F2FE';
  const activeTextColor = accent?.activeText || '#04101E';
  const accentBg = accent?.bgAlpha || 'rgba(0, 242, 254, 0.15)';
  const accentBorder = accent?.borderAlpha || 'rgba(0, 242, 254, 0.35)';

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.fullContent.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'All' || item.type.toLowerCase() === filterType.toLowerCase() || 
                          (filterType === 'Images' && item.type === 'Image') ||
                          (filterType === 'Links' && item.type === 'Link');
    return matchesSearch && matchesFilter;
  });

  const selectedItem = items.find((i) => i.id === selectedId) || items[0];

  const handleCopy = () => {
    if (selectedItem) {
      navigator.clipboard?.writeText(selectedItem.fullContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const togglePin = (id, e) => {
    e.stopPropagation();
    setItems(items.map((i) => i.id === id ? { ...i, isPinned: !i.isPinned } : i));
  };

  const removeItem = (id, e) => {
    e.stopPropagation();
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="flex flex-col gap-3 h-full justify-between">
      {/* Top Search & Filter Bar */}
      <div className="flex items-center justify-between gap-3">
        {/* Search Input */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/70 border border-white/5">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search 23 items..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-white/5">
          {['All', 'Text', 'Images', 'Links'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              style={filterType === f ? { backgroundColor: accentColor, color: activeTextColor } : {}}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                filterType === f 
                  ? 'shadow-sm font-bold' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* 2-Pane Main View */}
      <div className="grid grid-cols-12 gap-3.5 flex-1 min-h-0">
        {/* Left List Pane (6 cols) */}
        <div className="col-span-6 p-2 rounded-2xl bg-slate-900/60 border border-white/5 overflow-y-auto space-y-1.5 max-h-[300px]">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              style={selectedId === item.id ? { backgroundColor: accentBg, borderColor: accentBorder } : {}}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                selectedId === item.id 
                  ? '' 
                  : 'bg-slate-800/40 border-transparent hover:border-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div 
                  style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                >
                  {item.type === 'Link' ? <ExternalLink className="w-3.5 h-3.5" /> :
                   item.type === 'Image' ? <ImageIcon className="w-3.5 h-3.5" /> :
                   item.type === 'Code' ? <Code2 className="w-3.5 h-3.5" /> :
                   <FileText className="w-3.5 h-3.5" />}
                </div>

                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${selectedId === item.id ? 'text-white' : 'text-slate-200'}`}>
                    {item.preview}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.time}</div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => togglePin(item.id, e)}
                  style={{ color: item.isPinned ? accentColor : undefined }}
                  className={`p-1 rounded-md transition-colors ${item.isPinned ? '' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <Pin className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => removeItem(item.id, e)}
                  className="p-1 rounded-md text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Right Preview Pane (6 cols) */}
        <div className="col-span-6 p-4 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col justify-between max-h-[300px]">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-bold text-white">Item Preview</span>
              <button
                onClick={handleCopy}
                style={{ backgroundColor: accentColor, color: activeTextColor }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* Content Preview Box */}
            <div className="mt-3 p-3 rounded-xl bg-slate-950/70 border border-white/5 text-xs text-slate-200 font-mono leading-relaxed max-h-36 overflow-y-auto">
              {selectedItem?.fullContent}
            </div>
          </div>

          {/* Metadata Footer */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
            <div>
              <span className="font-semibold text-slate-300">Type:</span> {selectedItem?.type}
            </div>
            <div>
              <span className="font-semibold text-slate-300">Size:</span> {selectedItem?.size}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Shortcuts Legend & Minimize Button */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-slate-400">
        <div className="flex items-center gap-3">
          <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono">↵</kbd> Paste</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono">Space</kbd> Quick copy</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono">Ctrl+P</kbd> Pin</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono">Del</kbd> Remove</span>
        </div>

        <button 
          onClick={onCollapse}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] font-medium transition-colors cursor-pointer border border-white/5"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          <span>Minimize</span>
        </button>
      </div>
    </div>
  );
}
