import assert from 'node:assert/strict';
import test from 'node:test';
import { shareNoticeText } from './share-notice.js';

test('a copied link says so, and carries the link', () => {
  assert.equal(shareNoticeText({ url: 'https://preview-x.vercel.app', copied: true }), 'Link copied · https://preview-x.vercel.app');
});

test('a link the clipboard refused is offered to copy by hand, never claimed copied', () => {
  const text = shareNoticeText({ url: 'https://preview-x.vercel.app', copied: false });
  assert.equal(text, 'Copy this link · https://preview-x.vercel.app');
  assert.ok(!/copied/i.test(text));
  assert.equal(shareNoticeText({ url: ' https://preview-x.vercel.app ' }), 'Copy this link · https://preview-x.vercel.app');
});

test('no link at all still states the outcome without inventing one', () => {
  assert.equal(shareNoticeText({ copied: true }), 'Link copied');
  assert.equal(shareNoticeText({}), 'Link ready');
  assert.equal(shareNoticeText(), 'Link ready');
});
