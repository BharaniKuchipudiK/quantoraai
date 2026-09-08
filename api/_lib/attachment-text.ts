import {
  attachmentKindFor,
  buildAttachedDocumentsBlock,
  extractAttachmentText,
  MAX_ATTACHED_DOCUMENTS,
  MAX_DOCUMENT_CHARS,
  MAX_DOCUMENTS_BLOCK_CHARS,
  summarizeAttachmentReads,
  type AttachmentKind,
  type AttachmentRead,
} from './attachment-text-core.js';
import { downloadAttachmentStorageRef } from './attachment-storage.js';

export {
  attachmentKindFor,
  buildAttachedDocumentsBlock,
  extractAttachmentText,
  MAX_ATTACHED_DOCUMENTS,
  MAX_DOCUMENT_CHARS,
  MAX_DOCUMENTS_BLOCK_CHARS,
  summarizeAttachmentReads,
};
export type { AttachmentKind, AttachmentRead };

export type AttachedDocumentInput = {
  name: string;
  mimeType?: string;
  dataUrl?: string;
  storageRef?: string;
  carried?: boolean;
};

/**
 * Storage-aware front door around the existing deterministic readers.
 *
 * Inline documents still execute the exact old implementation. Only the new
 * opaque storageRef path is resolved here, then its bytes are handed to the
 * same extractAttachmentText function. No parser, text budget or OCR claim is
 * changed by the 5 MiB transport work.
 */
export async function readAttachedDocuments(list: AttachedDocumentInput[]): Promise<AttachmentRead[]> {
  const reads: AttachmentRead[] = [];
  for (const item of (Array.isArray(list) ? list : []).slice(0, MAX_ATTACHED_DOCUMENTS)) {
    if (!item?.storageRef) {
      const core = await import('./attachment-text-core.js');
      const inline = await core.readAttachedDocuments([{
        name: item?.name || 'attachment',
        mimeType: item?.mimeType,
        dataUrl: item?.dataUrl || '',
        carried: item?.carried,
      }]);
      reads.push(...inline);
      continue;
    }

    const name = String(item.name || 'attachment');
    // The direct upload may finish milliseconds after the chat request reaches
    // the server. Retry only the precise not-ready condition and keep the wait
    // bounded; provider work must never be held hostage to storage.
    let stored = await downloadAttachmentStorageRef(item.storageRef);
    for (let attempt = 0; stored.ok === false && stored.reason === 'storage-not-ready' && attempt < 4; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      stored = await downloadAttachmentStorageRef(item.storageRef);
    }

    if (stored.ok === false) {
      const reason = stored.reason;
      reads.push({
        name,
        kind: attachmentKindFor(name, item.mimeType),
        ok: false,
        text: '',
        chars: 0,
        detail: reason === 'storage-ref-invalid'
          ? 'the private attachment reference expired or was invalid'
          : reason === 'storage-too-large'
            ? 'the stored file exceeds the 5 MiB attachment limit'
            : 'the private attachment could not be read from storage',
        reason,
        ...(item.carried === true ? { carried: true } : {}),
      });
      continue;
    }

    const extracted = await extractAttachmentText({ name, mimeType: item.mimeType, bytes: stored.bytes });
    reads.push(item.carried === true ? { ...extracted, carried: true } : extracted);
  }
  return reads;
}
