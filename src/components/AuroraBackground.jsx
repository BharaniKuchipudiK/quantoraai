import React from 'react';

/*
 * The ambient background.
 *
 * Replaces BeeSwarmCanvas, which drew ~170 particles to a full-screen canvas
 * on every animation frame and tracked the mouse to push them around. Two
 * problems with that: visually it scattered high-contrast dots across the
 * reading area — including behind the greeting and the composer — and
 * technically it never stopped, holding a requestAnimationFrame loop and a
 * repaint of the whole viewport for as long as the tab was open.
 *
 * This is three large, heavily blurred colour fields that drift slowly past
 * each other. Everything animates on transform only, so the compositor handles
 * it on the GPU with no layout, no paint, and no JavaScript running per frame.
 *
 * Colours are pulled toward the edges and kept at low opacity so the centre of
 * the screen — where the text lives — stays calm.
 */

export default function AuroraBackground({ theme = 'light' }) {
  const isLight = theme !== 'dark';

  return (
    <div className={`aurora-bg ${isLight ? 'is-light' : 'is-dark'}`} aria-hidden="true">
      <div className="aurora-blob aurora-1" />
      <div className="aurora-blob aurora-2" />
      <div className="aurora-blob aurora-3" />
      <div className="aurora-grain" />
    </div>
  );
}
