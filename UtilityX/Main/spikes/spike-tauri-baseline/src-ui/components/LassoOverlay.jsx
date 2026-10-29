import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Bookmark, Copy, ExternalLink, KeyRound, Loader2, Search, Sparkles, X } from 'lucide-react';
import { invokeTauriStrict } from '../utils/tauriBridge';

async function cropCapture(capture, bounds) {
  if (!capture?.bitmapDataUrl || !capture.width || !capture.height) {
    throw new Error('Windows did not return a usable screen capture.');
  }
  const screenImage = new Image();
  screenImage.src = capture.bitmapDataUrl;
  await screenImage.decode();
  const screen = document.createElement('canvas');
  screen.width = capture.width;
  screen.height = capture.height;
  const screenContext = screen.getContext('2d', { willReadFrequently: true });
  if (!screenContext) throw new Error('Could not prepare the selected image.');
  screenContext.drawImage(screenImage, 0, 0, capture.width, capture.height);

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

function renderInlineMarkdown(text, keyPrefix) {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  return text.split(tokenPattern).filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={key} className="font-semibold text-white">{token.slice(2, -2)}</strong>;
    if (token.startsWith('`') && token.endsWith('`')) return <code key={key} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.92em]">{token.slice(1, -1)}</code>;
    if (token.startsWith('*') && token.endsWith('*')) return <em key={key}>{token.slice(1, -1)}</em>;
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="text-white underline decoration-white/40 underline-offset-2">{link[1]}</a>;
    return <React.Fragment key={key}>{token}</React.Fragment>;
  });
}

function MarkdownText({ text }) {
  const blocks = [];
  let paragraph = [];
  let list = [];
  let listType = '';
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', lines: paragraph });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: listType, items: list });
      list = [];
      listType = '';
    }
  };

  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const item = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ type: `h${heading[1].length}`, lines: [heading[2]] });
      continue;
    }
    if (item) {
      flushParagraph();
      const type = /^\d/.test(item[1]) ? 'ol' : 'ul';
      if (listType && listType !== type) flushList();
      listType = type;
      list.push(item[2]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();

  return <div className="space-y-2.5">
    {blocks.map((block, index) => {
      if (block.type === 'ul' || block.type === 'ol') {
        const Tag = block.type;
        return <Tag key={index} className={`${block.type === 'ul' ? 'list-disc' : 'list-decimal'} space-y-1 pl-5`}>
          {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `list-${index}-${itemIndex}`)}</li>)}
        </Tag>;
      }
      if (block.type.startsWith('h')) {
        const Tag = block.type;
        return <Tag key={index} className="font-semibold text-white">{renderInlineMarkdown(block.lines[0], `heading-${index}`)}</Tag>;
      }
      return <p key={index}>{block.lines.map((line, lineIndex) => <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}{renderInlineMarkdown(line, `paragraph-${index}-${lineIndex}`)}</React.Fragment>)}</p>;
    })}
  </div>;
}

