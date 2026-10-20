import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight, Copy, Check, ExternalLink, HelpCircle } from 'lucide-react';

export default function LassoOverlay({ isOpen, onClose }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [detectedItem, setDetectedItem] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPoints([]);
      setDetectedItem(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Redraw loop
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (points.length > 1) {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#F5F7FF';
      ctx.shadowColor = '#F5F7FF';
      ctx.shadowBlur = 15;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }
  }, [isOpen, points]);

  // Handle drawing events
  const handleMouseDown = (e) => {
    setIsDrawing(true);
    setPoints([{ x: e.clientX, y: e.clientY }]);
    setDetectedItem(null);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    setPoints((prev) => [...prev, { x: e.clientX, y: e.clientY }]);
  };

  const handleMouseUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (points.length > 8) {
      // Calculate center of drawn loop
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const maxY = Math.max(...points.map((p) => p.y));

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      setDetectedItem({
        x: cx,
        y: cy,
        title: 'Ashfall on Steam (2018)',
        category: 'Adventure / Open World RPG',
        rating: '9.8 ★ (84K Reviews)',
        aiAnalysis:
          'Ashfall is an acclaimed post-apocalyptic co-op adventure game developed by Kiln & Ember. Players praise the dynamic weather, retro-futuristic sound design, and rich lore.',
        actions: ['Check Specs', 'Watch Trailer', 'Track Price']
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden cursor-crosshair select-none bg-black/60 backdrop-blur-[2px]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Top Instruction Pill */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center gap-3 py-2 px-5 rounded-full bg-slate-900/90 border border-cyan-500/40 shadow-2xl text-xs font-semibold text-white"
        >
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>Draw a circle around anything on screen to ask Hitodama</span>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      </div>

      {/* Detected Insight Modal Card */}
      <AnimatePresence>
        {detectedItem && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="absolute z-20 pointer-events-auto w-[380px] -translate-x-1/2 -translate-y-1/2"
            style={{
              left: Math.min(window.innerWidth - 210, Math.max(210, detectedItem.x)),
              top: Math.min(window.innerHeight - 200, Math.max(160, detectedItem.y + 60))
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-panel rounded-2xl p-4 shadow-2xl border border-cyan-500/30">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{detectedItem.title}</h3>
                    <p className="text-[10px] text-cyan-400 font-medium">{detectedItem.category}</p>
                  </div>
                </div>
                <button
                  onClick={() => setDetectedItem(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mt-3 p-3 rounded-xl bg-slate-900/70 border border-white/5 text-xs text-slate-300 leading-relaxed">
                {detectedItem.aiAnalysis}
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                <span className="text-[11px] font-bold text-emerald-400">{detectedItem.rating}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-lg shadow-cyan-500/20"
                  >
                    <span>Ask AI</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
