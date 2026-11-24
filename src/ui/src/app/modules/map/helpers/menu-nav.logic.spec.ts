import { describe, expect, it } from 'vitest';

import { menuForAccessKey, nextItemIndex, nextMenuIndex } from './menu-nav.logic';

describe('nextItemIndex', () => {
  const none = [false, false, false];

  it('ArrowDown from no active item lands on the first item', () => {
    expect(nextItemIndex(none, -1, 'ArrowDown')).toBe(0);
  });

  it('ArrowDown moves to the next item and wraps after the last', () => {
    expect(nextItemIndex(none, 0, 'ArrowDown')).toBe(1);
    expect(nextItemIndex(none, 2, 'ArrowDown')).toBe(0);
  });

  it('ArrowUp moves to the previous item and wraps before the first', () => {
    expect(nextItemIndex(none, 2, 'ArrowUp')).toBe(1);
    expect(nextItemIndex(none, 0, 'ArrowUp')).toBe(2);
  });

  it('ArrowUp from no active item lands on the last item', () => {
    expect(nextItemIndex(none, -1, 'ArrowUp')).toBe(2);
  });

  it('skips disabled items', () => {
    const disabled = [false, true, true, false];
    expect(nextItemIndex(disabled, 0, 'ArrowDown')).toBe(3);
    expect(nextItemIndex(disabled, 3, 'ArrowUp')).toBe(0);
    expect(nextItemIndex(disabled, 3, 'ArrowDown')).toBe(0);
  });

  it('Home and End go to the first and last enabled items', () => {
    const disabled = [true, false, false, true];
    expect(nextItemIndex(disabled, 2, 'Home')).toBe(1);
    expect(nextItemIndex(disabled, 1, 'End')).toBe(2);
  });

  it('returns -1 when every item is disabled', () => {
    expect(nextItemIndex([true, true], -1, 'ArrowDown')).toBe(-1);
    expect(nextItemIndex([], -1, 'ArrowDown')).toBe(-1);
  });

  it('stays on the only enabled item', () => {
    expect(nextItemIndex([true, false], 1, 'ArrowDown')).toBe(1);
    expect(nextItemIndex([true, false], 1, 'ArrowUp')).toBe(1);
  });

  it('leaves the index alone for any other key', () => {
    expect(nextItemIndex(none, 1, 'a')).toBe(1);
  });
});

describe('nextMenuIndex', () => {
  it('ArrowRight moves to the next menu and wraps', () => {
    expect(nextMenuIndex(3, 0, 'ArrowRight')).toBe(1);
    expect(nextMenuIndex(3, 2, 'ArrowRight')).toBe(0);
  });

  it('ArrowLeft moves to the previous menu and wraps', () => {
    expect(nextMenuIndex(3, 2, 'ArrowLeft')).toBe(1);
    expect(nextMenuIndex(3, 0, 'ArrowLeft')).toBe(2);
  });

  it('leaves the index alone for any other key', () => {
    expect(nextMenuIndex(3, 1, 'ArrowDown')).toBe(1);
  });
});

describe('menuForAccessKey', () => {
  const keys = { workspace: 'W', layers: 'L', settings: 'S', help: 'H' } as const;

  it('finds the menu of an access letter, whatever its case', () => {
    expect(menuForAccessKey('w', keys)).toBe('workspace');
    expect(menuForAccessKey('l', keys)).toBe('layers');
    expect(menuForAccessKey('S', keys)).toBe('settings');
    expect(menuForAccessKey('h', keys)).toBe('help');
  });

  it('returns null for a letter no menu uses', () => {
    expect(menuForAccessKey('x', keys)).toBeNull();
    expect(menuForAccessKey('ArrowDown', keys)).toBeNull();
  });
});
