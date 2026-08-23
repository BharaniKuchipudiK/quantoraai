export const PREVIEW_EMBED_PATH = '/preview/embed.html';

export const PREVIEW_RELAXED_CSP =
  "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; img-src 'self' https: data: blob:; connect-src 'self' https:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self';";

/**
 * Build the iframe `sandbox` attribute for the live preview.
 *
 * SECURITY INVARIANT — untrusted generated code must NEVER get `allow-same-origin`.
 * The embed host is served from the app's own origin (or a blob/data URL that
 * inherits it). Granting `allow-same-origin` there would let generated code read
 * the app's `localStorage` — which holds the user's Gemini / OpenRouter API keys —
 * and exfiltrate them. Without it the frame runs in an opaque origin and cannot
 * touch app storage; the preview still works because HTML is delivered by
 * `postMessage` + `document.write`, neither of which needs same-origin.
 *
 * `allow-same-origin` is granted ONLY for the WebContainer runtime (`wcUrl`),
 * which is a *cross-origin* host (e.g. *.webcontainer.io). There, same-origin
 * refers to the WebContainer's own origin, not the Quantora app's, so it still
 * cannot reach app storage — but it needs same-origin to function.
 *
 * @param {{ trustedRuntimeUrl?: string|null }} [opts]
 *   trustedRuntimeUrl — the WebContainer URL (`wcUrl`) if that runtime is active.
 * @returns {string} the space-separated sandbox token list.
 */
export function buildPreviewSandbox({ trustedRuntimeUrl = null } = {}) {
  const tokens = ['allow-scripts', 'allow-forms', 'allow-popups', 'allow-modals', 'allow-downloads'];
  if (trustedRuntimeUrl) tokens.push('allow-same-origin');
  return tokens.join(' ');
}

/** Inline embed shell — blob/src use avoids fetching /preview/embed.html (X-Frame-Options on SPA). */
export const PREVIEW_EMBED_SHELL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${PREVIEW_RELAXED_CSP}">
  <title>Quantora Preview</title>
    <style id="vfs-injected-styles"></style>
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
      try {
        var cartBtn = null;
        var buttons = document.querySelectorAll('button, a');
        for (var i = 0; i < buttons.length; i++) {
          if (/add to (bag|cart)/i.test(buttons[i].textContent || '')) { cartBtn = buttons[i]; break; }
        }
        if (cartBtn) {
          var bagBefore = 0;
          var nodes = document.querySelectorAll('a,button,span,div');
          for (var j = 0; j < nodes.length; j++) {
            var bagText = nodes[j].textContent || '';
            if (/^\\s*Bag\\s*\\d+/i.test(bagText) && (nodes[j].children || []).length === 0) {
              bagBefore = parseInt((bagText.match(/\\d+/) || ['0'])[0], 10) || 0;
              break;
            }
          }
          cartBtn.click();
          var bagAfter = bagBefore;
          nodes = document.querySelectorAll('a,button,span,div');
          for (var k = 0; k < nodes.length; k++) {
            var bagTextAfter = nodes[k].textContent || '';
            if (/^\\s*Bag\\s*\\d+/i.test(bagTextAfter) && (nodes[k].children || []).length === 0) {
              bagAfter = parseInt((bagTextAfter.match(/\\d+/) || ['0'])[0], 10) || 0;
              break;
            }
          }
          if (typeof window.__quantoraBagCount === 'number' && window.__quantoraBagCount > bagBefore) {
            bagAfter = window.__quantoraBagCount;
          }
          report({ kind:'shop-probe', hasCart:true, bagIncremented: bagAfter > bagBefore });
        }
      } catch (probeErr) {}
    }, 1200);
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

