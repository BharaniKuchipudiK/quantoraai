/**
 * The one probe both preview runtimes run inside the generated page.
 *
 * Review criteria for a desk that is not a shop or a calculator have to come
 * from somewhere observable, and source regex is not observation. This drives
 * the running DOM and reports only what it managed to watch: a fact it could
 * not observe is left off the payload so the desk can say "not checked"
 * instead of turning silence into a pass.
 *
 * Shop and calculator rows follow the same rule. A data-testid sitting in
 * source is not a pass — the probe has to see the node (or the bag move)
 * on the page that is actually running.
 */

export const DESK_PROBE_FACT_KEYS = Object.freeze(['itemAdded', 'controlResponded', 'pageRendered']);

export const DESK_PAGE_FACT_KEYS = Object.freeze([
  'hasCart',
  'hasCurrency',
  'hasCalculatorDisplay',
  'hasCalculatorKey',
  'hasScientificKeys',
  'bagIncremented',
]);

export const DESK_PAGE_COUNT_KEYS = Object.freeze([
  'photoCount',
  'uniquePhotoCount',
  'catalogCount',
]);

export const DESK_PROBE_SETTLE_MS = 400;

export const DESK_PROBE_ITEM_TEXT = 'Quantora probe item';

export function collectLiveDeskFacts(payload = {}) {
  const nested = payload && typeof payload.facts === 'object' && payload.facts ? payload.facts : null;
  const source = nested ? { ...payload, ...nested } : payload;
  const live = {};
  for (const key of DESK_PROBE_FACT_KEYS) {
    if (typeof source[key] === 'boolean') live[key] = source[key];
  }
  for (const key of DESK_PAGE_FACT_KEYS) {
    if (typeof source[key] === 'boolean') live[key] = source[key];
  }
  for (const key of DESK_PAGE_COUNT_KEYS) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key])) live[key] = source[key];
  }
  return live;
}

