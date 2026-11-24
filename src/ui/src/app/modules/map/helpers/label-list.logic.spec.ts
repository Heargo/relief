import { describe, expect, it } from 'vitest';

import { pruneLabels, toggled } from './label-list.logic';

describe('toggled', () => {
  it('adds an absent item at the end', () => {
    expect(toggled(['front'], 'ops')).toEqual(['front', 'ops']);
  });

  it('removes a present item', () => {
    expect(toggled(['front', 'ops'], 'front')).toEqual(['ops']);
  });

  it('does not change its input', () => {
    const list = ['front'];
    toggled(list, 'ops');
    expect(list).toEqual(['front']);
  });
});

describe('pruneLabels', () => {
  it('drops the labels that no longer exist', () => {
    expect(pruneLabels(['qa', 'back'], ['front', 'back'])).toEqual(['back']);
  });

  it('keeps everything when all still exist', () => {
    expect(pruneLabels(['front'], ['front', 'back'])).toEqual(['front']);
  });
});
