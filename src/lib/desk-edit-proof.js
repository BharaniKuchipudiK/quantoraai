/*
 * THE DESK CANNOT VOUCH FOR A TURN THAT DID NOT TOUCH IT.
 *
 * 2026-09-06, the deployed golden's first second-turn transaction: a site was
 * built from two attached documents, then asked to change its heading. The
 * model answered "I've updated the main heading … to read Golden Harvest
 * Community Portal" and returned no files. The desk, holding the site from
 * the turn before, proved THOSE files, found them fine, and closed the turn
 * as a success: "Generated files remain on the Coding desk; Preview still
 * needs to run them." The person read that the change was made. Nothing had
 * changed.
 *
 * The shortcut exists for a real case — skills author or repair a build on
 * the desk while the model returns prose — and that case leaves the desk
 * different from how the turn found it. So the rule is the difference: the
 * desk vouches for a turn only when its files changed during it, or skills
 * repaired them. A desk that holds exactly what it held before is not proof
 * of anything this turn did, however good those files are.
 */
import { deskFingerprint } from './build-job.js';

/** What the retry is told, so the second attempt differs from the first (turn-heal-contract). */
export const UNCHANGED_DESK_FAILURE_DETAIL = 'the reply described a change but returned no files, and the desk still holds exactly the files it held before this turn';

/**
 * @param {{ before?: object|string, after?: object|string, repaired?: boolean }} input
 *   before: the desk as the turn found it (a VFS or its fingerprint);
 *   after: the desk as the proof leaves it; repaired: whether skills repaired it.
 * @returns {{ changed: boolean, reason: string }}
 */
export function deskChangedThisTurn({ before = {}, after = {}, repaired = false } = {}) {
  const beforePrint = typeof before === 'string' ? before : deskFingerprint(before || {});
  const afterPrint = typeof after === 'string' ? after : deskFingerprint(after || {});
  if (repaired === true) return { changed: true, reason: 'skills repaired the desk during this turn' };
  if (!afterPrint) return { changed: false, reason: 'the desk is empty' };
  if (!beforePrint) return { changed: true, reason: 'the desk was empty before this turn and holds files now' };
  if (afterPrint !== beforePrint) return { changed: true, reason: 'the desk files changed during this turn' };
  return { changed: false, reason: 'the desk holds exactly the files it held before this turn' };
}
