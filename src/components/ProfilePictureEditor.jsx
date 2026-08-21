import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RotateCcw, X } from 'lucide-react';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PRESETS = [
  { label: 'Explorer', emoji: '🚀', from: '#2563eb', to: '#7c3aed' },
  { label: 'Thinker', emoji: '🧠', from: '#f97316', to: '#ec4899' },
  { label: 'Navigator', emoji: '🧭', from: '#0891b2', to: '#2563eb' },
  { label: 'Scientist', emoji: '⚛️', from: '#7c3aed', to: '#db2777' },
  { label: 'Creator', emoji: '✨', from: '#ea580c', to: '#7c3aed' },
  { label: 'Cosmos', emoji: '🌌', from: '#0f172a', to: '#4338ca' },
];

function presetDataUrl(preset) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${preset.from}"/><stop offset="1" stop-color="${preset.to}"/></linearGradient></defs><rect width="256" height="256" rx="128" fill="url(#g)"/><text x="128" y="146" text-anchor="middle" font-size="108" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${preset.emoji}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resizeUploadedImage(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    if (file.size > MAX_UPLOAD_BYTES) return reject(new Error('Please choose an image smaller than 5 MB.'));

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not prepare this image.');
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sx = Math.max(0, (image.naturalWidth - side) / 2);
        const sy = Math.max(0, (image.naturalHeight - side) / 2);
        context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That image could not be read.'));
    };
    image.src = objectUrl;
  });
}

export default function ProfilePictureEditor({ open, onClose, user, avatarSrc, onSelectAvatar, onResetAvatar, isLight }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const initial = useMemo(() => (user?.name || 'U').charAt(0).toUpperCase(), [user?.name]);

  useEffect(() => setPreviewFailed(false), [avatarSrc]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const panel = (
    <div
      data-quantora-profile-personalizer="true"
      role="dialog"
      aria-modal="true"
      aria-label="Choose profile picture"
      style={{ position: 'fixed', inset: 0, zIndex: 12000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(2,6,23,.66)', backdropFilter: 'blur(10px)' }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <section style={{ width: 'min(420px, 100%)', maxHeight: 'min(680px, calc(100vh - 40px))', overflowY: 'auto', borderRadius: 20, padding: 20, background: isLight ? '#ffffff' : '#111827', color: isLight ? '#0f172a' : '#f8fafc', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,.28)', boxShadow: '0 28px 80px rgba(0,0,0,.38)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'linear-gradient(135deg,#f97316,#8b5cf6)', color: '#fff', fontWeight: 800, fontSize: '1.25rem' }}>
            {avatarSrc && !previewFailed ? <img src={avatarSrc} alt="" onError={() => setPreviewFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1rem', fontWeight: 800 }}>Profile picture</div>
            <div style={{ fontSize: '.76rem', marginTop: 3, color: isLight ? '#64748b' : '#94a3b8' }}>Upload a photo or choose a Quantora avatar.</div>
          </div>
          <button type="button" aria-label="Close profile picture chooser" onClick={onClose} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: isLight ? '#475569' : '#cbd5e1', padding: 6 }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 18 }}>
          <label data-quantora-profile-upload="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(249,115,22,.45)', background: 'rgba(249,115,22,.12)', color: '#f97316', fontSize: '.8rem', fontWeight: 750, cursor: busy ? 'wait' : 'pointer' }}>
            <Camera size={15} /> {busy ? 'Preparing…' : 'Upload photo'}
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              style={{ display: 'none' }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setBusy(true);
                setError('');
                try {
                  const src = await resizeUploadedImage(file);
                  onSelectAvatar?.(src);
                } catch (uploadError) {
                  setError(uploadError?.message || 'Could not use this photo.');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <button type="button" onClick={() => { setError(''); onResetAvatar?.(); }} title="Use Google profile picture" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '10px 12px', border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(148,163,184,.28)', background: 'transparent', color: isLight ? '#475569' : '#cbd5e1', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700 }}><RotateCcw size={14} /> Reset</button>
        </div>

        {error && <div role="alert" style={{ marginBottom: 14, padding: '9px 10px', borderRadius: 9, background: 'rgba(239,68,68,.10)', color: '#dc2626', fontSize: '.76rem', fontWeight: 650 }}>{error}</div>}

        <div style={{ fontSize: '.68rem', fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: isLight ? '#64748b' : '#94a3b8', marginBottom: 9 }}>Quantora avatars</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {PRESETS.map((preset) => {
            const src = presetDataUrl(preset);
            return (
              <button key={preset.label} type="button" data-quantora-profile-avatar-choice={preset.label.toLowerCase()} aria-label={`Choose ${preset.label} avatar`} title={preset.label} onClick={() => onSelectAvatar?.(src)} style={{ border: '2px solid transparent', background: 'transparent', padding: 2, borderRadius: '50%', cursor: 'pointer' }}>
                <img src={src} alt="" style={{ width: 44, height: 44, borderRadius: '50%', display: 'block' }} />
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14, color: isLight ? '#94a3b8' : '#64748b', fontSize: '.69rem', lineHeight: 1.45 }}>Custom profile pictures are stored on this device. Your Google profile picture remains the fallback.</div>
      </section>
    </div>
  );

  return createPortal(panel, document.body);
}