export const DESK_PROBE_FN_SOURCE = `function __quantoraDeskProbe(report, options){
  function visibleText(){ return ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim(); }
  function countItems(){ return document.querySelectorAll('li, [role="listitem"], [data-testid*="item"], [data-item]').length; }
  function labelOf(node){ return ((node.textContent || '') + ' ' + (node.getAttribute('aria-label') || '')).trim(); }
  function controls(){
    var out = [];
    var nodes = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var label = labelOf(nodes[i]);
      if (/delete|remove|clear|reset|sign|log ?out|buy|pay|checkout|close|cancel/i.test(label)) continue;
      if (nodes[i].disabled === true) continue;
      out.push({ node: nodes[i], label: label });
    }
    return out;
  }
  function addControl(list){
    for (var i = 0; i < list.length; i++) {
      if (/(^|\\b)(add|create|new|insert|save)(\\b|$)|^\\+$/i.test(list[i].label)) return list[i].node;
    }
    return null;
  }
  function neutralControl(list){
    for (var i = 0; i < list.length; i++) {
      if (/(^|\\b)(next|start|toggle|show|open|more|increment|count|play|expand|filter|sort)(\\b|$)/i.test(list[i].label)) return list[i].node;
    }
    return null;
  }
  function typeInto(field, value){
    try {
      var proto = field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (typeError) { return false; }
  }
  function findCart(){
    var buttons = document.querySelectorAll('button, a, [role="button"]');
    for (var i = 0; i < buttons.length; i++) {
      if (/add to (bag|cart)/i.test(buttons[i].textContent || '')) return buttons[i];
    }
    return null;
  }
  function readBag(){
    var nodes = document.querySelectorAll('a,button,span,div');
    for (var i = 0; i < nodes.length; i++) {
      var text = nodes[i].textContent || '';
      if (/^\\s*(?:Bag|Cart)\\s*[:.(]?\\s*\\d+/i.test(text) && (nodes[i].children || []).length === 0) {
        return parseInt((text.match(/\\d+/) || ['0'])[0], 10) || 0;
      }
    }
    return typeof window.__quantoraBagCount === 'number' ? window.__quantoraBagCount : 0;
  }
  function countPhotos(){
    var photoCount = 0;
    var photoIds = {};
    var imgs = document.querySelectorAll('img');
    for (var p = 0; p < imgs.length; p++) {
      var img = imgs[p];
      var src = img.getAttribute('src') || '';
      if (!/^(data:image\\/|https?:\\/\\/|\\/api\\/preview-image)/i.test(src)) continue;
      // Broken remote icons still have a src — require a decoded bitmap.
      if (!(img.complete && img.naturalWidth > 0)) continue;
      photoCount += 1;
      var idMatch = src.match(/quantora-photo-\\d+|photo-[\\w-]+/i);
      var id = idMatch ? idMatch[0].toLowerCase() : src.slice(0, 96).toLowerCase();
      photoIds[id] = 1;
    }
    var uniquePhotoCount = 0;
    for (var pid in photoIds) {
      if (Object.prototype.hasOwnProperty.call(photoIds, pid)) uniquePhotoCount += 1;
    }
    return { photoCount: photoCount, uniquePhotoCount: uniquePhotoCount };
  }
  function hasCurrency(){
    var currencySel = document.getElementById('quantora-currency');
    if (!currencySel) {
      var selects = document.querySelectorAll('select');
      for (var s = 0; s < selects.length; s++) {
        var selMeta = ((selects[s].id || '') + ' ' + (selects[s].getAttribute('name') || '') + ' ' + (selects[s].getAttribute('aria-label') || '')).toLowerCase();
        if (selMeta.indexOf('currenc') !== -1) { currencySel = selects[s]; break; }
      }
    }
    var currencyText = currencySel ? String(currencySel.textContent || '') : '';
    return Boolean(currencySel && /USD/i.test(currencyText) && /INR/i.test(currencyText));
  }
  function catalogCount(){
    var cards = document.querySelectorAll('.product-card, [data-product], [data-catalog-item], [data-testid*="product"]');
    if (cards.length) return cards.length;
    return document.querySelectorAll('[data-quantora-price], .price, [class*="price"]').length;
  }
  function hasDigitKey(){
    if (document.querySelector('[data-testid="calculator-one"]')) return true;
    var keys = document.querySelectorAll('button, [role="button"]');
    for (var k = 0; k < keys.length; k++) {
      if (/^\\s*[0-9]\\s*$/.test(keys[k].textContent || '')) return true;
    }
    return false;
  }
  function hasCalculatorDisplay(){
    if (document.querySelector('[data-testid="calculator-display"]')) return true;
    if (document.querySelector('output')) return true;
    if (document.querySelector('#display, .display, [data-display], [data-calc-display]')) return true;
    var live = document.querySelector('[role="status"], [aria-live="polite"], [aria-live="assertive"]');
    if (live && !live.querySelector('button, [role="button"]')) {
      var liveText = ((live.textContent || live.value || '') + '').replace(/\\s+/g, ' ').trim();
      if (liveText && liveText.length <= 64) return true;
    }
    if (document.querySelector('input[readonly], input[aria-readonly="true"]')) return true;
    return false;
  }
  function hasScientificKeys(){
    var labels = [];
    var keys = document.querySelectorAll('button, [role="button"]');
    for (var s = 0; s < keys.length; s++) {
      var label = ((keys[s].textContent || '') + '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (label) labels.push(label);
    }
    function has(name){
      for (var i = 0; i < labels.length; i++) { if (labels[i] === name) return true; }
      return false;
    }
    return (has('sin') && has('cos')) || (has('deg') && has('rad'));
  }

  var facts = {};
  facts.pageRendered = Boolean(document.body && (visibleText().length > 0 || document.body.querySelectorAll('*').length > 3));

  // Snapshot the page before typing into search or clicking filters.
  var photos = countPhotos();
  facts.photoCount = photos.photoCount;
  facts.uniquePhotoCount = photos.uniquePhotoCount;
  facts.hasCurrency = hasCurrency();
  facts.catalogCount = catalogCount();
  facts.hasCalculatorDisplay = hasCalculatorDisplay();
  facts.hasCalculatorKey = hasDigitKey();
  facts.hasScientificKeys = hasScientificKeys();
  var cartBtn = findCart();
  facts.hasCart = Boolean(cartBtn);
  // The user's running page is observational. Mutating checks are opt-in for
  // disposable test fixtures only, never either production preview runtime.
  if (!options || options.allowMutations !== true) {
    try { report(facts); } catch (reportError) {}
    return;
  }
  var bagBefore = readBag();

  var list = controls();
  var field = document.querySelector('input[type="text"], input[type="search"], input:not([type]), textarea');
  var adder = addControl(list);
  var clicked = null;
  var typed = false;
  var itemsBefore = countItems();
  var textBefore = visibleText();

  if (adder && field) {
    typed = typeInto(field, ${JSON.stringify(DESK_PROBE_ITEM_TEXT)});
    clicked = adder;
  } else if (adder) {
    clicked = adder;
  } else {
    clicked = neutralControl(list);
  }
  if (clicked) { try { clicked.click(); } catch (clickError) {} }
  if (cartBtn && cartBtn !== clicked) {
    try { cartBtn.click(); } catch (cartError) {}
  }

  setTimeout(function(){
    var textAfter = visibleText();
    var moved = textAfter !== textBefore;
    if (field || adder) {
      facts.itemAdded = Boolean(adder && field && typed
        && (countItems() > itemsBefore || textAfter.indexOf(${JSON.stringify(DESK_PROBE_ITEM_TEXT)}) !== -1));
    }
    if (clicked) facts.controlResponded = moved;
    var bagAfter = readBag();
    if (typeof window.__quantoraBagCount === 'number' && window.__quantoraBagCount > bagBefore) {
      bagAfter = window.__quantoraBagCount;
    }
    facts.bagIncremented = Boolean(cartBtn) && bagAfter > bagBefore;
    try { report(facts); } catch (reportError) {}
  }, ${DESK_PROBE_SETTLE_MS});
}`;
