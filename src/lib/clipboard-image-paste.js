const IMAGE_MIME = /^image\//i;

export function clipboardImageFiles(clipboardData) {
  if (!clipboardData) return [];

  const itemFiles = Array.from(clipboardData.items || [])
    .filter((item) => item?.kind === 'file' && IMAGE_MIME.test(String(item?.type || '')))
    .map((item) => item.getAsFile?.())
    .filter(Boolean);

  if (itemFiles.length) return itemFiles;

  return Array.from(clipboardData.files || [])
    .filter((file) => IMAGE_MIME.test(String(file?.type || '')));
}

function extensionForMime(type = '') {
  const normalized = String(type).toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/heic') return 'heic';
  return 'png';
}

export function normalizeClipboardImageFile(file, index = 0, now = Date.now()) {
  if (!file) return null;
  if (String(file.name || '').trim()) return file;

  const name = `clipboard-image-${now}-${index + 1}.${extensionForMime(file.type)}`;
  try {
    return new File([file], name, {
      type: file.type || 'image/png',
      lastModified: Number(file.lastModified) || now,
    });
  } catch {
    return file;
  }
}

function findComposerFileInput(textarea) {
  let node = textarea?.parentElement || null;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    const input = node.querySelector?.('input[type="file"][multiple]');
    if (input) return input;
  }
  return null;
}

export function routeClipboardImagesToComposer(event) {
  const textarea = event?.target;
  if (!(textarea instanceof HTMLTextAreaElement)) return false;

  const fileInput = findComposerFileInput(textarea);
  if (!fileInput) return false;

  const imageFiles = clipboardImageFiles(event.clipboardData);
  if (!imageFiles.length || typeof DataTransfer === 'undefined') return false;

  const transfer = new DataTransfer();
  imageFiles.forEach((file, index) => {
    const normalized = normalizeClipboardImageFile(file, index);
    if (normalized) transfer.items.add(normalized);
  });
  if (!transfer.files.length) return false;

  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  event.preventDefault();
  return true;
}

export function installPromptClipboardImagePaste() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.__quantoraPromptClipboardPasteInstalled) return;
  window.__quantoraPromptClipboardPasteInstalled = true;

  document.addEventListener('paste', (event) => {
    routeClipboardImagesToComposer(event);
  }, true);
}
