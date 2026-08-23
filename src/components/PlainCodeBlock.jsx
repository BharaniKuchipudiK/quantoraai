/**
 * Chat never shows fenced code — getChatDisplayText strips every block so the
 * work lands in Preview instead. This is the safety net for anything that
 * somehow slips through: readable monospace, no highlighting engine attached.
 *
 * A full Prism used to sit here and cost 214 KB gzipped, about half the desk's
 * download, to colour code that could not reach the page.
 */
export default function PlainCodeBlock({ children, customStyle, language, PreTag, node, ...props }) {
  return (
    <pre
      data-quantora-code-plain="true"
      style={{
        background: '#1e1e1e',
        color: '#d4d4d4',
        overflowX: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.85rem',
        padding: '12px',
        ...customStyle,
      }}
      {...props}
    >
      {children}
    </pre>
  );
}
