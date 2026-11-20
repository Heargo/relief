import { describe, expect, it } from 'vitest';

import type { Edge, GraphDiff, Violation } from '../../../core/models/contract';
import { type AggregatedEdge, edgeShape } from './edges.logic';
import { edgeState, edgeSyncKey } from './edge-state.logic';

const A = 'pkg:a';
const B = 'pkg:b';
const link = (n: number): Edge => ({
  from: `${A}::file:f::sym:s${n}`,
  to: `${B}::file:g::sym:t${n}`,
  kind: 'calls',
  precision: 'resolved',
});
function aggregated(links: Edge[]): AggregatedEdge {
  return { from: A, to: B, count: links.length, kinds: ['calls'], links, changed: false };
}

const words = { new: 'new', moved: 'moved' };
const label = (id: string): string => id.replace('pkg:', '');
const unit = (count: number): string => (count === 1 ? '1 link' : `${count} links`);
const context = { words, label, unit };

function diffOf(...changes: Array<[Edge, 'added' | 'removed' | 'moved']>): GraphDiff {
  return {
    base: 'a',
    head: 'b',
    files: [],
    nodes: [],
    edges: changes.map(([e, status]) => ({ ...e, status, commit: null })),
  } as unknown as GraphDiff;
}

describe('edgeState', () => {
  it('is plain without diff nor rules: base class, the count as label', () => {
    const state = edgeState(aggregated([link(1), link(2), link(3)]), {
      ...context,
      diff: undefined,
      violations: [],
    });
    expect(state).toMatchObject({
      status: 'unchanged',
      violations: { introduced: 0, existing: 0 },
      added: 0,
      removed: 0,
      moved: 0,
      review: false,
      cls: 'base',
      label: '3',
      tooltip: 'a → b · 3 links (calls)',
    });
  });

  it('reads an edge whose only link is added as new', () => {
    const edge = aggregated([link(1)]);
    const state = edgeState(edge, { ...context, diff: diffOf([link(1), 'added']), violations: [] });
    expect(state).toMatchObject({
      status: 'added',
      added: 1,
      review: true,
      cls: 'add',
      label: 'new',
    });
  });

  it('counts added and removed links of a mixed edge in the label', () => {
    const edge = aggregated([link(1), link(2), link(3), link(4)]);
    const diff = diffOf([link(1), 'added'], [link(2), 'removed']);
    const state = edgeState(edge, { ...context, diff, violations: [] });
    expect(state).toMatchObject({ added: 1, removed: 1, moved: 0, cls: 'base' });
    expect(state.label).toBe('3 +1 −1');
  });

  it('counts the violating links, the introduced ones first for the class', () => {
    const edge = aggregated([link(1), link(2)]);
    const violations = [
      { edge: link(1), introduced: false, rule: 'r' },
      { edge: link(2), introduced: true, rule: 'r' },
    ] as Violation[];
    const state = edgeState(edge, { ...context, diff: undefined, violations });
    expect(state.violations).toEqual({ introduced: 1, existing: 1 });
    expect(state.cls).toBe('viol');
    expect(state.label).toBe('⚠ 2');
  });

  it('calls an edge whose links all moved moved', () => {
    const edge = aggregated([link(1)]);
    const state = edgeState(edge, { ...context, diff: diffOf([link(1), 'moved']), violations: [] });
    expect(state).toMatchObject({ moved: 1, cls: 'mov', label: 'moved' });
  });

  it('does not depend on a camera: the same inputs give an equal state', () => {
    const edge = aggregated([link(1), link(2)]);
    const input = { ...context, diff: undefined, violations: [] };
    expect(edgeState(edge, input)).toEqual(edgeState(edge, input));
  });
});

describe('edgeSyncKey', () => {
  const a = { x: 0, y: 0, w: 100, h: 60 };
  const b = { x: 500, y: 0, w: 100, h: 60 };
  const state = edgeState(aggregated([link(1)]), { ...context, diff: undefined, violations: [] });

  it('is equal for the same shape, state and selection', () => {
    expect(edgeSyncKey(edgeShape(a, b, [], 1), state, false, 1)).toBe(
      edgeSyncKey(edgeShape(a, b, [], 1), state, false, 1),
    );
  });

  it('changes with the shape', () => {
    const moved = { ...b, y: 40 };
    expect(edgeSyncKey(edgeShape(a, moved, [], 1), state, false, 1)).not.toBe(
      edgeSyncKey(edgeShape(a, b, [], 1), state, false, 1),
    );
  });

  it('changes with the selection and with the state', () => {
    const shape = edgeShape(a, b, [], 1);
    const base = edgeSyncKey(shape, state, false, 1);
    expect(edgeSyncKey(shape, state, true, 1)).not.toBe(base);
    expect(edgeSyncKey(shape, { ...state, label: 'x' }, false, 1)).not.toBe(base);
  });
});
