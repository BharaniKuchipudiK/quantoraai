export const PREVIEW_EMBED_PATH = '/preview/embed.html';

export const PREVIEW_RELAXED_CSP =
  "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; img-src 'self' https: data: blob:; connect-src 'self' https:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';";

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
      var probe = document.querySelector('.hidden');
      var stylingOk = true;
      if (tailwindScript && probe) {
        stylingOk = window.getComputedStyle(probe).display === 'none';
      }
      report({ kind:'loaded', stylingOk: stylingOk, usesTailwind: Boolean(tailwindScript) });
    }, 500);
  });
})();<\/script>`;

export function injectPreviewHarness(html) {
  const safe = html || '';
  if (/<head[^>]*>/i.test(safe)) return safe.replace(/<head[^>]*>/i, (m) => m + PREVIEW_ERROR_HARNESS);
  if (/<html[^>]*>/i.test(safe)) return safe.replace(/<html[^>]*>/i, (m) => m + '<head>' + PREVIEW_ERROR_HARNESS + '</head>');
  return PREVIEW_ERROR_HARNESS + safe;
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
