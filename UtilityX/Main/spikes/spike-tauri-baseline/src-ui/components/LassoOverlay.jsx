import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Bookmark, Copy, ExternalLink, Globe2, KeyRound, Loader2, Search, Sparkles, X } from 'lucide-react';
import { invokeTauriStrict } from '../utils/tauriBridge';

function cropCapture(capture, bounds) {
  const binary = atob(capture.bgraBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  const screen = document.createElement('canvas');
  screen.width = capture.width;
  screen.height = capture.height;
  const screenContext = screen.getContext('2d', { willReadFrequently: true });
  const frame = screenContext.createImageData(capture.width, capture.height);
  for (let index = 0; index < bytes.length; index += 4) {
    frame.data[index] = bytes[index + 2];
    frame.data[index + 1] = bytes[index + 1];
    frame.data[index + 2] = bytes[index];
    frame.data[index + 3] = 255;
  }
  screenContext.putImageData(frame, 0, 0);

  const scaleX = capture.width / window.innerWidth;
  const scaleY = capture.height / window.innerHeight;
  const left = Math.max(0, Math.floor(bounds.left * scaleX));
  const top = Math.max(0, Math.floor(bounds.top * scaleY));
  const right = Math.min(capture.width, Math.ceil(bounds.right * scaleX));
  const bottom = Math.min(capture.height, Math.ceil(bounds.bottom * scaleY));
  if (right - left < 4 || bottom - top < 4) throw new Error('That selection is too small to analyze. Draw a larger circle.');

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(right - left, bottom - top));
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round((right - left) * scale));
  crop.height = Math.max(1, Math.round((bottom - top) * scale));
  const context = crop.getContext('2d');
  context.drawImage(screen, left, top, right - left, bottom - top, 0, 0, crop.width, crop.height);
  return crop.toDataURL('image/jpeg', 0.88);
}

function dataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  return Array.from(binary, (character) => character.charCodeAt(0));
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export default function LassoOverlay({ isOpen, onClose, onOpenSettings }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [selection, setSelection] = useState(null);
  const [selectionImage, setSelectionImage] = useState('');
  const [phase, setPhase] = useState('draw');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [searchQueries, setSearchQueries] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPoints([]); setSelection(null); setSelectionImage(''); setPhase('draw');
      setAnswer(''); setSources([]); setSearchQueries([]); setQuestion(''); setMessage('');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (points.length > 1) {
      context.lineWidth = 3;
      context.strokeStyle = '#F5F7FF';
      context.shadowColor = '#F5F7FF';
      context.shadowBlur = 12;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
      context.stroke();
    }
  }, [isOpen, points]);

  const askGemini = useCallback(async (useWeb, submittedQuestion = '', imageOverride = '') => {
    const image = imageOverride || selectionImage;
    if (!image) return;
    const query = submittedQuestion.trim();
    const prompt = query
      ? (answer ? `The selected screen area was previously analyzed as follows:\n${answer}\n\nFollow-up question: ${query}` : query)
      : useWeb
        ? 'Identify the selected item and search the web for useful current information about it. Give a concise answer with sources.'
        : 'Identify the main content in the selected screen area and explain what it is. Be concise and mention uncertainty.';
    setBusy(true); setMessage('');
    try {
      const result = await invokeTauriStrict('ai_circle_search', {
        imageBase64: image.split(',')[1],
        prompt,
        searchWeb: useWeb,
      });
      setAnswer(result.answer || 'Gemini returned an empty answer.');
      setSources(Array.isArray(result.sources) ? result.sources : []);
      setSearchQueries(Array.isArray(result.searchQueries) ? result.searchQueries : []);
      setPhase('result');
      setQuestion('');
    } catch (error) {
      setMessage(String(error?.message || error));
      setPhase('error');
    } finally { setBusy(false); }
  }, [selectionImage, answer]);

  const finishSelection = async (lastPoint) => {
    setIsDrawing(false);
    const trace = lastPoint ? [...points, lastPoint] : points;
    if (trace.length < 9) { setPoints([]); return; }
    const bounds = {
      left: Math.min(...trace.map((point) => point.x)),
      right: Math.max(...trace.map((point) => point.x)),
      top: Math.min(...trace.map((point) => point.y)),
      bottom: Math.max(...trace.map((point) => point.y)),
    };
    if (bounds.right - bounds.left < 12 || bounds.bottom - bounds.top < 12) { setPoints([]); return; }
    setSelection({ ...bounds, x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 });
    setPhase('checking'); setAnswer(''); setSources([]); setSearchQueries([]); setMessage('');
    try {
      const hasKey = await invokeTauriStrict('ai_key_status');
      if (!hasKey) { setPhase('no-key'); return; }
      setPhase('capturing');
      const captured = await invokeTauriStrict('capture_screen');
      const image = cropCapture(captured, bounds);
      setSelectionImage(image);
      setPhase('result');
      await askGemini(false, '', image);
    } catch (error) {
      setMessage(String(error?.message || error));
      setPhase('error');
    }
  };

  const handleMouseDown = (event) => {
    if (phase !== 'draw' || busy) return;
    setIsDrawing(true);
    setPoints([{ x: event.clientX, y: event.clientY }]);
  };
  const handleMouseMove = (event) => {
    if (!isDrawing) return;
    setPoints((previous) => [...previous, { x: event.clientX, y: event.clientY }]);
  };
  const handleMouseUp = (event) => {
    if (!isDrawing) return;
    finishSelection({ x: event.clientX, y: event.clientY });
  };

  const openUrl = (url) => invokeTauriStrict('open_external_url', { url }).catch((error) => setMessage(String(error?.message || error)));
  const openBrowserSearch = () => {
    const query = question.trim() || searchQueries[0] || answer.split(/[.!?\n]/)[0]?.trim();
    if (!query) {
      setMessage('Enter a search phrase above first. Google text search does not receive the circled image.');
      return;
    }
    setMessage('Opening a Google text search. The circled image is not attached.');
    openUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  };
  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setMessage('Answer copied.');
    } catch { setMessage('Could not write the answer to the clipboard.'); }
  };
  const saveSelection = async () => {
    if (!selectionImage) return;
    setBusy(true); setMessage('');
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await invokeTauriStrict('shelf_store_file', {
        id: `circle-search-${Date.now()}`,
        name: `Circle-Search-${stamp}.jpg`,
        bytes: dataUrlBytes(selectionImage),
      });
      setMessage('Selected image saved to Shelf.');
    } catch (error) { setMessage(String(error?.message || error)); }
    finally { setBusy(false); }
  };

  if (!isOpen) return null;
  const cardWidth = Math.min(430, window.innerWidth - 32);
  const cardLeft = selection ? clamp(selection.x, cardWidth / 2 + 12, window.innerWidth - cardWidth / 2 - 12) : window.innerWidth / 2;
  const cardTop = selection ? clamp(selection.y + 30, 100, window.innerHeight - 240) : 150;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none bg-black/45 backdrop-blur-[1px]" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {phase === 'draw' && <div className="absolute top-7 left-1/2 z-10 -translate-x-1/2 pointer-events-auto" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 rounded-full border border-white/15 bg-[#090909]/95 px-4 py-2 text-xs font-semibold text-white shadow-2xl">
          <Sparkles className="h-3.5 w-3.5 text-white/75" />
          <span>Circle anything on screen to ask Gemini</span>
          <button type="button" onClick={onClose} aria-label="Cancel Circle Search" className="ml-1 rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>}

      <AnimatePresence>
        {phase !== 'draw' && selection && <motion.section
          initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
          className="absolute z-20 max-h-[min(560px,calc(100vh-32px))] -translate-x-1/2 overflow-hidden rounded-[20px] border border-white/15 bg-[#080808]/95 text-white shadow-[0_20px_70px_rgba(0,0,0,.55)] backdrop-blur-xl pointer-events-auto"
          style={{ left: cardLeft, top: cardTop, width: cardWidth }}
          onMouseDown={(event) => event.stopPropagation()} onMouseUp={(event) => event.stopPropagation()}
        >
          <header className="flex items-center gap-2.5 border-b border-white/[0.08] px-3.5 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"><Sparkles className="h-4 w-4 text-white/80" /></span>
            <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold">Circle Search</p><p className="text-[9px] text-white/45">Gemini vision{sources.length ? ' · Web sources included' : ''}</p></div>
            <button type="button" onClick={onClose} aria-label="Close Circle Search" className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </header>

          <div className="max-h-[470px] overflow-y-auto p-3.5">
            {phase === 'no-key' ? <div className="flex flex-col items-center gap-3 py-5 text-center">
              <KeyRound className="h-6 w-6 text-white/55" />
              <div><p className="text-[12px] font-semibold">No AI key detected</p><p className="mt-1 max-w-[300px] text-[10px] leading-4 text-white/45">Add your Gemini API key in Settings to analyze this selection. The screenshot has not been captured or sent.</p></div>
              <button type="button" onClick={onOpenSettings} className="rounded-full bg-white px-4 py-2 text-[10px] font-semibold text-black transition hover:bg-white/85">Open AI settings</button>
            </div> : <>
              {selectionImage && <div className="mb-3 flex max-h-28 items-center gap-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] p-2">
                <img src={selectionImage} alt="The screen area you circled" className="max-h-24 max-w-[150px] rounded-lg object-contain" />
                <span className="text-[9px] leading-4 text-white/45">Gemini receives this crop. Google text search uses your words only; it cannot receive the image.</span>
              </div>}
              {(phase === 'checking' || phase === 'capturing' || busy) && <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-[10px] text-white/65"><Loader2 className="h-3.5 w-3.5 animate-spin" />{phase === 'checking' ? 'Checking for a saved Gemini key…' : phase === 'capturing' ? 'Capturing your selection…' : 'Gemini is analyzing your selection…'}</div>}
              {phase === 'error' && message && <div role="alert" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[10px] leading-4 text-white/70">{message}</div>}
              {answer && <div className="whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-[11px] leading-[1.65] text-white/85">{answer}</div>}
              {sources.length > 0 && <div className="mt-3"><p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">Sources</p><div className="space-y-1">{sources.slice(0, 5).map((source) => <button type="button" key={source.url} onClick={() => openUrl(source.url)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[9px] text-white/65 transition hover:bg-white/[0.06] hover:text-white"><ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{source.title}</span><ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-white/35" /></button>)}</div></div>}

              {phase !== 'checking' && phase !== 'capturing' && <>
                <form onSubmit={(event) => { event.preventDefault(); askGemini(false, question); }} className="mt-3 flex gap-2">
                  <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="Ask a follow-up about this selection…" className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-black/50 px-3 py-2 text-[10px] text-white outline-none placeholder:text-white/30 focus:border-white/25" />
                  <button type="submit" disabled={busy || !selectionImage || !question.trim()} className="rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-black disabled:opacity-35">Ask</button>
                </form>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" disabled={busy || !selectionImage} onClick={() => askGemini(true, question)} className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[9px] font-medium text-white/80 transition hover:bg-white/[0.12] disabled:opacity-40"><Globe2 className="h-3 w-3" />Search web with Gemini</button>
                  <button type="button" onClick={openBrowserSearch} className="flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5 text-[9px] text-white/55 transition hover:bg-white/[0.06] hover:text-white"><Search className="h-3 w-3" />Google text search</button>
                  {answer && <button type="button" onClick={copyAnswer} className="flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5 text-[9px] text-white/55 transition hover:bg-white/[0.06] hover:text-white"><Copy className="h-3 w-3" />Copy answer</button>}
                  {selectionImage && <button type="button" disabled={busy} onClick={saveSelection} className="flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5 text-[9px] text-white/55 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"><Bookmark className="h-3 w-3" />Save crop to Shelf</button>}
                </div>
              </>}
              {message && phase !== 'error' && <p role="status" className="mt-2 text-[9px] text-white/50">{message}</p>}
            </>}
          </div>
        </motion.section>}
      </AnimatePresence>
    </div>
  );
}
