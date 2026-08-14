import { useEffect } from 'react';
import { QuantoraObserver } from '../lib/intelligence/observer';

export function useQuantoraObserver(activeView: string, isIdle: boolean) {
  useEffect(() => {
    const interval = setInterval(() => {
      const insight = QuantoraObserver.observe({ activeView, isIdle });
      if (insight) { console.log("Observer Active"); }
    }, 30000);
    return () => clearInterval(interval);
  }, [activeView, isIdle]);
}
