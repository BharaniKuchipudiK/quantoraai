export const PREVIEW_EMBED_PATH = '/preview/embed.html';

export const PREVIEW_RELAXED_CSP =
  "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; img-src 'self' https: data: blob:; connect-src 'self' https:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self';";

/** Inline embed shell — blob/src use avoids fetching /preview/embed.html (X-Frame-Options on SPA). */
export const PREVIEW_EMBED_SHELL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${PREVIEW_RELAXED_CSP}">
  <title>Quantora Preview</title>
  <script>
    (function () {
      function render(html) {
        if (!html) return;
        document.open();
        document.write(html);
        document.close();
        bindEscape();
      }
      function bindEscape() {
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            try { parent.postMessage({ __quantora: true, kind: 'preview-close-request' }, '*'); } catch (err) {}
          }
        }, true);
      }
      window.addEventListener('message', function (e) {
        var d = e.data;
        if (d && Object.prototype.hasOwnProperty.call(d, '__quantoraPreviewHtml')) {
          render(d.__quantoraPreviewHtml);
        }
      });
      bindEscape();
      try {
        parent.postMessage({ __quantora: true, kind: 'embed-ready' }, '*');
      } catch (err) { /* cross-origin guard */ }
    })();
  <\/script>
</head>
<body style="margin:0;font-family:system-ui,sans-serif;color:#64748b;padding:16px">Loading preview…</body>
</html>`;

export function createPreviewEmbedObjectUrl() {
  const blob = new Blob([PREVIEW_EMBED_SHELL_HTML], { type: 'text/html;charset=utf-8' });
  return URL.createObjectURL(blob);
}

export function revokePreviewEmbedObjectUrl(url) {
  if (url && String(url).startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export function getPreviewEmbedPathUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${PREVIEW_EMBED_PATH}`;
  }
  return PREVIEW_EMBED_PATH;
}

export const PREVIEW_TAILWIND_PROBE_ID = '__quantora_tailwind_probe';

// Dedicated probe element — do not reuse `.hidden`; generated navs use `hidden md:flex`.
export const PREVIEW_TAILWIND_PROBE =
  `<div id="${PREVIEW_TAILWIND_PROBE_ID}" class="hidden" aria-hidden="true" style="display:none"></div>`;

// Harness injected into generated HTML inside the preview iframe document.
export const PREVIEW_ERROR_HARNESS = `<script>(function(){
  function report(p){ try{ parent.postMessage(Object.assign({__quantora:true}, p), '*'); }catch(e){} }
  window.addEventListener('error', function(e){
    var t = e && e.target;
    if (t && t !== window && (t.tagName || t.nodeType === 1)) {
      if (t.tagName === 'SCRIPT' || t.tagName === 'LINK') {
        report({ kind:'resource-error', message:'Failed to load ' + t.tagName + ': ' + (t.src || t.href || 'unknown') });
      }
      return;
    }
    var msg = e && e.message;
    if (!msg || msg === 'Script error.' || msg === 'Script error') return;
    var where = e.filename ? (' @ ' + e.filename + ':' + (e.lineno||0)) : '';
    report({ kind:'error', message: msg + where });
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason; var m = (r && (r.message || (r.toString && r.toString()))) || 'unknown';
    report({ kind:'error', message: 'Unhandled promise rejection: ' + m });
  });
  window.addEventListener('load', function(){
    setTimeout(function(){
      var tailwindScript = document.querySelector('script[src*="tailwindcss"]');
      var probe = document.getElementById('${PREVIEW_TAILWIND_PROBE_ID}');
      var stylingOk = true;
      if (tailwindScript && probe) {
        stylingOk = window.getComputedStyle(probe).display === 'none';
      }
      report({ kind:'loaded', stylingOk: stylingOk, usesTailwind: Boolean(tailwindScript) });
    }, 500);
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      report({ kind:'preview-close-request' });
    }
  }, true);
})();<\/script>`;

export function injectPreviewHarness(html) {
  const safe = html || '';
  const bundle = PREVIEW_ERROR_HARNESS + PREVIEW_TAILWIND_PROBE;
  if (/<head[^>]*>/i.test(safe)) return safe.replace(/<head[^>]*>/i, (m) => m + bundle);
  if (/<html[^>]*>/i.test(safe)) return safe.replace(/<html[^>]*>/i, (m) => m + '<head>' + bundle + '</head>');
  return bundle + safe;
}

export function prepareCodeForPreview(code) {
  if (!code) return '';
  const str = String(code).trim();
  
  // If it's already an HTML document, return it as is
  if (/^<!DOCTYPE html>/i.test(str) || /^<html/i.test(str) || /<head>/i.test(str)) {
    return str;
  }
  
  // Detect if it's a raw React/JSX component
  if (str.includes('import React') || str.includes('export default function') || str.includes('useState(')) {
    // Strip import/export statements that break browser execution
    let cleanCode = str
      .replace(/import\s+.*?from\s+['"].*?['"];?/g, '')
      .replace(/export\s+default\s+/g, '');
    
    // Extract component name
    const match = cleanCode.match(/function\s+([A-Za-z0-9_]+)/);
    const componentName = match ? match[1] : 'App';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 0; font-family: system-ui, sans-serif; background: #ffffff; color: #0f172a; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext } = React;
    ${cleanCode}
    
    // Auto-mount the detected component
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<${componentName} />);
  </script>
</body>
</html>`;
  }
  
  // Fallback: If it's just a snippet, wrap it in a body
  return `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body>${str}</body></html>`;
}

export function usesTailwindCdn(html) {
  return /cdn\.tailwindcss\.com/i.test(String(html || ''));
}

export function isCriticalResourceError(message) {
  const text = String(message || '');
  return /Failed to load (SCRIPT|LINK):/i.test(text) && /tailwindcss|unpkg|jsdelivr|stripe/i.test(text);
}

// Benign noise — broken hero images, etc. Must NOT suppress Tailwind/script load failures.
export function isIgnorableRuntimeError(message) {
  if (!message) return true;
  const text = String(message);
  if (isCriticalResourceError(text)) return false;
  return /(?:^Script error\.?$|ResizeObserver loop|Non-Error promise rejection)/i.test(text);
}
