import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Link2, RotateCcw } from 'lucide-react';
import { deriveStudyReinforcement } from '../lib/study-reinforcement.js';

const ICONS = {
  transfer: Link2,
  return: RotateCcw,
  repair: CheckCircle2,
};

export default function StudyReinforcement({ result }) {
  const reinforcement = useMemo(() => deriveStudyReinforcement(result), [result]);
  const [visible, setVisible] = useState(Boolean(reinforcement));

  useEffect(() => {
    if (!reinforcement) {
      setVisible(false);
      return undefined;
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, [reinforcement]);

  if (!reinforcement || !visible) return null;
  const Icon = ICONS[reinforcement.kind] || CheckCircle2;

  return (
    <div
      className={`study-h1-reinforcement study-h1-reinforcement--${reinforcement.kind}`}
      role="status"
      aria-live="polite"
      data-quantora-study-reinforcement={reinforcement.kind}
    >
      <span className="study-h1-reinforcement__mark" aria-hidden="true"><Icon size={17} /></span>
      <span className="study-h1-reinforcement__copy">
        <strong>{reinforcement.title}</strong>
        <span>{reinforcement.detail}</span>
      </span>
    </div>
  );
}
