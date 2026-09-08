import { latestVerifiedOfficeArtifact, sessionOutcomeKind } from './office-session-state.js';

const OFFICE_PREVIEW_FILE = /^(presentation|document|workbook)\.html$/i;
const WEBSITE_FILE = /(^|\/)(index\.html|App\.jsx)$/i;

/**
 * Vercel publish is a website outcome. Office files never get the button.
 * A running index.html / App.jsx on the coding desk is enough — do not hide
 * Publish behind a chat chip.
 */
export function canOfferVercelPublish({
  messages = [],
  vfs = {},
  conversationContext = {},
  officeKind = null,
} = {}) {
  if (officeKind || latestVerifiedOfficeArtifact(messages) || sessionOutcomeKind(conversationContext, messages)) {
    return false;
  }
  const names = Object.keys(vfs || {});
  if (names.some((name) => OFFICE_PREVIEW_FILE.test(name))) return false;
  return names.some((name) => WEBSITE_FILE.test(name));
}
