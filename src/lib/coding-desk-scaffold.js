/**
 * Last-resort web shell for Coding Desk when a build turn never emitted files.
 * Preview only runs HTML/CSS/JS — native macOS/Python asks still get a dashboard
 * mock so FILES is never empty after a build acknowledgment.
 */

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deriveScaffoldTitle(brief = '') {
  const text = String(brief || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Workspace agent';
  const clipped = text.length > 72 ? `${text.slice(0, 69)}…` : text;
  return clipped.replace(/^(build|create|make|generate|design|develop|code|prototype)\s+(me\s+|a\s+|an\s+|the\s+)?/i, '')
    || 'Workspace agent';
}

export function buildCodingDeskScaffoldHtml(brief = '') {
  const title = escapeHtml(deriveScaffoldTitle(brief));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; --ink:#0f172a; --muted:#475569; --line:#e2e8f0; --accent:#0f766e; --panel:#f8fafc; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; color: var(--ink); background:
      radial-gradient(circle at 12% 8%, #ccfbf1 0, transparent 42%),
      radial-gradient(circle at 88% 0%, #e0f2fe 0, transparent 36%),
      #f1f5f9; }
    main { max-width: 920px; margin: 0 auto; padding: 40px 24px 64px; }
    h1 { font-size: 1.75rem; letter-spacing: -0.02em; margin: 0 0 8px; }
    p.lead { color: var(--muted); margin: 0 0 28px; max-width: 54ch; line-height: 1.5; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; }
    section h2 { font-size: 0.95rem; margin: 0 0 8px; }
    section p { margin: 0; color: var(--muted); font-size: 0.9rem; line-height: 1.45; }
    button { margin-top: 22px; background: var(--accent); color: #fff; border: 0; border-radius: 10px; padding: 10px 16px; font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid #134e4a; outline-offset: 2px; }
    #status { margin-top: 12px; color: var(--muted); font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p class="lead">Browser dashboard mock for this Coding Desk build. Native macOS or Python workers are represented here so Preview and FILES stay usable while the product takes shape.</p>
    <div class="grid">
      <section><h2>Sources</h2><p>Connect Drive folders, local paths, or rules the agent should crawl.</p></section>
      <section><h2>Organize</h2><p>Preview proposed moves, tags, and duplicates before anything is applied.</p></section>
      <section><h2>Activity</h2><p>Show crawl progress, errors, and what changed in the last run.</p></section>
    </div>
    <button type="button" id="run-demo">Run sample organize pass</button>
    <p id="status" role="status">Ready — ask Quantora to deepen any panel.</p>
  </main>
  <script>
    document.getElementById('run-demo')?.addEventListener('click', () => {
      const status = document.getElementById('status');
      if (status) status.textContent = 'Sample pass complete — 12 files grouped, 3 duplicates flagged.';
    });
  </script>
</body>
</html>`;
}

export function buildCodingDeskScaffoldReply(brief = '') {
  const title = deriveScaffoldTitle(brief);
  const html = buildCodingDeskScaffoldHtml(brief);
  return [
    `Preview only runs a web page, so I put a runnable dashboard shell for **${title}** on Coding desk instead of leaving FILES empty. Open Preview, then tell me which panel to deepen.`,
    '',
    '```html filepath="index.html"',
    html,
    '```',
  ].join('\n');
}
