import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, Square, X } from 'lucide-react';
import { invokeTauriStrict } from '../utils/tauriBridge';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

async function cropScreen(capture, rect, shape) {
  const scaleX = capture.width / window.innerWidth;
  const scaleY = capture.height / window.innerHeight;
  let left = clamp(Math.floor(rect.left * scaleX), 0, capture.width);
  let top = clamp(Math.floor(rect.top * scaleY), 0, capture.height);
  let right = clamp(Math.ceil(rect.right * scaleX), 0, capture.width);
  let bottom = clamp(Math.ceil(rect.bottom * scaleY), 0, capture.height);
  if (shape === 'square') {
    const side = Math.min(right - left, bottom - top);
    right = left + side;
    bottom = top + side;
  }
  if (right - left < 8 || bottom - top < 8) throw new Error('Select a larger screenshot area.');

  const sourceBitmap = await createImageBitmap(await fetch(capture.bitmapDataUrl).then((response) => response.blob()));
  const source = document.createElement('canvas');
  source.width = capture.width;
  source.height = capture.height;
  const sourceContext = source.getContext('2d');
  sourceContext.drawImage(sourceBitmap, 0, 0);
  sourceBitmap.close();

  const output = document.createElement('canvas');
  output.width = right - left;
  output.height = bottom - top;
  output.getContext('2d').drawImage(source, left, top, output.width, output.height, 0, 0, output.width, output.height);
  return new Promise((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the screenshot crop.')), 'image/png'));
}

export default function ScreenshotOverlay({ onClose, onCaptured }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [background, setBackground] = useState('');
  const [capture, setCapture] = useState(null);
  const [selection, setSelection] = useState(null);
  const [shape, setShape] = useState('rectangle');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      onClose();
    }, 15_000);
    invokeTauriStrict('capture_screen').then((result) => {
      if (cancelled) return;
      setCapture(result);
      setBackground(result.bitmapDataUrl);
    }).catch((failure) => {
      if (!cancelled) setError(String(failure?.message || failure));
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, []);

  const pointFromEvent = (event) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    return { x: event.clientX - (bounds?.left || 0), y: event.clientY - (bounds?.top || 0) };
  };

  const beginDrag = (event, mode, corner = '') => {
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    const container = containerRef.current;
    if (container?.setPointerCapture) container.setPointerCapture(event.pointerId);
    if (mode === 'draw') {
      dragRef.current = { mode, start: point, initial: null };
      setSelection({ left: point.x, top: point.y, right: point.x, bottom: point.y });
      return;
    }
    dragRef.current = { mode, corner, start: point, initial: selection };
  };

  const updateDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event);
    if (drag.mode === 'draw') {
      let dx = point.x - drag.start.x;
      let dy = point.y - drag.start.y;
      if (shape === 'square') {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * side;
        dy = Math.sign(dy || 1) * side;
      }
      const width = containerRef.current?.clientWidth || window.innerWidth;
      const height = containerRef.current?.clientHeight || window.innerHeight;
      setSelection({
        left: clamp(Math.min(drag.start.x, drag.start.x + dx), 0, width),
        top: clamp(Math.min(drag.start.y, drag.start.y + dy), 0, height),
        right: clamp(Math.max(drag.start.x, drag.start.x + dx), 0, width),
        bottom: clamp(Math.max(drag.start.y, drag.start.y + dy), 0, height),
      });
      return;
    }
    const initial = drag.initial;
    if (!initial) return;
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (drag.mode === 'move') {
      const width = initial.right - initial.left;
      const height = initial.bottom - initial.top;
      const left = clamp(initial.left + dx, 0, window.innerWidth - width);
      const top = clamp(initial.top + dy, 0, window.innerHeight - height);
      setSelection({ left, top, right: left + width, bottom: top + height });
      return;
    }
    let { left, top, right, bottom } = initial;
    if (drag.corner.includes('w')) left = clamp(left + dx, 0, right - 8);
    if (drag.corner.includes('e')) right = clamp(right + dx, left + 8, window.innerWidth);
    if (drag.corner.includes('n')) top = clamp(top + dy, 0, bottom - 8);
    if (drag.corner.includes('s')) bottom = clamp(bottom + dy, top + 8, window.innerHeight);
    if (shape === 'square') {
      const side = Math.max(right - left, bottom - top);
      if (drag.corner.includes('w')) left = Math.max(0, right - side); else right = Math.min(window.innerWidth, left + side);
      if (drag.corner.includes('n')) top = Math.max(0, bottom - side); else bottom = Math.min(window.innerHeight, top + side);
    }
    setSelection({ left, top, right, bottom });
  };

  const stopDrag = () => { dragRef.current = null; };

  const chooseShape = (nextShape) => {
    setShape(nextShape);
    if (nextShape === 'square' && selection) {
      const side = Math.min(selection.right - selection.left, selection.bottom - selection.top);
      setSelection({ ...selection, right: selection.left + side, bottom: selection.top + side });
    }
  };

  const saveCrop = async () => {
    if (!capture || !selection) return;
    setBusy(true); setError('');
    try {
      const blob = await cropScreen(capture, selection, shape);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File([blob], `Screenshot_${stamp}.png`, { type: 'image/png', lastModified: Date.now() });
      onCaptured(file);
    } catch (failure) {
      setError(String(failure?.message || failure));
    } finally { setBusy(false); }
  };

  const validSelection = selection && selection.right - selection.left >= 8 && selection.bottom - selection.top >= 8;
  const handleStyle = (corner) => ({
    left: corner.includes('w') ? -6 : selection.right - selection.left - 6,
    top: corner.includes('n') ? -6 : selection.bottom - selection.top - 6,
  });

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] touch-none select-none bg-black" style={{ backgroundImage: background ? `url(${background})` : 'none', backgroundSize: '100% 100%', backgroundPosition: 'center' }} onPointerDown={(event) => { if (!event.target.closest('[data-capture-toolbar]') && !event.target.closest('[data-selection]')) beginDrag(event, 'draw'); }} onPointerMove={updateDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <div data-capture-toolbar className="fixed left-1/2 top-5 z-[102] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/15 bg-[#090909]/95 px-3 py-2 text-white shadow-2xl">
        <Camera className="h-4 w-4 text-white/75" />
        <span className="text-[11px] font-semibold">Screen capture</span>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <button type="button" onClick={() => chooseShape('rectangle')} className={`rounded-lg px-2 py-1 text-[10px] ${shape === 'rectangle' ? 'bg-white text-black' : 'text-white/65 hover:bg-white/10'}`}>Rectangle</button>
        <button type="button" onClick={() => chooseShape('square')} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] ${shape === 'square' ? 'bg-white text-black' : 'text-white/65 hover:bg-white/10'}`}><Square className="h-3 w-3" />Square</button>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <button type="button" disabled={!validSelection || busy} onClick={saveCrop} className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[10px] font-semibold text-black disabled:opacity-40">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Add to Shelf</button>
        <button type="button" onClick={onClose} aria-label="Cancel screenshot" className="rounded-lg p-1 text-white/55 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
      </div>

      {busy && !capture && <div className="fixed left-1/2 top-20 z-[102] -translate-x-1/2 rounded-xl border border-white/10 bg-black/90 px-4 py-3 text-[11px] text-white/75"><Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />Capturing screen…</div>}
      {!validSelection && !busy && !error && <div data-capture-toolbar className="fixed bottom-7 left-1/2 z-[102] -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-[10px] text-white/70">Click and drag across the screen to select a region. Choose Rectangle or Square above.</div>}
      {error && <div data-capture-toolbar className="fixed bottom-7 left-1/2 z-[102] -translate-x-1/2 rounded-xl border border-rose-300/20 bg-black/90 px-4 py-2 text-[10px] text-rose-100">{error}</div>}

      {validSelection && <div data-selection className="absolute z-[101] border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.12)]" style={{ left: selection.left, top: selection.top, width: selection.right - selection.left, height: selection.bottom - selection.top }} onPointerDown={(event) => beginDrag(event, 'move')}>
        {['nw', 'ne', 'sw', 'se'].map((corner) => <span key={corner} role="presentation" onPointerDown={(event) => beginDrag(event, 'resize', corner)} className="absolute h-3 w-3 rounded-full border-2 border-black bg-white shadow" style={handleStyle(corner)} />)}
      </div>}
    </div>
  );
}
