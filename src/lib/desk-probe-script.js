/**
 * The one probe both preview runtimes run inside the generated page.
 *
 * Review criteria for a desk that is not a shop or a calculator have to come
 * from somewhere observable, and source regex is not observation. This drives
 * the running DOM and reports only what it managed to watch: a fact it could
 * not observe is left off the payload so the desk can say "not checked"
 * instead of turning silence into a pass.
 */

export const DESK_PROBE_FACT_KEYS = Object.freeze(['itemAdded', 'controlResponded', 'pageRendered']);

export const DESK_PROBE_SETTLE_MS = 400;

export const DESK_PROBE_ITEM_TEXT = 'Quantora probe item';

export const DESK_PROBE_FN_SOURCE = `function __quantoraDeskProbe(report){
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

  var facts = {};
  facts.pageRendered = Boolean(document.body && (visibleText().length > 0 || document.body.querySelectorAll('*').length > 3));

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

  setTimeout(function(){
    var textAfter = visibleText();
    var moved = textAfter !== textBefore;
    if (field || adder) {
      facts.itemAdded = Boolean(adder && field && typed
        && (countItems() > itemsBefore || textAfter.indexOf(${JSON.stringify(DESK_PROBE_ITEM_TEXT)}) !== -1));
    }
    if (clicked) facts.controlResponded = moved;
    try { report(facts); } catch (reportError) {}
  }, ${DESK_PROBE_SETTLE_MS});
}`;
