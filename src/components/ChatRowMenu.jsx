import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Pencil, Pin, PinOff, FolderInput, Archive, ArchiveRestore, Trash2 } from 'lucide-react';

/*
 * The ⋮ on a chat row.
 *
 * It replaces a permanently visible `<select>` labelled "Move to…" and a
 * permanently visible bin. Two controls, on every row, for the two things a
 * person does least often — and the bin sat one mis-click from destroying a
 * conversation that has no undo.
 *
 * EVERY ITEM IN HERE DOES SOMETHING
 *
 * The menu carries exactly the actions that exist: rename, pin, move, archive,
 * delete. Nothing is listed "for later" and nothing is greyed out with a
 * tooltip promising a future release — a menu item that does nothing is the
 * painted door this repo has an incident for, and a menu is where they breed.
 * Move only appears when there is somewhere to move to.
 *
 * Delete keeps a confirm because it is the one action here that cannot be
 * undone. Archive deliberately does not: reversible actions should not ask.
 */
export default function ChatRowMenu({
  session,
  isLight,
  textColor,
  subtextColor,
  projects = [],
  onRename,
  onTogglePin,
  onMoveToProject,
  onToggleArchive,
  onDelete,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  /*
   * THE MENU LEAVES THE ROW (2026-09-07).
   *
   * Reported: "when I click on three dots, can you not immerse the list
   * inside the workspace and rather make it fully visible for selection".
   *
   * It was positioned `absolute` inside the row, so every scrolling ancestor
   * clipped it — and a desk's chat list gained `overflowY: auto` the same
   * day, which is what made a long-standing fragility visible. A menu you
   * have to scroll a container to read is a menu you cannot choose from.
   *
   * Fixed-positioned in a portal, it is outside every one of those
   * containers by construction, so no future `overflow` can clip it again.
   * It flips above the button when there is not room below, and is clamped
   * into the viewport so it can never open off-screen.
   */
  const [position, setPosition] = useState(null);
  const place = useCallback(() => {
    const anchor = buttonRef.current;
    if (!anchor || typeof window === 'undefined') return;
    const rect = anchor.getBoundingClientRect();
    const WIDTH = 176;
    const GUTTER = 8;
    const estimatedHeight = 250;
    const below = window.innerHeight - rect.bottom;
    const flipUp = below < estimatedHeight + GUTTER && rect.top > below;
    const left = Math.min(
      Math.max(GUTTER, rect.right - WIDTH),
      Math.max(GUTTER, window.innerWidth - WIDTH - GUTTER),
    );
    setPosition({
      left,
      width: WIDTH,
      ...(flipUp
        ? { bottom: Math.max(GUTTER, window.innerHeight - rect.top + 4), maxHeight: Math.max(160, rect.top - GUTTER - 4) }
        : { top: rect.bottom + 4, maxHeight: Math.max(160, below - GUTTER - 4) }),
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    place();
    // Anchored to a row that can scroll under it: follow, or close.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);
  const pinned = session?.pinned === true;
  const archived = session?.archived === true;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      // The menu is portalled, so it is NOT inside wrapRef any more; asking
      // only about the row would close it on its own items.
      if (wrapRef.current?.contains(event.target)) return;
      if (event.target?.closest?.('[data-quantora-chat-menu-open]')) return;
      setOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const moveTargets = projects.filter((project) => project.id !== (session?.projectId || null));

  const item = (key, icon, label, onClick, danger = false) => (
    <button
      key={key}
      type="button"
      data-quantora-chat-menu-item={key}
      onClick={(event) => { event.stopPropagation(); setOpen(false); onClick(event); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '7px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: '7px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: '0.78rem',
        fontWeight: 500,
        textAlign: 'left',
        color: danger ? '#dc2626' : textColor,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = isLight ? '#f1f1f1' : 'rgba(255,255,255,0.07)';
      }}
      onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex' }}>
      <button
        type="button"
        ref={buttonRef}
        data-quantora-chat-menu={session?.id}
        aria-label="Chat options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((was) => !was); }}
        style={{
          background: open ? (isLight ? '#e2e2e2' : 'rgba(255,255,255,0.12)') : 'transparent',
          border: 'none',
          color: subtextColor,
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <MoreVertical size={15} />
      </button>

      {open && position ? createPortal((
        <div
          role="menu"
          data-quantora-chat-menu-open={session?.id}
          style={{
            position: 'fixed',
            ...position,
            overflowY: 'auto',
            zIndex: 4000,
            padding: '5px',
            borderRadius: '11px',
            background: isLight ? '#ffffff' : '#1c1c1c',
            border: isLight ? '1px solid #e2e2e2' : '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
          }}
        >
          {item('rename', <Pencil size={14} />, 'Rename', () => onRename?.(session.id))}
          {item(
            'pin',
            pinned ? <PinOff size={14} /> : <Pin size={14} />,
            pinned ? 'Unpin' : 'Pin to top',
            () => onTogglePin?.(session.id),
          )}

          {moveTargets.length ? (
            <>
              <div style={{ height: '1px', background: isLight ? '#ececec' : 'rgba(255,255,255,0.09)', margin: '4px 2px' }} />
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 2px',
                color: subtextColor, fontSize: '0.64rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                <FolderInput size={12} /> Move to
              </div>
              {moveTargets.map((project) => item(
                `move-${project.id}`,
                <span style={{ width: 14 }} />,
                project.name,
                (event) => onMoveToProject?.(event, session.id, project.id),
              ))}
            </>
          ) : null}

          <div style={{ height: '1px', background: isLight ? '#ececec' : 'rgba(255,255,255,0.09)', margin: '4px 2px' }} />
          {item(
            'archive',
            archived ? <ArchiveRestore size={14} /> : <Archive size={14} />,
            archived ? 'Unarchive' : 'Archive',
            () => onToggleArchive?.(session.id, !archived),
          )}
          {item('delete', <Trash2 size={14} />, 'Delete', (event) => {
            if (typeof window !== 'undefined'
              && !window.confirm('Delete this chat? Its conversation and its desk cannot be recovered.')) return;
            onDelete?.(event, session.id);
          }, true)}
        </div>
      ), document.body) : null}
    </div>
  );
}
