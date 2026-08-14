import { QuantoraMemory } from './memory';

export class QuantoraObserver {
  private static lastStateHash: string = '';
  static observe(currentContext: any) {
    const currentState = JSON.stringify(currentContext);
    if (currentState === this.lastStateHash) return null;
    this.lastStateHash = currentState;
    QuantoraMemory.record('OBSERVATION', `User focusing on: ${currentContext.activeView}`, 2);
    return null;
  }
}
