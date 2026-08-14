import React from 'react';
import { IntelligenceLayout } from './IntelligenceLayout';
import type { Blueprint } from '../lib/intelligence/blueprint';

type QuantoraHubProps = {
  children: React.ReactNode;
};

function useInternalIntelligence(): { blueprint: Blueprint; isThinking: boolean } {
  return {
    blueprint: {
      intent: 'Providing stable wrapper layout',
      objective: 'Project Active',
      observations: [],
      imagination: [],
      roadmap: [],
      securityCheck: { isSafe: true, concerns: [] },
    },
    isThinking: false,
  };
}

export const QuantoraHub = ({ children }: QuantoraHubProps) => {
  const { blueprint, isThinking } = useInternalIntelligence();
  return (
    <IntelligenceLayout blueprint={blueprint} isThinking={isThinking}>
      {children}
    </IntelligenceLayout>
  );
};
export default QuantoraHub;
