import { describe, expect, it } from 'vitest';

import {
  clampPanelWidths,
  DEFAULT_PANEL_WIDTHS,
  isRightPanelWide,
  readPanelWidths,
  toggleRightPanelWide,
  widthFromDrag,
  writePanelWidths,
} from './panels.logic';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const throwingStorage = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

describe('DEFAULT_PANEL_WIDTHS', () => {
  it('is 300 px on the left and 430 px on the right', () => {
    expect(DEFAULT_PANEL_WIDTHS).toEqual({ left: 300, right: 430 });
  });
});

describe('clampPanelWidths', () => {
  it('keeps widths that fit in a 1280 px window', () => {
    expect(clampPanelWidths({ left: 300, right: 430 }, 1280)).toEqual({ left: 300, right: 430 });
  });

  it('raises widths below the minimums (180 left, 260 right)', () => {
    expect(clampPanelWidths({ left: 100, right: 100 }, 1280)).toEqual({ left: 180, right: 260 });
  });

  it('caps the left panel at 40 % of the window and leaves 280 px for the map on the right', () => {
    expect(clampPanelWidths({ left: 500, right: 700 }, 1280)).toEqual({ left: 500, right: 500 });
  });

  it('shrinks both panels in a 1024 px window, rounding to whole pixels', () => {
    expect(clampPanelWidths({ left: 500, right: 700 }, 1024)).toEqual({ left: 410, right: 334 });
  });

  it('keeps the preferred defaults in a 1024 px window', () => {
    expect(clampPanelWidths(DEFAULT_PANEL_WIDTHS, 1024)).toEqual({ left: 300, right: 430 });
  });

  it('never goes below the minimums, even in a 600 px window', () => {
    expect(clampPanelWidths(DEFAULT_PANEL_WIDTHS, 600)).toEqual({ left: 240, right: 260 });
  });
});

describe('widthFromDrag', () => {
  it('uses the pointer position as the left width', () => {
    expect(widthFromDrag('left', 350, 1280)).toBe(350);
  });

  it('bounds the left width between 180 and 40 % of the window', () => {
    expect(widthFromDrag('left', 100, 1280)).toBe(180);
    expect(widthFromDrag('left', 700, 1280)).toBe(512);
  });

  it('uses the distance from the pointer to the right edge as the right width', () => {
    expect(widthFromDrag('right', 780, 1280)).toBe(500);
  });

  it('bounds the right width between 260 and 70 % of the window', () => {
    expect(widthFromDrag('right', 1250, 1280)).toBe(260);
    expect(widthFromDrag('right', 380, 1280)).toBe(896);
  });
});

describe('right panel wide toggle', () => {
  it('is wide from 45 % of the window', () => {
    expect(isRightPanelWide(575, 1280)).toBe(false);
    expect(isRightPanelWide(576, 1280)).toBe(true);
  });

  it('widens to 55 % of the window, then goes back to 430 px', () => {
    const wide = toggleRightPanelWide({ left: 300, right: 430 }, 1280);
    expect(wide).toEqual({ left: 300, right: 704 });
    expect(toggleRightPanelWide(wide, 1280)).toEqual({ left: 300, right: 430 });
  });
});

describe('readPanelWidths', () => {
  it('reads the saved widths', () => {
    const storage = memoryStorage({ 'relief.lw': '240', 'relief.rw': '520' });
    expect(readPanelWidths(storage)).toEqual({ left: 240, right: 520 });
  });

  it('falls back to the defaults when nothing is saved', () => {
    expect(readPanelWidths(memoryStorage())).toEqual({ left: 300, right: 430 });
  });

  it('falls back per side when only one width is saved', () => {
    expect(readPanelWidths(memoryStorage({ 'relief.rw': '520' }))).toEqual({
      left: 300,
      right: 520,
    });
  });

  it('ignores corrupted values', () => {
    const storage = memoryStorage({ 'relief.lw': 'abc', 'relief.rw': '-5' });
    expect(readPanelWidths(storage)).toEqual({ left: 300, right: 430 });
  });

  it('falls back to the defaults when localStorage throws', () => {
    expect(readPanelWidths(throwingStorage)).toEqual({ left: 300, right: 430 });
  });
});

describe('writePanelWidths', () => {
  it('saves both widths as strings', () => {
    const storage = memoryStorage();
    writePanelWidths(storage, { left: 240, right: 520 });
    expect(Object.fromEntries(storage.data)).toEqual({ 'relief.lw': '240', 'relief.rw': '520' });
  });

  it('does not throw when localStorage throws', () => {
    expect(() => writePanelWidths(throwingStorage, { left: 240, right: 520 })).not.toThrow();
  });

  it('round-trips with readPanelWidths', () => {
    const storage = memoryStorage();
    writePanelWidths(storage, { left: 222, right: 555 });
    expect(readPanelWidths(storage)).toEqual({ left: 222, right: 555 });
  });
});
