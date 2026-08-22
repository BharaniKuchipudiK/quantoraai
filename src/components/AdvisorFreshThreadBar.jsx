import React from 'react';
import { Plus } from 'lucide-react';
import { longAdvisorThreadCopy, newThreadLabel, shouldWarnLongAdvisorThread } from '../lib/advisor-thread.js';

/**
 * Travel/Study fresh start + an honest warning before the model starts
 * forgetting early turns. Does not delete the current thread.
 */
export default function AdvisorFreshThreadBar({
  domain,
  messages,
  dismissed,
  onDismiss,
  onFreshThread,
  isLight,
  textColor,
  subtextColor,
}) {
  if (domain !== 'travel' && domain !== 'education') return null;

  const label = newThreadLabel(domain);
  const warn = !dismissed && shouldWarnLongAdvisorThread({ messages, domain });
  const copy = warn ? longAdvisorThreadCopy(domain) : null;

  return (
    <div data-quantora-fresh-thread={domain} style={{ margin: '0 8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: warn ? '8px' : 0 }}>
        <button
          type="button"
          onClick={onFreshThread}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            border: isLight ? '1px solid #fdba74' : '1px solid rgba(249,115,22,0.45)',
            background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)',
            color: '#ea580c',
            borderRadius: '999px',
            padding: '6px 12px',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          {label}
        </button>
      </div>
      {copy ? (
        <div
          role="status"
          style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: isLight ? '#fffbeb' : 'rgba(120, 53, 15, 0.28)',
            border: isLight ? '1px solid #fde68a' : '1px solid rgba(251, 191, 36, 0.28)',
          }}
        >
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: textColor, lineHeight: 1.4 }}>{copy.now}</div>
          <div style={{ fontSize: '0.74rem', color: subtextColor, marginTop: '4px', lineHeight: 1.45 }}>{copy.next}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onFreshThread}
              style={{
                border: 'none',
                background: '#ea580c',
                color: '#fff',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copy.action}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              style={{
                border: 'none',
                background: 'transparent',
                color: subtextColor,
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '0.78rem',
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Keep going
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
