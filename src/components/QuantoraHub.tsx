import React from 'react';
import { IntelligenceLayout } from './IntelligenceLayout';
import { useQuantoraIntelligence } from '../hooks/useQuantoraIntelligence';
import { useQuantoraObserver } from '../hooks/useQuantoraObserver';
import '../styles/density.css';

/**
 * QuantoraHub: The "Cognitive Chassis"
 * This file wraps the entire Studio and provides the Intelligence Hub Sidebar
 * and the Proactive Observer without touching the Studio's internal logic.
 */
export const QuantoraHub = ({ children }) => {
  const { blueprint, isThinking } = useQuantoraIntelligence();
  
  // Activate the proactive "eyes" of Quantora
  useQuantoraObserver('Studio', false);

  return (
    <IntelligenceLayout blueprint={blueprint} isThinking={isThinking}>
      <div className="h-full w-full relative">
        {children}
      </div>
    </IntelligenceLayout>
  );
};

export default QuantoraHub;
