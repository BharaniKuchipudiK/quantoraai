/*
 * The sentence the desk shows when a share link comes back.
 *
 * "Link copied" is a claim about the person's clipboard, so it is made only
 * when the write succeeded. When the browser refused the write — permission
 * denied, no clipboard at all — the notice shows the link to copy by hand
 * instead of a copy that did not happen. A review of #579 found the share
 * callback firing regardless of the copy outcome, which made the first
 * notice a lie in exactly the case where the person needed the link most.
 */
export function shareNoticeText({ url = '', copied = false } = {}) {
  const link = String(url || '').trim();
  if (!link) return copied ? 'Link copied' : 'Link ready';
  return copied ? `Link copied · ${link}` : `Copy this link · ${link}`;
}