function looksLikeReactSource(source = '') {
  const text = String(source || '');
  return /(?:from\s+['\"]react['\"]|import\s+React\b|useState\s*\(|useEffect\s*\(|export\s+default\s+(?:function|class)|ReactDOM\.createRoot\s*\(|createRoot\s*\(|<[A-Z][A-Za-z0-9_.:-]*(?:\s|\/?>))/m.test(text);
}

function vfsText(vfs, key) {
  const entry = vfs?.[key];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.content === 'string') return entry.content;
  return '';
}

function collectVfsCss(vfs = {}) {
  const preferred = ['styles.css', 'index.css', 'App.css', 'src/index.css', 'src/App.css', 'src/styles.css'];
  const seen = new Set();
  const chunks = [];
  for (const key of preferred) {
    const text = vfsText(vfs, key);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    chunks.push(text);
  }
  for (const key of Object.keys(vfs || {})) {
    if (seen.has(key) || !/\.css$/i.test(key)) continue;
    const text = vfsText(vfs, key);
    if (text) chunks.push(text);
  }
  return chunks.join('\n');
}

function resolveVfsFile(vfs, href) {
  const clean = String(href || '').trim().replace(/[?#].*$/, '').replace(/^\.\//, '').replace(/^\//, '');
  if (!clean) return '';
  return vfsText(vfs, clean)
    || vfsText(vfs, href)
    || vfsText(vfs, clean.split('/').pop());
}

/** Opaque-origin preview has no HTTP server. Local CSS/JS must be inlined. */
export function inlineVfsAssets(html, vfs = {}) {
  let out = String(html || '');
  const css = collectVfsCss(vfs);
  if (css) {
    const styleTag = `<style id="vfs-styles">\n${css}\n</style>`;
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${styleTag}\n</head>`);
    else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html[^>]*>/i, (m) => `${m}<head>${styleTag}</head>`);
    else out = `${styleTag}${out}`;
  }

  out = out.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) return tag;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (/^(https?:)?\/\//i.test(href) || href.startsWith('data:')) return tag;
    return '';
  });

  out = out.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (full, pre, src, post) => {
    if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return full;
    const code = resolveVfsFile(vfs, src);
    if (!code) return full;
    return `<script${pre}${post}>\n${code}\n</script>`;
  });

  for (const key of ['script.js', 'index.js', 'app.js', 'main.js']) {
    const code = vfsText(vfs, key);
    if (!code || looksLikeReactSource(code)) continue;
    const marker = code.trim().slice(0, 48);
    if (marker && out.includes(marker)) continue;
    const tag = `<script>\n${code}\n</script>`;
    if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${tag}\n</body>`);
    else out += tag;
  }

  const catalog = vfsText(vfs, 'products.json');
  if (catalog) {
    const payload = JSON.stringify(catalog);
    out = out.replace(
      /fetch\(\s*(['"`])(?:\.\/|\/)?products\.json\1\s*\)/g,
      `Promise.resolve(new Response(${payload},{headers:{'Content-Type':'application/json'}}))`,
    );
  }

  return out;
}

export function pickPreviewEntryPath(vfs = {}) {
  const preferred = ['index.html', 'presentation.html', 'src/main.jsx', 'App.jsx', 'src/App.jsx'];
  for (const key of preferred) {
    if (vfsText(vfs, key)) return key;
  }
  const htmlKey = Object.keys(vfs || {}).find((key) => /\.html$/i.test(key));
  if (htmlKey) return htmlKey;
  return Object.keys(vfs || {})[0] || null;
}

export function pickPreviewEntry(vfs = {}) {
  const path = pickPreviewEntryPath(vfs);
  return path ? vfsText(vfs, path) : '';
}

export function prepareCodeForPreview(code, vfs = {}) {
  if (!code) return '';
  const str = String(code).trim();

  // If it's already an HTML document, inline local CSS/JS from the VFS.
  if (/^<!DOCTYPE html>/i.test(str) || /^<html/i.test(str) || /<head>/i.test(str)) {
    return inlineVfsAssets(str, vfs);
  }

  // React/JSX has exactly one supported execution path: the isolated Vite/Sandpack
  // project runtime. Never delete imports and try to execute the remainder in an
  // iframe. If routing regresses, fail visibly instead of producing a blank canvas.
  if (looksLikeReactSource(str)) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:#fff;color:#991b1b"><strong>React preview routing error.</strong><p>This generated app must run in the Quantora project runtime.</p></body></html>`;
  }

  if (/<<<<|====|>>>>/.test(str) || (/\{[^}]+\}/.test(str) && !/<[a-z]/i.test(str))) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0"><strong>Preview needs a complete HTML page.</strong><p>This update was a style patch or fragment, not a runnable document.</p></body></html>`;
  }

  // Fallback is for genuinely self-contained markup/snippets only.
  return `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body>${str}</body></html>`;
}

export function assembledPreviewHasUsableCss(html = '') {
  const src = String(html || '');
  if (isHonestPreviewFailurePage(src)) return false;
  if (/<style[\s>][\s\S]{12,}<\/style>/i.test(src)) return true;
  if (/\bstyle\s*=\s*["'][^"']{8,}/i.test(src)) return true;
  if (/cdn\.tailwindcss\.com/i.test(src) && /\bclass\s*=/i.test(src)) return true;
  return false;
}

/** Routing/fragment placeholders are not a successful outcome. */
export function isHonestPreviewFailurePage(html = '') {
  const src = String(html || '');
  return /React preview routing error/i.test(src)
    || /Preview needs a complete HTML page/i.test(src);
}

/**
 * What Preview may claim. Never "clean" for a failure page, missing CSS, or a crash.
 */
export function decidePreviewTrustStatus({
  assembledHtml = '',
  styledCheckOk = true,
  errorSeen = false,
} = {}) {
  if (errorSeen) return 'failed';
  if (isHonestPreviewFailurePage(assembledHtml)) return 'failed';
  if (!assembledPreviewHasUsableCss(assembledHtml) || styledCheckOk === false) return 'degraded';
  return 'clean';
}

export function usesTailwindCdn(html) {
  return /cdn\.tailwindcss\.com/i.test(String(html || ''));
}

export function isCriticalResourceError(message) {
  const text = String(message || '');
  return /Failed to load (SCRIPT|LINK):/i.test(text);
}

// Benign noise — broken hero images, opaque-origin fetch, fonts. Must NOT
// trigger a three-strike HTML rewrite while the boutique is already on screen.
export function isIgnorableRuntimeError(message) {
  if (!message) return true;
  const text = String(message);
  if (isCriticalResourceError(text)) return false;
  return /(?:^Script error\.?$|ResizeObserver loop|Non-Error promise rejection|Unhandled promise rejection:.*(?:Failed to fetch|NetworkError|Load failed|products\.json)|Failed to load IMG:)/i.test(text);
}
