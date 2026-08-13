import React, { useEffect, useRef } from 'react';
import { Wand2, X } from 'lucide-react';
import { STARTER_TEMPLATES } from '../lib/starter-templates.js';

/**
 * Shown when the magic wand is tapped with an empty prompt — guides instead of injecting random text.
 */
export default function StudioWandHint({
  isOpen,
  isLight,
  textColor,
  subtextColor,
  onClose,
  onPickTemplate,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onDocClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className={`studio-wand-hint${isLight ? ' is-light' : ''}`}
      role="dialog"
      aria-label="Prompt polish help"
    >
      <div className="studio-wand-hint__header">
        <Wand2 size={14} color="#f97316" />
        <span style={{ color: textColor, fontWeight: 700, fontSize: '0.8rem' }}>Polish your prompt</span>
        <button type="button" className="studio-wand-hint__close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <p className="studio-wand-hint__body" style={{ color: subtextColor }}>
        Type a rough idea first — even a few words — then tap ✨ to expand and sharpen it.
      </p>
      <div className="studio-wand-hint__label" style={{ color: subtextColor }}>Or start from a template</div>
      <div className="studio-wand-hint__templates">
        {STARTER_TEMPLATES.slice(0, 4).map((template) => (
          <button
            key={template.id}
            type="button"
            className="studio-wand-hint__template"
            onClick={() => onPickTemplate(template)}
          >
            <span aria-hidden="true">{template.emoji}</span>
            {template.label}
          </button>
        ))}
      </div>
    </div>
  );
}
