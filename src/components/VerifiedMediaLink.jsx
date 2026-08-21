import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Maximize2, Minimize2, Play, X } from 'lucide-react';
import { parseYouTubeVideoId, validateYouTubeVideo } from '../lib/youtube-media.js';

export default function VerifiedMediaLink({ href, children, style, ...props }) {
  const baseHref = typeof window !== 'undefined' ? window.location.href : 'https://quantoraai.app/';
  const videoId = useMemo(() => parseYouTubeVideoId(href, baseHref), [href, baseHref]);
  const [validation, setValidation] = useState(videoId ? { status: 'checking' } : { status: 'not-media' });
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!videoId) return undefined;
    let cancelled = false;
    setValidation({ status: 'checking' });
    validateYouTubeVideo(videoId).then((result) => {
      if (cancelled) return;
      setValidation(result?.valid ? { status: 'valid', result } : { status: 'invalid', result });
    });
    return () => { cancelled = true; };
  }, [videoId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setFullscreen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!videoId) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={style} {...props}>{children}</a>;
  }

  // Media recommendations are fail-closed: never flash a dead/private/deleted
  // source or an infrastructure loading artifact into the conversation.
  if (validation.status === 'checking' || validation.status === 'invalid') return null;

  const title = String(children || validation.result?.title || 'YouTube video');
  const openInside = (event) => {
    event?.preventDefault?.();
    setOpen(true);
  };

  return (
    <>
      <span data-quantora-verified-media="youtube" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
        <a href={href} onClick={openInside} title="Play in Quantora" style={style} {...props}>{children}</a>
        <button
          type="button"
          data-quantora-youtube-play="true"
          onClick={openInside}
          title="Play in Quantora"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '999px',
            border: '1px solid rgba(239,68,68,0.30)', background: 'rgba(239,68,68,0.10)', color: '#ef4444',
            cursor: 'pointer', fontSize: '0.72rem', fontWeight: 750,
          }}
        ><Play size={11} fill="currentColor" /> Play</button>
      </span>

      {open && typeof document !== 'undefined' && createPortal(
        <section
          data-quantora-media-canvas="youtube"
          data-quantora-media-fullscreen={fullscreen ? 'true' : 'false'}
          style={{
            position: 'fixed', top: fullscreen ? 0 : '16px', right: fullscreen ? 0 : '16px', bottom: fullscreen ? 0 : '16px',
            left: fullscreen ? 0 : 'auto', width: fullscreen ? '100vw' : (window.innerWidth < 900 ? 'calc(100vw - 32px)' : 'min(56vw, 960px)'),
            display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: fullscreen ? 0 : '16px',
            background: '#0f172a', border: fullscreen ? 'none' : '1px solid rgba(148,163,184,0.28)',
            boxShadow: '0 28px 70px rgba(0,0,0,0.46)', zIndex: 10060,
          }}
        >
          <div style={{ height: '48px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 10px 0 16px', background: '#111827', borderBottom: '1px solid rgba(148,163,184,0.20)' }}>
            <div style={{ flex: 1, minWidth: 0, color: '#e2e8f0', fontSize: '0.84rem', fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            <a href={href} target="_blank" rel="noopener noreferrer" title="Open on YouTube" style={{ color: '#93c5fd', fontSize: '0.74rem', fontWeight: 650, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>YouTube <ExternalLink size={12} /></a>
            <button type="button" onClick={() => setFullscreen((value) => !value)} title={fullscreen ? 'Exit full screen' : 'Expand video'} style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex' }}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            <button type="button" onClick={() => { setOpen(false); setFullscreen(false); }} title="Close video" style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex' }}><X size={18} /></button>
          </div>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&autoplay=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            credentialless="true"
            style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', background: '#000' }}
          />
        </section>,
        document.body,
      )}
    </>
  );
}
