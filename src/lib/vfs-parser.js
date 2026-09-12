import { applyDiffPatch, looksLikePatch } from './diff-patcher.js';

function looksLikeReactSource(source = '') {
  return /(?:from\s+['"]react['"]|import\s+React\b|useState\s*\(|useEffect\s*\(|export\s+default\s+(?:function|class)|ReactDOM\.createRoot\s*\(|createRoot\s*\(|<[A-Z][A-Za-z0-9_.:-]*(?:\s|\/?>))/m.test(String(source || ''));
}

/** Chat prose plus a later HTML document must not become the preview page. */
export function isolateHtmlDocument(source = '') {
  const text = String(source || '');
  const start = text.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (start < 0) return '';
  return text.slice(start).trim();
}

/**
 * Parses markdown text to extract code blocks into a Virtual File System (VFS).
 *
 * @param {string} text - The markdown text (often streamed).
 * @returns {object} A VFS object mapping filepaths to their contents.
 * Example: { 'App.jsx': { content: '...', language: 'jsx' } }
 */
/**
 * Parse a reply into project files, and report any edit that did not land.
 *
 * Returns { vfs, patchFailures }. parseVFSFromMarkdown wraps this for the
 * callers that only want the files; anything that speaks to the user should
 * come through here, because a partly-applied patch that goes unreported is
 * how a build ends up wrong under a confident sentence.
 */
export function parseVFSWithReport(text, currentVfs = {}) {
  // Existing files are used only as the base for an actual code update/diff.
  // A plain-language reply must return an empty parse result; otherwise callers
  // cannot distinguish "this response contains project files" from "an older
  // project happens to exist", which used to resurrect Code Preview in Travel.
  let vfs = JSON.parse(JSON.stringify(currentVfs));
  if (!text) return { vfs: {}, patchFailures: [], emptyFenceKept: [] };

  const codeBlockRegex = /```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*?)```/g;
  let foundRunnableFile = false;
  const patchFailures = [];
  // Files an empty fence tried to blank, kept instead. Reported, never silent.
  const emptyFenceKept = [];

  function ingestBlock(languageRaw, attributesRaw, codeRaw) {
    const language = (languageRaw || '').toLowerCase();
    let attributes = attributesRaw || '';
    let code = codeRaw;
    // Some providers place the file attribute immediately inside the fence.
    // Accept only a standalone metadata line, never an assignment in real code.
    const bodyPath = !attributes.trim() && code.match(/^[ \t]*((?:filepath|filename)=["'][^"'\r\n]+["'])[ \t]*\r?\n/);
    if (bodyPath) {
      attributes = bodyPath[1];
      code = code.slice(bodyPath[0].length);
    }

    if (language === 'html' && /id=["']quantora-office-manifest["']/i.test(code)) {
      vfs = {
        'presentation.html': {
          content: code,
          language: 'html',
        },
      };
      foundRunnableFile = true;
      return 'office';
    }

    const filepathMatch = attributes.match(/(?:filepath|filename)\s*=\s*["']([^"']+)["']/)
      || attributes.match(/(?:filepath|filename)\s*=\s*([^\s"']+)/)
      || attributes.match(/^([\w./-]+\.\w+)$/);
    let filepath = filepathMatch ? filepathMatch[1] : null;

    if (!filepath) {
      if (language === 'css') {
        filepath = 'styles.css';
      } else if (language === 'html') {
        filepath = 'index.html';
      } else if (['jsx', 'tsx', 'typescript', 'react'].includes(language) || looksLikeReactSource(code)) {
        filepath = 'App.jsx';
      } else if (['js', 'javascript', 'ts'].includes(language)) {
        filepath = 'script.js';
      } else {
        return false;
      }
    }

    let normalizedLanguage = language;
    if (['js', 'jsx', 'javascript', 'react'].includes(language)) normalizedLanguage = 'jsx';
    if (['ts', 'tsx', 'typescript'].includes(language)) normalizedLanguage = 'tsx';

    /*
     * Recognise a patch BEFORE isolating an HTML document.
     *
     * isolateHtmlDocument looks for <!DOCTYPE html> or <html>. A search/replace
     * block contains neither, so it returned '' and the block was thrown away —
     * meaning a patch to index.html has never once been accepted, whatever the
     * system prompt asked the model to emit. Full-document rewrites were not a
     * policy choice here; they were the only thing that could get through.
     */
    const isPatch = looksLikePatch(code);

    if (!isPatch && (language === 'html' || /\.html$/i.test(filepath))) {
      const html = isolateHtmlDocument(code);
      if (!html) return false;
      code = html;
    }

    const existingContent = vfs[filepath] ? vfs[filepath].content : '';
    if (isPatch && !existingContent) {
      return false;
    }

    /*
     * AN EMPTY FENCE NEVER DELETES A FILE.
     *
     * Found by the pipeline stress harness. A reply carrying
     * ```css filepath="styles.css"``` with nothing inside it overwrote a real
     * stylesheet with "", the desk committed, and the page rendered unstyled
     * with nothing said. A model that truncates mid-file, or emits a stray
     * empty block beside a good one, silently destroyed work the user had.
     *
     * There is no reading of an empty block that means "delete this file" — a
     * deletion is not something a code fence can express. Keeping what exists
     * is the only safe interpretation, and losing an intended blanking is a
     * far cheaper mistake than losing a file somebody wrote.
     */
    if (!String(code || '').trim() && String(existingContent || '').trim()) {
      if (!emptyFenceKept.includes(filepath)) emptyFenceKept.push(filepath);
      return false;
    }

    let content = code;
    if (isPatch) {
      /*
       * A patch that only partly applied must be REPORTED, never committed as
       * if it were whole. The previous code took a plain string back and had no
       * way to know: two edits went out, one landed, the desk committed the
       * file and the reply claimed both. Collected here and surfaced by the
       * caller through patchFailures.
       */
      const result = applyDiffPatch(existingContent, code);
      if (!result.ok) patchFailures.push({ filepath, result });
      // A patch that landed nothing leaves the file exactly as it was, rather
      // than rewriting it with a half-edit or with the markers themselves.
      if (!result.applied.length) return false;
      content = result.text;
    }

    foundRunnableFile = true;
    vfs[filepath] = { content, language: normalizedLanguage };
    return true;
  }

  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const result = ingestBlock(match[1], match[2], match[3]);
    if (result === 'office') return { vfs, patchFailures, emptyFenceKept };
  }

  const withoutClosed = String(text || '').replace(/```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*?)```/g, '');
  const dangling = withoutClosed.match(/```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*)$/);
  if (dangling) {
    ingestBlock(dangling[1], dangling[2], dangling[3]);
  }

  return { vfs: foundRunnableFile ? vfs : {}, patchFailures, emptyFenceKept };
}

/**
 * The sentence the turn shows when an empty fence tried to blank a file.
 * Says what was kept and why, so the user can ask for a real deletion rather
 * than discovering an unstyled page and no explanation.
 */
export function describeEmptyFenceKept(filepaths = []) {
  const list = (filepaths || []).filter(Boolean);
  if (!list.length) return '';
  const names = list.join(', ');
  const subject = list.length === 1 ? 'an empty block' : 'empty blocks';
  return `The reply contained ${subject} for ${names}. Your existing ${list.length === 1 ? 'file was' : 'files were'} kept — an empty block is treated as a truncated reply, not a deletion. Ask again if you meant to clear ${list.length === 1 ? 'it' : 'them'}.`;
}
