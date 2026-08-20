const PROFILE_AVATAR_KEY = 'quantora_profile_avatar_v1';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const PRESET_AVATARS = [
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

function readStoredAvatar() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_AVATAR_KEY) || 'null');
    return typeof parsed?.src === 'string' && parsed.src.startsWith('data:image/') ? parsed.src : '';
  } catch {
    return '';
  }
}

function saveAvatar(src) {
  try {
    localStorage.setItem(PROFILE_AVATAR_KEY, JSON.stringify({ src, updatedAt: Date.now() }));
  } catch {
    throw new Error('This browser could not save the profile picture.');
  }
}

function clearSavedAvatar() {
  try {
    localStorage.removeItem(PROFILE_AVATAR_KEY);
  } catch {}
}

function setFallbackVisibility(img, visible) {
  const fallback = img?.nextElementSibling;
  if (fallback instanceof HTMLElement) fallback.style.display = visible ? 'flex' : 'none';
}

function applyCustomAvatarToContainer(container, src) {
  if (!container) return;
  let img = container.querySelector(':scope > img[data-quantora-custom-avatar], :scope > img');
  const first = container.firstElementChild;

  if (!src) {
    if (img?.dataset.quantoraCreatedAvatar === 'true') {
      setFallbackVisibility(img, true);
      img.remove();
      return;
    }
    if (img?.dataset.quantoraOriginalAvatarSrc !== undefined) {
      img.src = img.dataset.quantoraOriginalAvatarSrc;
      img.style.display = img.dataset.quantoraOriginalAvatarDisplay || '';
      delete img.dataset.quantoraOriginalAvatarSrc;
      delete img.dataset.quantoraOriginalAvatarDisplay;
      delete img.dataset.quantoraCustomAvatar;
      setFallbackVisibility(img, !img.src);
    }
    return;
  }

  if (!img) {
    img = document.createElement('img');
    img.dataset.quantoraCreatedAvatar = 'true';
    img.alt = '';
    Object.assign(img.style, {
      width: first?.style?.width || '28px',
      height: first?.style?.height || '28px',
      borderRadius: '50%',
      objectFit: 'cover',
      flexShrink: '0',
    });
    container.insertBefore(img, first || null);
    if (first instanceof HTMLElement) first.style.display = 'none';
  } else if (img.dataset.quantoraOriginalAvatarSrc === undefined) {
    img.dataset.quantoraOriginalAvatarSrc = img.getAttribute('src') || '';
    img.dataset.quantoraOriginalAvatarDisplay = img.style.display || '';
  }

  img.dataset.quantoraCustomAvatar = 'true';
  img.src = src;
  img.style.display = 'block';
  setFallbackVisibility(img, false);
}

function applyAvatarToDom() {
  const src = readStoredAvatar();

  const sidebar = document.querySelector('[data-quantora-sidebar-profile]');
  if (sidebar) applyCustomAvatarToContainer(sidebar, src);

  for (const button of document.querySelectorAll('button[aria-controls="quantora-profile-menu"]')) {
    applyCustomAvatarToContainer(button, src);
  }

  const menu = document.getElementById('quantora-profile-menu');
  if (menu?.firstElementChild) applyCustomAvatarToContainer(menu.firstElementChild, src);

  const panelPreview = document.querySelector('[data-quantora-profile-preview]');
  if (panelPreview instanceof HTMLImageElement) {
    if (src) {
      panelPreview.src = src;
      panelPreview.style.display = 'block';
      panelPreview.nextElementSibling?.style && (panelPreview.nextElementSibling.style.display = 'none');
    } else {
      panelPreview.style.display = 'none';
      panelPreview.nextElementSibling?.style && (panelPreview.nextElementSibling.style.display = 'flex');
    }
  }
}

