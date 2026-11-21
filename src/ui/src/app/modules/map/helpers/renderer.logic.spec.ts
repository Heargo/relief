import { describe, expect, it } from 'vitest';

import { chooseRenderer } from './renderer.logic';

const storage = (value: string | null) => ({ getItem: () => value });
const broken = {
  getItem: () => {
    throw new Error('denied');
  },
};

describe('chooseRenderer', () => {
  it('is dom by default', () => {
    expect(chooseRenderer('', storage(null))).toBe('dom');
  });

  it('follows the relief.renderer preference', () => {
    expect(chooseRenderer('', storage('canvas'))).toBe('canvas');
    expect(chooseRenderer('', storage('dom'))).toBe('dom');
  });

  it('reads the preference under the relief.renderer key', () => {
    const keys: string[] = [];
    chooseRenderer('', { getItem: (k: string) => (keys.push(k), null) });
    expect(keys).toEqual(['relief.renderer']);
  });

  it('lets ?renderer= win over the preference', () => {
    expect(chooseRenderer('?renderer=canvas', storage('dom'))).toBe('canvas');
    expect(chooseRenderer('?renderer=dom', storage('canvas'))).toBe('dom');
  });

  it('falls back to dom on an unknown value', () => {
    expect(chooseRenderer('?renderer=webgl', storage('nope'))).toBe('dom');
  });

  it('survives a storage that throws', () => {
    expect(chooseRenderer('', broken)).toBe('dom');
    expect(chooseRenderer('?renderer=canvas', broken)).toBe('canvas');
  });
});
