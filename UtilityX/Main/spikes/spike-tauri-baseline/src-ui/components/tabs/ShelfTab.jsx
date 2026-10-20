import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Inbox, 
  UploadCloud, 
  FileText, 
  Image as ImageIcon, 
  Code, 
  Archive, 
  Trash2, 
  ExternalLink, 
  Sparkles, 
  ChevronUp, 
  GripVertical,
  CheckCircle2,
  FileArchive
} from 'lucide-react';

const INITIAL_STAGED_ITEMS = [
  {
    id: 1,
    name: 'Dashboard_Mockup_v2.png',
    size: '2.4 MB',
    type: 'image',
    dimensions: '2560 × 1440',
    status: 'In-Memory Stream',
    converted: false,
  },
  {
    id: 2,
    name: 'winutilx-daemon-spec.pdf',
    size: '420 KB',
    type: 'doc',
    dimensions: '14 Pages',
    status: 'OLE Stream Ready',
    converted: false,
  },
  {
    id: 3,
    name: 'theme_palette_electric_blue.json',
    size: '12 KB',
    type: 'code',
    dimensions: 'JSON Config',
    status: 'Memory Buffer',
    converted: false,
  },
];

export default function ShelfTab({ onCollapse, accent }) {
  const [items, setItems] = useState(INITIAL_STAGED_ITEMS);
  const [dragOver, setDragOver] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const accentColor = accent?.primary || '#00F2FE';
  const activeTextColor = accent?.activeText || '#04101E';
  const accentBg = accent?.bgAlpha || 'rgba(0, 242, 254, 0.15)';
  const accentBorder = accent?.borderAlpha || 'rgba(0, 242, 254, 0.35)';

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleRemove = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    showToast('Item released from memory');
  };

  const handleClearAll = () => {
    setItems([]);
    showToast('Shelf buffer cleared');
  };

  const handleConvert = (id) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id && item.type === 'image') {
          return {
            ...item,
            name: item.name.replace('.png', '.webp'),
            size: '680 KB',
            converted: true,
          };
        }
        return item;
      })
    );
    showToast('Converted to WebP (-72% file size)');
  };

  const handleZipBatch = () => {
    if (items.length === 0) return;
    const zipItem = {
      id: Date.now(),
      name: `WinUtilX_Batch_${Date.now().toString().slice(-4)}.zip`,
      size: '2.8 MB',
      type: 'archive',
      dimensions: `${items.length} items bundled`,
      status: 'Virtual Zip Stream',
      converted: true,
    };
    setItems([zipItem]);
    showToast(`Bundled ${items.length} items into Virtual Zip`);
  };

  const handleSimulateDrop = () => {
    const randomId = Date.now();
    const newItem = {
      id: randomId,
      name: `Snip_${randomId.toString().slice(-4)}.png`,
      size: '1.8 MB',
      type: 'image',
      dimensions: '1920 × 1080',
      status: 'In-Memory Stream',
      converted: false,
    };
    setItems((prev) => [newItem, ...prev]);
    showToast('New item staged into Zero-Disk buffer');
  };

  const getItemIcon = (type) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="w-4 h-4 text-cyan-400" />;
      case 'doc':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'code':
        return <Code className="w-4 h-4 text-emerald-400" />;
      case 'archive':
        return <FileArchive className="w-4 h-4 text-amber-400" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full justify-between">
      {/* Header Info & Actions */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div 
            style={{ backgroundColor: accentBg, borderColor: accentBorder }}
            className="w-7 h-7 rounded-xl flex items-center justify-center border"
          >
            <Inbox className="w-3.5 h-3.5" style={{ color: accentColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">The Drop Shelf</span>
              <span 
                style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }}
                className="text-[9px] font-mono px-2 py-0.5 rounded-full border font-bold"
              >
                Zero-Disk Stager
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Drag items directly into Discord, Explorer, or Slack without saving
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZipBatch}
            disabled={items.length < 2}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-medium border border-white/5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Consolidate items into a single zip"
          >
            <Archive className="w-3 h-3 text-amber-400" />
            <span>Zip Batch</span>
          </button>

          <button
            onClick={handleClearAll}
            disabled={items.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-[11px] font-medium border border-white/5 transition-all cursor-pointer disabled:opacity-40"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Drop Zone + Staged Cards Track */}
      <div className="grid grid-cols-12 gap-3 flex-1 overflow-hidden">
        {/* Left: Quick Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleSimulateDrop();
          }}
          onClick={handleSimulateDrop}
          style={dragOver ? { borderColor: accentColor, backgroundColor: accentBg } : {}}
          className={`col-span-4 rounded-2xl border-2 border-dashed border-white/15 bg-slate-900/40 p-4 flex flex-col items-center justify-center text-center transition-all cursor-pointer group hover:border-white/30`}
        >
          <div 
            style={{ backgroundColor: accentBg, borderColor: accentBorder }}
            className="w-11 h-11 rounded-2xl flex items-center justify-center border mb-2 group-hover:scale-110 transition-transform shadow-md"
          >
            <UploadCloud className="w-5 h-5" style={{ color: accentColor }} />
          </div>
          <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
            Drop Anything Here
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
            Files, images, links, or code
          </span>
          <span className="text-[9px] font-mono mt-2 text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">
            + Click to Stage Sample
          </span>
        </div>

        {/* Right: Staged Cards List */}
        <div className="col-span-8 overflow-y-auto space-y-2 pr-1 max-h-[220px]">
          <AnimatePresence>
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-8 border border-white/5 rounded-2xl bg-slate-900/20">
                <Inbox className="w-6 h-6 mb-1 text-slate-600" />
                <span>Shelf is empty</span>
                <span className="text-[10px] text-slate-600 mt-0.5">Drag any file to stage it temporarily</span>
              </div>
            ) : (
              items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-3 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-white/20 transition-all flex items-center justify-between group shadow-md"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Drag Grip Handle */}
                    <div 
                      className="cursor-grab active:cursor-grabbing text-slate-600 group-hover:text-slate-300 p-0.5"
                      title="Drag directly out into Discord, Slack or Explorer"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 border border-white/5">
                      {getItemIcon(item.type)}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate max-w-[200px]">
                        {item.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>{item.size}</span>
                        <span>·</span>
                        <span className="text-slate-500 font-mono">{item.dimensions}</span>
                        <span>·</span>
                        <span className="text-cyan-400 font-medium">{item.status}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.type === 'image' && !item.converted && (
                      <button
                        onClick={() => handleConvert(item.id)}
                        className="px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/30 transition-colors cursor-pointer"
                        title="Losslessly convert to WebP to save bandwidth"
                      >
                        WebP
                      </button>
                    )}

                    <button
                      onClick={() => handleRemove(item.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Discard from memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Toast Bar / Status Footer */}
      <div className="h-5 flex items-center justify-center">
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }}
            className="flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-[11px] font-medium"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </div>

      {/* Bottom Minimize Button */}
      <div className="flex justify-center pt-0.5 border-t border-white/5">
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