export default function LassoOverlay({ isOpen, onClose, onOpenSettings }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
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
  const [cardPosition, setCardPosition] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setPoints([]); setSelection(null); setSelectionImage(''); setPhase('draw');
      setAnswer(''); setSources([]); setSearchQueries([]); setQuestion(''); setMessage('');
      setCardPosition(null);
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

  useEffect(() => {
    const moveCard = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      setCardPosition({
        left: clamp(drag.left + event.clientX - drag.x, 8, window.innerWidth - drag.width - 8),
        top: clamp(drag.top + event.clientY - drag.y, 8, window.innerHeight - drag.height - 8),
      });
    };
    const stopDragging = () => {
      dragRef.current = null;
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', moveCard);
    window.addEventListener('pointerup', stopDragging);
    return () => {
      window.removeEventListener('pointermove', moveCard);
      window.removeEventListener('pointerup', stopDragging);
      document.body.style.userSelect = '';
    };
  }, []);

  const askGroq = useCallback(async (submittedQuestion = '', imageOverride = '') => {
    const image = imageOverride || selectionImage;
    if (!image) return;
    const query = submittedQuestion.trim();
    const prompt = query
      ? (answer ? `The selected screen area was previously analyzed as follows:\n${answer}\n\nFollow-up question: ${query}` : query)
      : 'Identify the main content in the selected screen area and explain what it is. Be concise and mention uncertainty.';
    setBusy(true); setMessage('');
    try {
      const result = await invokeTauriStrict('ai_circle_search', {
        imageBase64: image.split(',')[1],
        prompt,
      });
      setAnswer(result.answer || 'Groq returned an empty answer.');
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
    setCardPosition(null);
    setPhase('checking'); setAnswer(''); setSources([]); setSearchQueries([]); setMessage('');
    try {
      const hasKey = await invokeTauriStrict('ai_key_status');
      if (!hasKey) { setPhase('no-key'); return; }
      setPhase('capturing');
      const captured = await invokeTauriStrict('capture_screen');
      const image = await cropCapture(captured, bounds);
      setSelectionImage(image);
      setPhase('result');
      await askGroq('', image);
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

  const startDraggingCard = (event) => {
    if (event.target.closest('button')) return;
    const left = cardPosition?.left ?? cardLeft - cardWidth / 2;
    const top = cardPosition?.top ?? cardTop;
    const height = event.currentTarget.closest('section')?.getBoundingClientRect().height ?? 400;
    dragRef.current = { x: event.clientX, y: event.clientY, left, top, width: cardWidth, height };
    document.body.style.userSelect = 'none';
    event.preventDefault();
  };

  if (!isOpen) return null;
  const cardWidth = Math.min(430, window.innerWidth - 32);
  const cardLeft = selection ? clamp(selection.x, cardWidth / 2 + 12, window.innerWidth - cardWidth / 2 - 12) : window.innerWidth / 2;
  const cardTop = selection ? clamp(selection.y + 30, 8, window.innerHeight - Math.min(560, window.innerHeight - 32)) : 150;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none bg-black/45 backdrop-blur-[1px]" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {phase === 'draw' && <div className="absolute top-7 left-1/2 z-10 -translate-x-1/2 pointer-events-auto" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 rounded-full border border-white/15 bg-[#090909]/95 px-4 py-2 text-xs font-semibold text-white shadow-2xl">
          <Sparkles className="h-3.5 w-3.5 text-white/75" />
          <span>Circle anything on screen to ask Groq</span>
          <button type="button" onClick={onClose} aria-label="Cancel Circle Search" className="ml-1 rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>}

      <AnimatePresence>
        {phase !== 'draw' && selection && <motion.section
          initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
          className="absolute z-20 max-h-[min(560px,calc(100vh-32px))] overflow-hidden rounded-[20px] border border-white/15 bg-[#080808]/95 text-white shadow-[0_20px_70px_rgba(0,0,0,.55)] backdrop-blur-xl pointer-events-auto"
          style={{ left: cardPosition?.left ?? cardLeft, top: cardPosition?.top ?? cardTop, width: cardWidth, transform: cardPosition ? 'none' : 'translateX(-50%)' }}
          onMouseDown={(event) => event.stopPropagation()} onMouseUp={(event) => event.stopPropagation()}
        >
          <header onPointerDown={startDraggingCard} className="flex cursor-grab items-center gap-2.5 border-b border-white/[0.08] px-3.5 py-3 active:cursor-grabbing">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"><Sparkles className="h-4 w-4 text-white/80" /></span>
            <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold">Circle Search</p><p className="text-[9px] text-white/45">Groq vision</p></div>
            <button type="button" onClick={onClose} aria-label="Close Circle Search" className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </header>

          <div className="max-h-[470px] overflow-y-auto p-3.5">
            {phase === 'no-key' ? <div className="flex flex-col items-center gap-3 py-5 text-center">
              <KeyRound className="h-6 w-6 text-white/55" />
              <div><p className="text-[12px] font-semibold">No AI key detected</p><p className="mt-1 max-w-[300px] text-[10px] leading-4 text-white/45">Add your Groq API key in Settings to analyze this selection. The screenshot has not been captured or sent.</p></div>
              <button type="button" onClick={onOpenSettings} className="rounded-full bg-white px-4 py-2 text-[10px] font-semibold text-black transition hover:bg-white/85">Open AI settings</button>
            </div> : <>
              {selectionImage && <div className="mb-3 flex max-h-28 items-center gap-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] p-2">
                <img src={selectionImage} alt="The screen area you circled" className="max-h-24 max-w-[150px] rounded-lg object-contain" />
                <span className="text-[9px] leading-4 text-white/45">Groq receives this crop. Google text search uses your words only; it cannot receive the image.</span>
              </div>}
              {(phase === 'checking' || phase === 'capturing' || busy) && <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-[10px] text-white/65"><Loader2 className="h-3.5 w-3.5 animate-spin" />{phase === 'checking' ? 'Checking for a saved Groq key…' : phase === 'capturing' ? 'Capturing your selection…' : 'Groq is analyzing your selection…'}</div>}
              {phase === 'error' && message && <div role="alert" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[10px] leading-4 text-white/70">{message}</div>}
              {answer && <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-[11px] leading-[1.65] text-white/85"><MarkdownText text={answer} /></div>}
              {sources.length > 0 && <div className="mt-3"><p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">Sources</p><div className="space-y-1">{sources.slice(0, 5).map((source) => <button type="button" key={source.url} onClick={() => openUrl(source.url)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[9px] text-white/65 transition hover:bg-white/[0.06] hover:text-white"><ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{source.title}</span><ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-white/35" /></button>)}</div></div>}

              {phase !== 'checking' && phase !== 'capturing' && <>
                <form onSubmit={(event) => { event.preventDefault(); askGroq(question); }} className="mt-3 flex gap-2">
                  <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="Ask a follow-up about this selection…" className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-black/50 px-3 py-2 text-[10px] text-white outline-none placeholder:text-white/30 focus:border-white/25" />
                  <button type="submit" disabled={busy || !selectionImage || !question.trim()} className="rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-black disabled:opacity-35">Ask</button>
                </form>
                <div className="mt-2 flex flex-wrap gap-1.5">
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
