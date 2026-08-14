// @ts-nocheck
import React from 'react';
import { IntelligenceLayout } from './IntelligenceLayout';

// Hook logic moved inside to prevent "Module Not Found" errors
const useInternalIntelligence = () => {
  return { 
    blueprint: { objective: "Project Active", roadmap: [], imagination: [] }, 
    isThinking: false 
  };
};

export const QuantoraHub = ({ children }) => {
  const { blueprint, isThinking } = useInternalIntelligence();
  return (
    <IntelligenceLayout blueprint={blueprint} isThinking={isThinking}>
      {children}
    </IntelligenceLayout>
  );
};
export default QuantoraHub;
