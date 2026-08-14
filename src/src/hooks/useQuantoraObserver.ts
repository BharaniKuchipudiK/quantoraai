import { useEffect } from 'react';
import { QuantoraObserver } from '../lib/intelligence/observer';

export function useQuantoraObserver(activeView: string, isIdle: boolean) {
  useEffect(() => {
    // Quantora "watches" the state every 30 seconds
    const interval = setInterval(() => {
      const insight = QuantoraObserver.observe({ activeView, isIdle });
      if (insight) {
        console.log("Quantora Observation Active");
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [activeView, isIdle]);
}
