import { describe, expect, it } from 'vitest';

import { headerLayout } from './header.logic';

describe('headerLayout', () => {
  it('is a header with the mockup sizes at scale 1', () => {
    expect(headerLayout('package', 1)).toEqual({ height: 38, fontSize: 15, label: 'header' });
    expect(headerLayout('module', 1)).toEqual({ height: 30, fontSize: 13, label: 'header' });
    expect(headerLayout('file', 1)).toEqual({ height: 26, fontSize: 12, label: 'header' });
  });

  it('moves the title to a tab for a module at scale 0.25 (height 9 px, font 4.5 px)', () => {
    expect(headerLayout('module', 0.25)).toEqual({ height: 9, fontSize: 4.5, label: 'tab' });
  });

  it('keeps the reserved height when the title is a tab', () => {
    expect(headerLayout('package', 0.2).height).toBe(10);
    expect(headerLayout('file', 0.3).height).toBe(9);
  });

  it('keeps a header while the font reaches 11 px, and a tab under it', () => {
    // module: font = 36 * scale / 2
    expect(headerLayout('module', 0.62).label).toBe('header'); // 11.16 px
    expect(headerLayout('module', 0.6).label).toBe('tab'); // 10.8 px
    // file: font = 30 * scale / 2
    expect(headerLayout('file', 0.74).label).toBe('header'); // 11.1 px
    expect(headerLayout('file', 0.7).label).toBe('tab'); // 10.5 px
  });

  it('is a tab between the old 8 px limit and the new 11 px one', () => {
    expect(headerLayout('module', 0.5).label).toBe('tab'); // 9 px, a header under U10
  });
});
