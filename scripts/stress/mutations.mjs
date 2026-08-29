/**
 * Ways a real stream mangles a reply before it reaches the parser.
 *
 * Each mutation is something observed or plausible from a live provider, not
 * random fuzzing: fuzz finds crashes, these find the seams. A mutation must
 * never change what the reply MEANS — only how it arrives — so the same
 * invariants apply to the mutated form.
 */
export const MUTATIONS = [
  { id: 'as-is', apply: (text) => text },
  {
    id: 'crlf',
    why: 'Windows-style line endings from some gateways',
    apply: (text) => text.replace(/\n/g, '\r\n'),
  },
  {
    id: 'trailing-space',
    why: 'models pad fence lines; a search block must still match',
    apply: (text) => text.split('\n').map((line) => (line.trim() ? `${line} ` : line)).join('\n'),
  },
  {
    id: 'unclosed-fence',
    why: 'MAX_TOKENS cut the reply before the closing fence',
    apply: (text) => text.replace(/\n```\s*$/, ''),
  },
  {
    id: 'truncated-60pct',
    why: 'the stream died mid-document',
    apply: (text) => text.slice(0, Math.floor(text.length * 0.6)),
  },
  {
    id: 'prose-after',
    why: 'the model explains itself after the code',
    apply: (text) => `${text}\n\nWhat do you think? I can add a checkout next.`,
  },
  {
    id: 'blank-lines',
    why: 'extra whitespace between fences',
    apply: (text) => text.replace(/\n```/g, '\n\n\n```'),
  },
  {
    id: 'bom',
    why: 'a byte-order mark ahead of the first character',
    apply: (text) => `﻿${text}`,
  },
];
