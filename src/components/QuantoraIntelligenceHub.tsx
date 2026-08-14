import React from 'react';
import { IntelligenceLayout } from './IntelligenceLayout';
import { useQuantoraIntelligence } from '../hooks/useQuantoraIntelligence';
import { useQuantoraObserver } from '../hooks/useQuantoraObserver';

interface Props {
  children: React.ReactNode;
}

/**
 * The Intelligence Hub acts as the "Cognitive Chassis" for Quantora.
 * It wraps the Studio and provides the Sidebar, Memory, and Proactive Observations
 * without interfering with the Studio's internal logic.
 */
export const QuantoraIntelligenceHub: React.FC<Props> = ({ children }) => {
  const { blueprint, isThinking } = useQuantoraIntelligence();
  
  // The Observer watches for 'Idle' states to suggest proactive actions
  useQuantoraObserver('Studio', false);

  return (
    <IntelligenceLayout blueprint={blueprint} isThinking={isThinking}>
      <div className="h-full w-full relative">
        {children}
      </div>
    </IntelligenceLayout>
  );
};
