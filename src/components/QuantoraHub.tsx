// @ts-nocheck

import React, { useEffect } from 'react';
import { IntelligenceLayout } from './IntelligenceLayout';
import { useQuantoraIntelligence } from '../hooks/useQuantoraIntelligence';

export const QuantoraHub = ({ children }: { children: React.ReactNode }) => {
  const { blueprint, isThinking } = useQuantoraIntelligence();

  useEffect(() => {
    console.log("Quantora Intelligence Hub Active");
  }, []);

  return (
    <IntelligenceLayout blueprint={blueprint} isThinking={isThinking}>
      <div className="h-full w-full relative">
        {children}
      </div>
    </IntelligenceLayout>
  );
};

export default QuantoraHub;
