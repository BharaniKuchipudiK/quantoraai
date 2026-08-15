/**
 * Applies a search/replace diff block to a source string.
 * Supports the format:
 * <<<<
 * search code
 * ====
 * replace code
 * >>>>
 * 
 * @param {string} sourceText - The original file content.
 * @param {string} diffText - The text containing one or more search/replace blocks.
 * @returns {string} The patched source text.
 */
export function applyDiffPatch(sourceText, diffText) {
  if (!sourceText) return diffText; // If no source, just return the raw diff content as fallback

  // Regex to match search/replace blocks
  // <<<<\n(search)\n====\n(replace)\n>>>>
  const blockRegex = /<<<<\s*\n([\s\S]*?)\n====\s*\n([\s\S]*?)\n>>>>/g;
  
  let patchedText = sourceText;
  let match;
  let hasMatches = false;

  while ((match = blockRegex.exec(diffText)) !== null) {
    hasMatches = true;
    let searchStr = match[1];
    let replaceStr = match[2];

    // Attempt an exact match first
    if (patchedText.includes(searchStr)) {
      patchedText = patchedText.replace(searchStr, replaceStr);
      continue;
    }

    // If exact match fails, attempt a more lenient whitespace-agnostic match
    // (This is a simplified lenient matcher for AI reliability)
    const normalize = (str) => str.replace(/\s+/g, '').trim();
    const normalizedSearch = normalize(searchStr);
    
    // We can do a rudimentary fallback by finding the block that roughly matches
    // But for safety, if it doesn't strictly match, we might skip it or log a warning.
    // In a production environment, you'd use a diff library like diff-match-patch.
    console.warn("Diff patcher: Exact match failed for block. Ensure AI provides exact matching search blocks.", searchStr);
  }

  // If no blocks were found but it's classified as a diff, it might be using an older format or just raw text.
  // We strictly require the <<<< ==== >>>> syntax for patching.
  if (!hasMatches) {
     // If there are no diff blocks, we assume the AI is just rewriting the file entirely.
     return diffText;
  }

  return patchedText;
}
