interface StateStore {
  [state: string]: { createdAt: number; accountId?: string };
}

const stateStore: StateStore = {};
const STATE_EXPIRY_MS = 10 * 60 * 1000;

export function storeState(state: string): void {
  stateStore[state] = {
    createdAt: Date.now(),
  };
}

export function validateState(state: string): boolean {
  const stored = stateStore[state];

  if (!stored) {
    return false;
  }

  const isExpired = Date.now() - stored.createdAt > STATE_EXPIRY_MS;

  return !isExpired;
}

export function removeState(state: string): void {
  delete stateStore[state];
}

export function completeState(state: string, accountId: string): void {
  if (stateStore[state]) {
    stateStore[state].accountId = accountId;
  }
}

export function getStateAccountId(state: string): string | undefined {
  return stateStore[state]?.accountId;
}

export function isStateComplete(state: string): boolean {
  return !!stateStore[state]?.accountId;
}

export function cleanupExpiredStates(): void {
  const now = Date.now();
  Object.entries(stateStore).forEach(([state, data]) => {
    if (now - data.createdAt > STATE_EXPIRY_MS) {
      delete stateStore[state];
    }
  });
}

setInterval(cleanupExpiredStates, 5 * 60 * 1000);
