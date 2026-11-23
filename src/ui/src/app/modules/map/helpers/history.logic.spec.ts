import { describe, expect, it } from 'vitest';

import {
  canGoBack,
  canGoForward,
  clearHistory,
  currentStep,
  emptyHistory,
  goBack,
  goForward,
  pushStep,
} from './history.logic';

function pushed(...steps: string[]) {
  return steps.reduce((history, step) => pushStep(history, step), emptyHistory<string>());
}

describe('history', () => {
  it('starts empty: no current step, nothing to go back or forward to', () => {
    const history = emptyHistory<string>();
    expect(currentStep(history)).toBeNull();
    expect(canGoBack(history)).toBe(false);
    expect(canGoForward(history)).toBe(false);
  });

  it('pushing steps makes the last one current', () => {
    const history = pushed('A', 'B', 'C');
    expect(currentStep(history)).toBe('C');
    expect(canGoBack(history)).toBe(true);
    expect(canGoForward(history)).toBe(false);
  });

  it('goes back one step at a time, then forward again', () => {
    const history = pushed('A', 'B', 'C');
    const back = goBack(history);
    expect(currentStep(back)).toBe('B');
    expect(currentStep(goBack(back))).toBe('A');
    expect(canGoForward(back)).toBe(true);
    expect(currentStep(goForward(back))).toBe('C');
  });

  it('has nothing before the first step', () => {
    const first = goBack(goBack(pushed('A', 'B')));
    expect(currentStep(first)).toBe('A');
    expect(canGoBack(first)).toBe(false);
    expect(goBack(first)).toEqual(first);
  });

  it('has nothing after the last step', () => {
    const last = pushed('A', 'B');
    expect(goForward(last)).toEqual(last);
    expect(currentStep(goForward(last))).toBe('B');
  });

  it('a single step has neither a previous nor a next one', () => {
    const history = pushed('A');
    expect(canGoBack(history)).toBe(false);
    expect(canGoForward(history)).toBe(false);
  });

  it('drops the abandoned branch when a new step follows a return', () => {
    const history = pushStep(goBack(goBack(pushed('A', 'B', 'C'))), 'D');
    expect(currentStep(history)).toBe('D');
    expect(canGoForward(history)).toBe(false);
    expect(currentStep(goBack(history))).toBe('A');
    expect(currentStep(goBack(goBack(history)))).toBe('A');
    expect(canGoBack(goBack(history))).toBe(false);
  });

  it('does not mutate the history it is given', () => {
    const history = pushed('A', 'B');
    goBack(history);
    pushStep(history, 'C');
    expect(currentStep(history)).toBe('B');
  });

  it('is emptied by clearHistory', () => {
    const history = clearHistory(pushed('A', 'B'));
    expect(currentStep(history)).toBeNull();
    expect(canGoBack(history)).toBe(false);
    expect(canGoForward(history)).toBe(false);
  });
});
