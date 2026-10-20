import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  FolderPlus, 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp, 
  Check 
} from 'lucide-react';
import { WALLPAPERS } from '../../utils/wallpapers';

export default function WallpaperTab({ activeIndex = 0, onSelectWallpaper, onCollapse, accent }) {
  const [currentIdx, setCurrentIdx] = useState(activeIndex);
  const [filter, setFilter] = useState('Recent');
  const lastWheelTime = useRef(0);

  useEffect(() => {
    setCurrentIdx(activeIndex);
  }, [activeIndex]);

  const handleSelect = (idx) => {
    setCurrentIdx(idx);
    if (onSelectWallpaper) {
      onSelectWallpaper(idx);
    }
  };

  const prev = () => {
    const nextIdx = (currentIdx - 1 + WALLPAPERS.length) % WALLPAPERS.length;
    handleSelect(nextIdx);
  };

  const next = () => {
    const nextIdx = (currentIdx + 1) % WALLPAPERS.length;
    handleSelect(nextIdx);
  };

  // Smooth mouse-wheel scrolling
  const handleWheel = (e) => {
    const now = Date.now();
    // 250ms throttle so one wheel swipe advances exactly one wallpaper card
    if (now - lastWheelTime.current < 250) return;

    if (e.deltaY > 15 || e.deltaX > 15) {
      lastWheelTime.current = now;
      next();
    } else if (e.deltaY < -15 || e.deltaX < -15) {
      lastWheelTime.current = now;
      prev();
    }
  };

  const accentColor = accent?.primary || '#00F2FE';
  const activeTextColor = accent?.activeText || '#04101E';

  return (
    <div className="flex flex-col gap-2 h-full justify-between" onWheel={handleWheel}>
      {/* Top Filter Chips */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {['Recent', 'My folder (0 pictures)'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={filter === f ? { backgroundColor: accentColor, color: activeTextColor } : {}}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                filter === f
                  ? 'shadow-md font-bold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <button className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/60 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium border border-white/5 transition-colors cursor-pointer">
          <FolderPlus className="w-3.5 h-3.5" style={{ color: accentColor }} />
          <span>Add folder</span>
        </button>
      </div>

      {/* 3D Cover Flow Carousel with wheel & drag support */}
      <div 
        className="relative w-full h-48 flex items-center justify-center overflow-hidden py-1 select-none" 
        style={{ perspective: '1000px' }}
      >
        {/* Navigation Buttons */}
        <button
          onClick={prev}
          className="absolute left-2 z-20 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white flex items-center justify-center border border-white/10 backdrop-blur-md transition-all shadow-lg cursor-pointer"
          title="Previous Wallpaper"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={next}
          className="absolute right-2 z-20 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white flex items-center justify-center border border-white/10 backdrop-blur-md transition-all shadow-lg cursor-pointer"
          title="Next Wallpaper"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* 3D Cards Track */}
        <div className="flex items-center justify-center w-full h-full relative">
          {WALLPAPERS.map((wp, idx) => {
            const offset = idx - currentIdx;
            const isCenter = offset === 0;
            const isVisible = Math.abs(offset) <= 2;

            if (!isVisible) return null;

            // 3D Cover Flow Transform Calculations
            const translateX = offset * 135;
            const rotateY = offset * -28;
            const scale = isCenter ? 1.05 : 0.82;
            const zIndex = 10 - Math.abs(offset);
            const opacity = isCenter ? 1 : 0.55;

            return (
              <motion.div
                key={wp.id}
                onClick={() => handleSelect(idx)}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(e, info) => {
                  if (info.offset.x > 40) prev();
                  else if (info.offset.x < -40) next();
                }}
                animate={{
                  x: translateX,
                  scale,
                  rotateY,
                  opacity,
                  zIndex,
                }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  transformStyle: 'preserve-3d',
                  backgroundImage: `url(${wp.url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderColor: isCenter ? accentColor : 'rgba(255, 255, 255, 0.1)',
                  boxShadow: isCenter ? `0 8px 24px ${accent?.borderAlpha || 'rgba(245, 158, 11, 0.3)'}` : 'none'
                }}
                className={`absolute w-60 h-36 rounded-2xl overflow-hidden cursor-pointer shadow-2xl border transition-all ${
                  isCenter ? 'ring-2' : 'hover:opacity-90'
                }`}
              >
                {/* Gradient vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent flex flex-col justify-end p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white drop-shadow-md">{wp.title}</div>
                      <div className="text-[10px] text-slate-300 drop-shadow-md">{wp.location}</div>
                    </div>
                    {isCenter && (
                      <span 
                        style={{ backgroundColor: accentColor, color: activeTextColor }}
                        className="w-5 h-5 rounded-full flex items-center justify-center shadow-md font-bold"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
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
