import React from 'react';
import { Plane, BookOpen, DollarSign, Search, MessageSquare, Layout, Workflow, Compass } from 'lucide-react';
import { STUDIO_DOMAINS, STUDIO_OUTPUT_MODES } from '../lib/studio-domains.js';

const DOMAIN_ICONS = {
  travel: Plane,
  education: BookOpen,
  finance: DollarSign,
  research: Search,
};

const OUTPUT_MODE_ICONS = {
  ask: MessageSquare,
  build: Layout,
  plan: Workflow,
};

function StudioGlossRow({ icon: Icon, iconColor, title, description, selected, onClick, badge }) {
  return (
    <button type="button" className={`studio-gloss-row${selected ? ' is-selected' : ''}`} onClick={onClick}>
      <span className="studio-gloss-row__icon" style={{ color: iconColor }}>
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="studio-gloss-row__copy">
        <span className="studio-gloss-row__title">
          {title}
          {badge ? <span className="studio-gloss-row__badge">{badge}</span> : null}
        </span>
        {description ? <span className="studio-gloss-row__desc">{description}</span> : null}
      </span>
      <span className={`studio-gloss-row__radio${selected ? ' is-selected' : ''}`} aria-hidden="true" />
    </button>
  );
}

export default function StudioToolsMenu({
  isLight,
  studioDomain,
  studioMode,
  onSelectDomain,
  onSelectMode,
}) {
  return (
    <div className={`studio-gloss-popover${isLight ? ' is-light' : ' is-dark'}`} role="menu" aria-label="Focus and response settings">
      <div className="studio-gloss-popover__section">
        <div className="studio-gloss-popover__heading">Focus</div>
        <StudioGlossRow
          icon={Compass}
          iconColor="#64748b"
          title="General"
          description="No specific domain bias"
          selected={!studioDomain}
          onClick={() => onSelectDomain(null)}
        />
        {STUDIO_DOMAINS.map(({ id, label, description }) => (
          <StudioGlossRow
            key={id}
            icon={DOMAIN_ICONS[id]}
            iconColor={studioDomain === id ? '#f97316' : '#64748b'}
            title={label}
            description={description}
            selected={studioDomain === id}
            onClick={() => onSelectDomain(id)}
          />
        ))}
      </div>
      <div className="studio-gloss-popover__divider" />
      <div className="studio-gloss-popover__section">
        <div className="studio-gloss-popover__heading">Response</div>
        {STUDIO_OUTPUT_MODES.map(({ id, label, description }) => (
          <StudioGlossRow
            key={id}
            icon={OUTPUT_MODE_ICONS[id]}
            iconColor={studioMode === id ? '#f97316' : '#64748b'}
            title={label}
            description={description}
            selected={studioMode === id}
            onClick={() => onSelectMode(id)}
          />
        ))}
      </div>
    </div>
  );
}