function profileName() {
  return document.querySelector('[data-quantora-profile-name]')?.textContent?.trim()
    || document.querySelector('button[aria-controls="quantora-profile-menu"] img[alt]')?.getAttribute('alt')?.trim()
    || 'Profile';
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

function closePersonalizer() {
  document.querySelector('[data-quantora-profile-personalizer]')?.remove();
}

function buttonStyle(button, primary = false) {
  Object.assign(button.style, {
    border: primary ? '1px solid rgba(249,115,22,0.45)' : '1px solid rgba(148,163,184,0.26)',
    background: primary ? 'rgba(249,115,22,0.14)' : 'rgba(148,163,184,0.08)',
    color: primary ? '#fb923c' : '#cbd5e1',
    borderRadius: '9px',
    padding: '8px 10px',
    fontSize: '0.78rem',
    fontWeight: '700',
    cursor: 'pointer',
  });
}

function openPersonalizer(anchor) {
  closePersonalizer();

  const panel = document.createElement('section');
  panel.dataset.quantoraProfilePersonalizer = 'true';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Choose profile picture');

  const rect = anchor?.getBoundingClientRect?.();
  const width = Math.min(360, window.innerWidth - 24);
  const left = rect
    ? Math.min(window.innerWidth - width - 12, Math.max(12, rect.right + 10))
    : Math.max(12, window.innerWidth - width - 20);
  const bottom = rect ? Math.max(12, window.innerHeight - rect.bottom) : 20;

  Object.assign(panel.style, {
    position: 'fixed',
    left: `${left}px`,
    bottom: `${bottom}px`,
    width: `${width}px`,
    maxHeight: 'min(620px, calc(100vh - 24px))',
    overflowY: 'auto',
    padding: '16px',
    borderRadius: '16px',
    background: '#111827',
    color: '#f8fafc',
    border: '1px solid rgba(148,163,184,0.28)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.48)',
    zIndex: '10080',
  });

  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' });

  const previewWrap = document.createElement('div');
  Object.assign(previewWrap.style, { width: '52px', height: '52px', position: 'relative', flexShrink: '0' });
  const preview = document.createElement('img');
  preview.dataset.quantoraProfilePreview = 'true';
  preview.alt = '';
  Object.assign(preview.style, { width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', display: readStoredAvatar() ? 'block' : 'none' });
  if (readStoredAvatar()) preview.src = readStoredAvatar();
  const fallback = document.createElement('div');
  fallback.textContent = profileName().charAt(0).toUpperCase();
  Object.assign(fallback.style, {
    width: '52px', height: '52px', borderRadius: '50%', display: readStoredAvatar() ? 'none' : 'flex',
    alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#f97316,#8b5cf6)',
    color: '#fff', fontSize: '1.2rem', fontWeight: '800',
  });
  previewWrap.append(preview, fallback);

  const heading = document.createElement('div');
  heading.style.flex = '1';
  heading.innerHTML = '<div style="font-size:0.96rem;font-weight:800">Profile picture</div><div style="font-size:0.72rem;color:#94a3b8;margin-top:2px">Upload a photo or choose a Quantora avatar</div>';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close profile picture chooser');
  Object.assign(close.style, { border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: '22px', cursor: 'pointer' });
  close.addEventListener('click', closePersonalizer);
  header.append(previewWrap, heading, close);

  const uploadRow = document.createElement('div');
  Object.assign(uploadRow.style, { display: 'flex', gap: '8px', marginBottom: '14px' });

  const upload = document.createElement('label');
  upload.textContent = 'Upload photo';
  upload.dataset.quantoraProfileUpload = 'true';
  Object.assign(upload.style, {
    flex: '1', textAlign: 'center', border: '1px solid rgba(249,115,22,0.45)', background: 'rgba(249,115,22,0.14)',
    color: '#fb923c', borderRadius: '9px', padding: '9px 10px', fontSize: '0.78rem', fontWeight: '750', cursor: 'pointer',
  });
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    upload.textContent = 'Preparing…';
    try {
      const src = await resizeUploadedImage(file);
      saveAvatar(src);
      applyAvatarToDom();
      upload.textContent = 'Photo saved';
    } catch (error) {
      upload.textContent = 'Upload photo';
      alert(error?.message || 'Could not use this photo.');
    }
  });
  upload.append(input);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Use Google photo';
  buttonStyle(reset, false);
  reset.addEventListener('click', () => {
    clearSavedAvatar();
    applyAvatarToDom();
  });
  uploadRow.append(upload, reset);

  const label = document.createElement('div');
  label.textContent = 'QUANTORA AVATARS';
  Object.assign(label.style, { color: '#94a3b8', fontSize: '0.68rem', fontWeight: '800', letterSpacing: '0.06em', marginBottom: '8px' });

  const grid = document.createElement('div');
  Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' });
  for (const preset of PRESET_AVATARS) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.dataset.quantoraProfileAvatarChoice = preset.label.toLowerCase();
    choice.setAttribute('aria-label', `Choose ${preset.label} avatar`);
    choice.setAttribute('title', preset.label);
    const img = document.createElement('img');
    img.src = presetDataUrl(preset);
    img.alt = '';
    Object.assign(img.style, { width: '40px', height: '40px', borderRadius: '50%', display: 'block' });
    Object.assign(choice.style, {
      padding: '3px', borderRadius: '50%', border: '2px solid transparent', background: 'transparent', cursor: 'pointer',
    });
    choice.append(img);
    choice.addEventListener('click', () => {
      saveAvatar(img.src);
      applyAvatarToDom();
      for (const node of grid.querySelectorAll('button')) node.style.borderColor = 'transparent';
      choice.style.borderColor = '#f97316';
    });
    grid.append(choice);
  }

  const note = document.createElement('div');
  note.textContent = 'Your custom picture is stored on this device only.';
  Object.assign(note.style, { marginTop: '12px', color: '#64748b', fontSize: '0.68rem', lineHeight: '1.35' });

  panel.append(header, uploadRow, label, grid, note);
  document.body.append(panel);
}

function ensureProfileMenuEntry() {
  const menu = document.getElementById('quantora-profile-menu');
  if (!menu || menu.querySelector('[data-quantora-profile-picture-entry]')) return;

  const entry = document.createElement('button');
  entry.type = 'button';
  entry.dataset.quantoraProfilePictureEntry = 'true';
  entry.textContent = 'Change profile picture';
  buttonStyle(entry, true);
  Object.assign(entry.style, { width: '100%', margin: '0 0 12px 0' });
  entry.addEventListener('click', () => openPersonalizer(menu));
  menu.insertBefore(entry, menu.children[1] || null);
}

export function installProfilePersonalization() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyAvatarToDom();
      ensureProfileMenuEntry();
    });
  };

  const onClickCapture = (event) => {
    const sidebarProfile = event.target?.closest?.('[data-quantora-sidebar-profile]');
    if (!sidebarProfile) return;
    event.preventDefault();
    event.stopPropagation();
    openPersonalizer(sidebarProfile);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') closePersonalizer();
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('keydown', onKeyDown);
  const interval = window.setInterval(schedule, 1200);
  schedule();

  return () => {
    observer.disconnect();
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('keydown', onKeyDown);
    window.clearInterval(interval);
    closePersonalizer();
  };
}
