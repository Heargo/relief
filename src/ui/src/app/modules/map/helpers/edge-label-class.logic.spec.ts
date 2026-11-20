import { describe, expect, it } from 'vitest';

import { edgeLabelClass } from './edges.logic';

const base = {
  count: 3,
  added: 0,
  removed: 0,
  moved: 0,
  violations: { introduced: 0, existing: 0 },
  review: true,
};

describe('edgeLabelClass', () => {
  it('is base for a plain edge', () => {
    expect(edgeLabelClass(base)).toBe('base');
    expect(edgeLabelClass({ ...base, added: 1 })).toBe('base');
  });

  it('is mov when every link moved', () => {
    expect(edgeLabelClass({ ...base, count: 2, moved: 2 })).toBe('mov');
    expect(edgeLabelClass({ ...base, count: 2, moved: 1 })).toBe('base');
  });

  it('is viol for an introduced violation and violOld for an existing one', () => {
    expect(edgeLabelClass({ ...base, violations: { introduced: 1, existing: 0 } })).toBe('viol');
    expect(edgeLabelClass({ ...base, violations: { introduced: 0, existing: 1 } })).toBe('violOld');
  });

  it('is add when every live link is added, only in review', () => {
    expect(edgeLabelClass({ ...base, added: 3 })).toBe('add');
    expect(edgeLabelClass({ ...base, added: 3, review: false })).toBe('base');
  });

  it('is del when no live link remains, only in review', () => {
    expect(edgeLabelClass({ ...base, count: 2, removed: 2 })).toBe('del');
    expect(edgeLabelClass({ ...base, count: 2, removed: 2, review: false })).toBe('base');
  });

  it('is hl when highlighted, above everything', () => {
    expect(edgeLabelClass({ ...base, highlighted: true })).toBe('hl');
    expect(
      edgeLabelClass({
        ...base,
        moved: 3,
        violations: { introduced: 1, existing: 0 },
        highlighted: true,
      }),
    ).toBe('hl');
  });

  it('puts moved before violations, violations before add and del', () => {
    const viol = { introduced: 1, existing: 0 };
    expect(edgeLabelClass({ ...base, moved: 3, violations: viol })).toBe('mov');
    expect(edgeLabelClass({ ...base, added: 3, violations: viol })).toBe('viol');
    expect(edgeLabelClass({ ...base, added: 3, violations: { introduced: 0, existing: 1 } })).toBe(
      'violOld',
    );
    expect(edgeLabelClass({ ...base, count: 2, removed: 2, violations: viol })).toBe('viol');
  });
});
