import React, { useEffect, useState } from 'react';
import { BookmarkPlus, Check, Copy, ExternalLink, Globe2, Loader2 } from 'lucide-react';
import { invokeTauriStrict } from '../utils/tauriBridge';

export function cleanLinkUrl(value) {
  try {
    const url = new URL(value);
    [...url.searchParams.keys()].forEach((key) => {
      if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'dclid', 'mc_cid', 'mc_eid', 'igshid', 'msclkid'].includes(key.toLowerCase())) url.searchParams.delete(key);
    });
    return url.toString();
  } catch { return value; }
}

export default function LinkPreviewCard({ url, showArchive = false, compact = false }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setMessage(''); setPreview(null); setFaviconFailed(false); setImageFailed(false);
    invokeTauriStrict('get_link_preview', { url })
      .then((value) => { if (!cancelled) setPreview(value); })
      .catch((failure) => { if (!cancelled) setError(String(failure?.message || failure)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  const openLink = () => invokeTauriStrict('open_external_url', { url }).catch((failure) => setMessage(String(failure?.message || failure)));
  const copyCleanUrl = async () => {
    try { await navigator.clipboard.writeText(cleanLinkUrl(url)); setMessage('Clean URL copied.'); }
    catch { setMessage('Could not copy the URL.'); }
  };
  const archiveLink = async () => {
    try {
      const clean = cleanLinkUrl(url);
      const parsed = new URL(clean);
      const shortcut = `[InternetShortcut]\r\nURL=${clean}\r\n`;
      const bytes = Array.from(new TextEncoder().encode(shortcut));
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await invokeTauriStrict('shelf_store_file', { id, name: `${parsed.hostname || 'Web_Link'}.url`, bytes });
      setMessage('Archived to Shelf.');
    } catch (failure) { setMessage(String(failure?.message || failure)); }
  };

  const title = preview?.title || (() => { try { return new URL(url).hostname; } catch { return url; } })();
  return (
    <div className={`rounded-xl border border-white/[0.08] bg-black/25 ${compact ? 'p-2' : 'p-2.5'}`}>
      <div className="flex min-w-0 gap-2.5">
        {preview?.imageUrl && !imageFailed && <img src={preview.imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className={`${compact ? 'h-14 w-20' : 'h-16 w-24'} shrink-0 rounded-lg bg-white/5 object-cover`} />}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {preview?.faviconUrl && !faviconFailed
              ? <img src={preview.faviconUrl} alt="" referrerPolicy="no-referrer" onError={() => setFaviconFailed(true)} className="h-3.5 w-3.5 shrink-0 rounded-sm" />
              : <Globe2 className="h-3.5 w-3.5 shrink-0 text-sky-300" />}
            <span className="truncate text-[9px] font-medium text-sky-200">{preview?.domain || (() => { try { return new URL(url).hostname; } catch { return 'Web link'; } })()}</span>
            {loading && <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin text-white/45" />}
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-white">{title}</div>
          {preview?.description && <p className="mt-1 line-clamp-2 text-[9px] leading-3.5 text-white/55">{preview.description}</p>}
          {error && <p className="mt-1 line-clamp-2 text-[9px] text-white/40">Preview unavailable: {error}</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" onClick={openLink} className="flex items-center gap-1 rounded-md bg-white/[0.07] px-2 py-1 text-[9px] text-white/75 hover:bg-white/[0.12]"><ExternalLink className="h-3 w-3" />Open</button>
        <button type="button" onClick={copyCleanUrl} className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-[9px] text-white/65 hover:bg-white/[0.1]"><Copy className="h-3 w-3" />Copy clean URL</button>
        {showArchive && <button type="button" onClick={archiveLink} className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-[9px] text-white/65 hover:bg-white/[0.1]"><BookmarkPlus className="h-3 w-3" />Archive to Shelf</button>}
      </div>
      {message && <div role="status" className="mt-1 flex items-center gap-1 text-[9px] text-emerald-200/75"><Check className="h-3 w-3" />{message}</div>}
    </div>
  );
}
