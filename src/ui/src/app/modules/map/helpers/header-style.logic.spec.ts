import { describe, expect, it } from 'vitest';

import { headerStyle, openHeader } from './header.logic';

describe('openHeader font', () => {
  it('is half the height: 9 px for a module at 0.5', () => {
    expect(openHeader('module', 0.5).fontSize).toBe(9);
  });

  it('falls back to the system values for an unknown kind', () => {
    expect(openHeader('mystery', 1)).toEqual(openHeader('package', 1));
  });

  it('hides the label as soon as the font would be under 8 px (height 16)', () => {
    expect(openHeader('module', 16 / 36).labelVisible).toBe(true);
    expect(openHeader('module', 15 / 36).labelVisible).toBe(false);
  });
});

describe('headerStyle', () => {
  it('turns the header into inline values, starting on the border', () => {
    expect(headerStyle(openHeader('module', 0.5))).toEqual({
      height: '18px',
      fontSize: '9px',
      lineHeight: '1',
      marginTop: '-1px',
      subFontSize: '9px',
    });
  });

  it('caps the sub-elements at 11 px', () => {
    expect(headerStyle(openHeader('package', 1)).subFontSize).toBe('11px');
  });
});
