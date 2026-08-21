import { latestVerifiedOfficeArtifact, sessionOutcomeKind } from './office-session-state.js';

const OFFICE_PREVIEW_FILE = /^(presentation|document|workbook)\.html$/i;
const WEBSITE_FILE = /(^|\/)(index\.html|App\.jsx)$/i;

export function userConfirmedWebsitePublish(conversationContext = {}) {
  const facts = Array.isArray(conversationContext?.facts) ? conversationContext.facts : [];
  return facts.some((fact) => (
    /publish the website to vercel/i.test(fact)
    || /chose "publish this site"/i.test(fact)
  ));
}

/**
 * Vercel publish is a website outcome. Office files never get the button.
 * Websites get it after the user confirms via the Publish chip / leading question.
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
  const looksLikeWebsite = names.some((name) => WEBSITE_FILE.test(name));
  if (!looksLikeWebsite) return false;
  return userConfirmedWebsitePublish(conversationContext);
}
