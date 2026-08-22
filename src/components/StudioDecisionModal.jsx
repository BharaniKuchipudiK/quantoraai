import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X, ArrowRight } from 'lucide-react';

export default function StudioDecisionModal({
  modalData,
  isLight,
  onSubmit,
  onSkip
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [otherText, setOtherText] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  if (!modalData) return null;

  const { question, options = [] } = modalData;

  const bgColor = isLight ? '#ffffff' : '#1e1e1e';
  const borderColor = isLight ? '#e5e7eb' : '#333333';
  const textColor = isLight ? '#111827' : '#f3f4f6';
  const subtextColor = isLight ? '#6b7280' : '#9ca3af';
  const hoverBg = isLight ? '#f9fafb' : '#2a2a2a';
  const selectedBg = isLight ? '#f3f4f6' : '#2d2d2d';

  // A direct single-action modal is used for approval checkpoints such as the
  // Office briefing handoff. One click means "accept the brief and continue";
  // there is deliberately no select-then-submit ceremony or free-text field.
  const directOption = modalData.direct === true && options.length === 1 ? options[0] : null;
  if (directOption) {
    return (
      <div style={{
        width: '100%',
        maxWidth: '700px',
        margin: '16px 0',
        padding: '14px 16px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          {question && (
            <div style={{ fontWeight: '600', color: textColor, fontSize: '0.92rem', marginBottom: directOption.description ? '3px' : 0 }}>
              {question}
            </div>
          )}
          {directOption.description && (
            <div style={{ color: subtextColor, fontSize: '0.8rem' }}>
              {directOption.description}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSubmit(directOption.value || directOption.title)}
          style={{
            background: '#f97316',
            color: '#ffffff',
            border: 'none',
            padding: '9px 16px',
            borderRadius: '9px',
            fontSize: '0.86rem',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            whiteSpace: 'nowrap'
          }}
        >
          {directOption.title || 'Continue'} <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  const submitAnswer = (answer) => {
    const value = String(answer || '').trim();
    if (!value) return;
    onSubmit(value);
  };

  const handleOptionClick = (option) => {
    submitAnswer(option.value || option.title);
  };

  const handleSubmit = () => {
    if (selectedId === 'other') {
      submitAnswer(otherText);
    } else if (selectedId) {
      const selectedOption = options.find(o => o.id === selectedId);
      if (selectedOption) {
        submitAnswer(selectedOption.value || selectedOption.title);
      }
    }
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '700px',
      margin: '16px 0',
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '12px',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px',
          borderBottom: isExpanded ? `1px solid ${borderColor}` : 'none',
          cursor: 'pointer'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ fontWeight: '600', color: textColor, fontSize: '0.95rem', lineHeight: '1.4' }}>
          {question}
        </div>
        <div style={{ display: 'flex', gap: '8px', color: subtextColor }}>
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          {onSkip && (
            <button 
              onClick={(e) => { e.stopPropagation(); onSkip(); }}
              style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: 0 }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {options.map((option, index) => {
            const isSelected = selectedId === option.id;
            return (
              <div
                key={option.id}
                onClick={() => handleOptionClick(option)}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = hoverBg; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: isSelected ? selectedBg : 'transparent',
                  border: isSelected ? `1px solid ${isLight ? '#d1d5db' : '#4b5563'}` : '1px solid transparent',
                  transition: 'background 0.15s ease'
                }}
              >
                <div>
                  <div style={{ color: textColor, fontWeight: '500', fontSize: '0.9rem', marginBottom: '2px' }}>
                    {option.title}
                  </div>
                  {option.description && (
                    <div style={{ color: subtextColor, fontSize: '0.8rem' }}>
                      {option.description}
                    </div>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '24px',
                  height: '24px',
                  background: isLight ? '#f3f4f6' : '#374151',
                  color: isLight ? '#6b7280' : '#9ca3af',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}>
                  {index + 1}
                </div>
              </div>
            );
          })}

          {/* Other / Custom Input */}
          <div
            onClick={() => handleOptionClick('other')}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'text',
              background: selectedId === 'other' ? selectedBg : 'transparent',
              border: selectedId === 'other' ? `1px solid ${isLight ? '#d1d5db' : '#4b5563'}` : '1px solid transparent',
            }}
          >
            <div style={{ color: textColor, fontWeight: '500', fontSize: '0.9rem', marginBottom: '8px' }}>
              Other
            </div>
            <input
              type="text"
              placeholder="Type your own answer here"
              value={otherText}
              onChange={(e) => {
                setOtherText(e.target.value);
                if (selectedId !== 'other') setSelectedId('other');
              }}
              onFocus={() => setSelectedId('other')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              style={{
                width: '100%',
                background: isLight ? '#ffffff' : '#1e1e1e',
                border: `1px solid ${borderColor}`,
                borderRadius: '6px',
                padding: '8px 12px',
                color: textColor,
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Footer Controls */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 8px 4px 8px',
            marginTop: '4px',
            borderTop: `1px solid ${borderColor}`
          }}>
            {onSkip && (
              <button
                onClick={onSkip}
                style={{
                  padding: '6px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: subtextColor,
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Skip
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!selectedId || (selectedId === 'other' && !otherText.trim())}
              style={{
                padding: '6px 16px',
                background: (selectedId && (selectedId !== 'other' || otherText.trim())) 
                  ? (isLight ? '#e5e7eb' : '#4b5563') 
                  : (isLight ? '#f3f4f6' : '#374151'),
                color: (selectedId && (selectedId !== 'other' || otherText.trim()))
                  ? (isLight ? '#111827' : '#f9fafb')
                  : (isLight ? '#9ca3af' : '#6b7280'),
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: (selectedId && (selectedId !== 'other' || otherText.trim())) ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease'
              }}
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
