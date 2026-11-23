/** A linear history with a cursor: going back then pushing drops the abandoned branch. */
export interface History<T> {
  readonly steps: readonly T[];
  /** Index of the current step; -1 while empty. */
  readonly index: number;
}

export function emptyHistory<T>(): History<T> {
  return { steps: [], index: -1 };
}

export function pushStep<T>(history: History<T>, step: T): History<T> {
  const steps = [...history.steps.slice(0, history.index + 1), step];
  return { steps, index: steps.length - 1 };
}

export function currentStep<T>(history: History<T>): T | null {
  return history.index >= 0 ? history.steps[history.index] : null;
}

export function canGoBack<T>(history: History<T>): boolean {
  return history.index > 0;
}

export function canGoForward<T>(history: History<T>): boolean {
  return history.index < history.steps.length - 1;
}

export function goBack<T>(history: History<T>): History<T> {
  return canGoBack(history) ? { ...history, index: history.index - 1 } : history;
}

export function goForward<T>(history: History<T>): History<T> {
  return canGoForward(history) ? { ...history, index: history.index + 1 } : history;
}

export function clearHistory<T>(_history: History<T>): History<T> {
  return emptyHistory<T>();
}
