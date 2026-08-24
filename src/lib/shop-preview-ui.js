/**
 * Preview is the product. Chat claiming a currency switcher or Add to Cart
 * does not put those controls on the desk — this does.
 */

const SHOP_UI_MARK = 'data-quantora-shop-ui';

export function previewHtmlHasCurrencySwitcher(html = '') {
  const src = String(html || '');
  if (src.includes(SHOP_UI_MARK) && /\bUSD\b/.test(src) && /\bINR\b/.test(src)) return true;
  return /<select\b[^>]*(?:id|name|aria-label)=["'][^"']*currenc/i.test(src)
    && /\bUSD\b/.test(src)
    && /\bINR\b/.test(src);
}

export function previewHtmlHasAddToCartControl(html = '') {
  return /add[\s-]?to[\s-]?(?:bag|cart)/i.test(String(html || ''));
}

function shopUiScript() {
  return `<script ${SHOP_UI_MARK}="script">
(function(){
  if (window.__quantoraShopUi) return;
  window.__quantoraShopUi = true;
  var rates = {INR:1, USD:0.012, SGD:0.016, AUD:0.018, AED:0.044};
  var symbols = {INR:'\\u20B9', USD:'$', SGD:'S$', AUD:'A$', AED:'AED '};
  var currency = 'INR';
  var bagCount = 0;
  function inrOf(el){
    if (el.getAttribute('data-inr')) return Number(el.getAttribute('data-inr')) || 0;
    var text = (el.textContent || '').replace(/,/g,'');
    var m = text.match(/\\u20B9\\s*([0-9.]+)|INR\\s*([0-9.]+)|([0-9.]+)\\s*(?:INR|Rs)/i);
    var n = m ? Number(m[1] || m[2] || m[3]) : 0;
    if (n) el.setAttribute('data-inr', String(n));
    return n;
  }
  function paintPrices(){
    document.querySelectorAll('[data-quantora-price], .price, [class*="price"]').forEach(function(el){
      var n = inrOf(el);
      if (!n) return;
      var converted = n * (rates[currency] || 1);
      var shown = currency === 'INR' ? Math.round(converted).toLocaleString('en-IN') : converted.toFixed(2);
      el.textContent = (symbols[currency] || '') + shown;
    });
  }
  function bumpBag(){
    bagCount += 1;
    window.__quantoraBagCount = bagCount;
    bagLabel();
  }
  function bagLabel(){
    var nodes = document.querySelectorAll('a,button,span,div');
    for (var i = 0; i < nodes.length; i++) {
      if (/^\\s*Bag\\s*\\d+/i.test(nodes[i].textContent || '') && (nodes[i].children || []).length === 0) {
        nodes[i].textContent = 'Bag ' + bagCount;
        return;
      }
    }
    var host = document.querySelector('[data-quantora-shop-ui="bar"]') || document.querySelector('header') || document.body;
    var bag = document.createElement('button');
    bag.setAttribute('data-quantora-bag', 'true');
    bag.type = 'button';
    bag.textContent = 'Bag ' + bagCount;
    bag.style.cssText = 'padding:4px 10px;border:0;border-radius:999px;background:#f8f4e8;color:#111;font-weight:700;cursor:pointer';
    host.appendChild(bag);
  }
  function ensureBar(){
    if (document.querySelector('[data-quantora-shop-ui="bar"]')) return;
    var bar = document.createElement('div');
    bar.setAttribute('data-quantora-shop-ui', 'bar');
    bar.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:flex-end;flex-wrap:wrap;padding:10px 16px;background:#111;color:#f8f4e8;font-family:system-ui,sans-serif;font-size:14px';
    bar.innerHTML = '<label>Currency <select id="quantora-currency" style="margin-left:6px;padding:4px 8px;border-radius:8px"><option value="INR">INR \\u20B9</option><option value="USD">USD $</option><option value="SGD">SGD S$</option><option value="AUD">AUD A$</option><option value="AED">AED</option></select></label><button type="button" data-quantora-bag="true" style="padding:4px 10px;border:0;border-radius:999px;background:#f8f4e8;color:#111;font-weight:700">Bag 0</button>';
    var host = document.querySelector('header') || document.body;
    host.insertBefore(bar, host.firstChild);
    bar.querySelector('select').addEventListener('change', function(e){
      currency = e.target.value;
      paintPrices();
    });
  }
  function ensureCartButtons(){
    var cards = document.querySelectorAll('.product-card, .product-item, .product-tile, .saree-card, [class*="product-card"]');
    if (!cards.length) {
      var mount = document.createElement('div');
      mount.setAttribute('data-quantora-shop-ui', 'cart-mount');
      mount.style.cssText = 'padding:16px 20px';
      (document.querySelector('main') || document.body).appendChild(mount);
      cards = [mount];
    } else {
      cards = Array.from(cards).slice(0, 8);
    }
    cards.forEach(function(card, i){
      var existing = Array.from(card.querySelectorAll('button, a')).find(function(n){ return /add to (bag|cart)/i.test(n.textContent || ''); });
      if (existing) return;
      if (!card.querySelector('[data-quantora-price], .price, [class*="price"]')) {
        var price = document.createElement('div');
        price.className = 'price';
        price.setAttribute('data-quantora-price', 'true');
        price.setAttribute('data-inr', String(18000 + i * 2500));
        price.style.cssText = 'margin:8px 0;color:#e8c56b;font-weight:600';
        card.appendChild(price);
      }
      var btn = document.createElement('button');
      btn.setAttribute('data-quantora-add', 'true');
      btn.type = 'button';
      btn.textContent = 'Add to Cart';
      btn.style.cssText = 'margin-top:8px;padding:8px 14px;border:0;border-radius:999px;background:#c4a35a;color:#111;font-weight:700;cursor:pointer';
      btn.addEventListener('click', function(){
        btn.textContent = 'Added';
        setTimeout(function(){ btn.textContent = 'Add to Cart'; }, 900);
      });
      card.appendChild(btn);
    });
  }
  function start(){
    ensureBar();
    ensureCartButtons();
    paintPrices();
    bagLabel();
    document.addEventListener('click', function(e){
      var node = e.target;
      while (node && node !== document) {
        var tag = node.tagName;
        if ((tag === 'BUTTON' || tag === 'A') && /add to (bag|cart)/i.test(node.textContent || '')) {
          bumpBag();
          return;
        }
        node = node.parentElement;
      }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
</script>`;
}

function shopUiBar() {
  return `<div ${SHOP_UI_MARK}="bar" style="display:flex;gap:12px;align-items:center;justify-content:flex-end;flex-wrap:wrap;padding:10px 16px;background:#111;color:#f8f4e8;font-family:system-ui,sans-serif;font-size:14px"><label>Currency <select id="quantora-currency" style="margin-left:6px;padding:4px 8px;border-radius:8px"><option value="INR">INR</option><option value="USD">USD $</option><option value="SGD">SGD S$</option><option value="AUD">AUD A$</option><option value="AED">AED</option></select></label><button type="button" data-quantora-bag="true" style="padding:4px 10px;border:0;border-radius:999px;background:#f8f4e8;color:#111;font-weight:700">Bag 0</button></div>`;
}

function withWorkingCartClicks(html = '') {
  return String(html).replace(/<(button|a)(\b[^>]*)>([^<]*?add to (?:bag|cart)[^<]*?)<\/\1>/gi, (full, tag, attrs, text) => {
    if (/\bonclick\s*=/i.test(attrs)) return full;
    return `<${tag}${attrs} onclick="var b=document.querySelector('[data-quantora-bag]');if(b){var n=parseInt(String(b.textContent).replace(/[^0-9]/g,''),10)||0;b.textContent='Bag '+(n+1);}">${text}</${tag}>`;
  });
}

export function injectShopCommerceUi(html = '') {
  const source = String(html || '');
  if (!source) return { html: source, changed: false };
  if (source.includes(SHOP_UI_MARK)) return { html: source, changed: false };

  let next = withWorkingCartClicks(source);
  const hasCurrency = previewHtmlHasCurrencySwitcher(next);
  if (!hasCurrency) {
    if (/<body[^>]*>/i.test(next)) {
      next = next.replace(/<body[^>]*>/i, (m) => `${m}${shopUiBar()}`);
    } else {
      next = `${shopUiBar()}${next}`;
    }
  }
  const snippet = shopUiScript();
  if (/<\/body>/i.test(next)) {
    return { html: next.replace(/<\/body>/i, () => `${snippet}</body>`), changed: true };
  }
  return { html: next + snippet, changed: true };
}
