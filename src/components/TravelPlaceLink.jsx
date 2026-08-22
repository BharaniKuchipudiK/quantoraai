import React from 'react';
import { Play } from 'lucide-react';

/**
 * Travel property link: clickable name plus a play control that opens
 * the workspace canvas on that URL. Not a YouTube widget. Not Studio HTML.
 */
export default function TravelPlaceLink({ href, children, onPlay, style, ...props }) {
  if (!href) return <span {...props}>{children}</span>;

  return (
    <span data-quantora-travel-place-link="true" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={style}
        {...props}
      >
        {children}
      </a>
      {typeof onPlay === 'function' ? (
        <button
          type="button"
          data-quantora-travel-place-play="true"
          title="Preview this property"
          onClick={(event) => {
            event.preventDefault();
            onPlay({ href, name: textFromChildren(children) });
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '22px',
            height: '22px',
            borderRadius: '999px',
            border: '1px solid rgba(56,189,248,0.45)',
            background: 'rgba(14,165,233,0.16)',
            color: '#7dd3fc',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Play size={11} fill="currentColor" />
        </button>
      ) : null}
    </span>
  );
}

function textFromChildren(children) {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(textFromChildren).join('');
  if (children?.props?.children) return textFromChildren(children.props.children);
  return 'Property';
}
