import { describe, expect, it } from 'vitest';

import { closedLabelVisible, openHeader } from './header.logic';

describe('openHeader', () => {
  it('keeps the mockup sizes at scale 1 (system 38 px / 15 px, module 30 / 13, file 26 / 12)', () => {
    expect(openHeader('package', 1)).toEqual({ height: 38, fontSize: 15, labelVisible: true });
    expect(openHeader('module', 1)).toEqual({ height: 30, fontSize: 13, labelVisible: true });
    expect(openHeader('file', 1)).toEqual({ height: 26, fontSize: 12, labelVisible: true });
  });

  it('keeps the mockup sizes above scale 1 (capped)', () => {
    expect(openHeader('module', 3).height).toBe(30);
    expect(openHeader('package', 3).height).toBe(38);
  });

  it('shrinks to the reserved space: a module at 0.5 is 18 px high, font 13 px at most', () => {
    const h = openHeader('module', 0.5);
    expect(h.height).toBe(18);
    expect(h.fontSize).toBeLessThanOrEqual(13);
    expect(h.fontSize).toBeGreaterThan(0);
    expect(h.labelVisible).toBe(true);
  });

  it('is the reserved world header times the scale: system 50, module 36, file 30', () => {
    expect(openHeader('package', 0.4).height).toBe(20);
    expect(openHeader('file', 0.5).height).toBe(15);
  });

  it('hides the label under a readable height: a module at 0.2 (7.2 px)', () => {
    expect(openHeader('module', 0.2).labelVisible).toBe(false);
  });

  it('never draws a header taller than the room the layout reserved', () => {
    for (const scale of [0.1, 0.25, 0.5, 0.7, 0.8, 1, 2]) {
      expect(openHeader('module', scale).height).toBeLessThanOrEqual(36 * scale + 1e-9);
      expect(openHeader('file', scale).height).toBeLessThanOrEqual(30 * scale + 1e-9);
      expect(openHeader('package', scale).height).toBeLessThanOrEqual(50 * scale + 1e-9);
    }
  });
});

describe('closedLabelVisible', () => {
  it('shows the label of a closed box that is big enough', () => {
    expect(closedLabelVisible(120, 40)).toBe(true);
  });

  it('hides the label of a closed box 10 px high', () => {
    expect(closedLabelVisible(120, 10)).toBe(false);
  });

  it('hides the label of a closed box narrower than 28 px', () => {
    expect(closedLabelVisible(20, 40)).toBe(false);
  });

  it('shows it at the thresholds (14 px high, 28 px wide)', () => {
    expect(closedLabelVisible(28, 14)).toBe(true);
  });
});
