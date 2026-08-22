import test from 'node:test';
import assert from 'node:assert/strict';
import { canOfferVercelPublish } from './preview-publish-policy.js';

const deck = {
  kind: 'powerpoint',
  spec: { version: 2, title: 'HAM SAM', slides: [] },
  htmlPreview: '<html>deck</html>',
  verification: { passed: true, previewFingerprint: 'abc12345' },
};

test('PowerPoint preview never offers Publish to Vercel', () => {
  assert.equal(canOfferVercelPublish({
    officeKind: 'powerpoint',
    vfs: { 'index.html': { content: '<html></html>' } },
    conversationContext: { facts: ['User confirmed: publish the website to Vercel.'] },
  }), false);
  assert.equal(canOfferVercelPublish({
    messages: [{ sender: 'ai', officeAttachment: deck }],
    vfs: { 'presentation.html': { content: '<html></html>' } },
  }), false);
});

test('a website on the desk offers Publish without waiting for a chat chip', () => {
  assert.equal(canOfferVercelPublish({
    vfs: { 'index.html': { content: '<html></html>' } },
    conversationContext: {},
  }), true);
  assert.equal(canOfferVercelPublish({
    vfs: { 'index.html': { content: '<html></html>' } },
    conversationContext: { facts: ['User action: chose "Publish this site"'] },
  }), true);
  assert.equal(canOfferVercelPublish({
    vfs: { 'notes.md': { content: 'hello' } },
  }), false);
});
