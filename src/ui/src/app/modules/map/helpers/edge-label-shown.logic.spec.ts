import { describe, expect, it } from 'vitest';

import { edgeLabelShown } from './edges.logic';

// U29: no individual edge label at rest; one for the hovered edge, for the edges of the selected
// node, for the selected edge; all of them with the "always" switch.
const EDGE = { from: 'a', to: 'b' };
const REST = { hovered: null, selectedNode: null, selectedEdge: null, always: false };

describe('edgeLabelShown', () => {
  it('shows nothing at rest', () => {
    expect(edgeLabelShown(EDGE, REST)).toBe(false);
  });

  it('shows the label of the hovered edge only', () => {
    expect(edgeLabelShown(EDGE, { ...REST, hovered: { from: 'a', to: 'b' } })).toBe(true);
    expect(edgeLabelShown(EDGE, { ...REST, hovered: { from: 'b', to: 'a' } })).toBe(false);
    expect(edgeLabelShown(EDGE, { ...REST, hovered: { from: 'a', to: 'c' } })).toBe(false);
  });

  it('shows the labels of the edges leaving or entering the selected node', () => {
    expect(edgeLabelShown(EDGE, { ...REST, selectedNode: 'a' })).toBe(true);
    expect(edgeLabelShown(EDGE, { ...REST, selectedNode: 'b' })).toBe(true);
    expect(edgeLabelShown(EDGE, { ...REST, selectedNode: 'c' })).toBe(false);
  });

  it('shows the label of the selected edge only', () => {
    expect(edgeLabelShown(EDGE, { ...REST, selectedEdge: { from: 'a', to: 'b' } })).toBe(true);
    expect(edgeLabelShown(EDGE, { ...REST, selectedEdge: { from: 'a', to: 'c' } })).toBe(false);
  });

  it('keeps the label of an edge with a rule violation at rest', () => {
    expect(edgeLabelShown({ ...EDGE, violation: true }, REST)).toBe(true);
    expect(edgeLabelShown({ ...EDGE, violation: false }, REST)).toBe(false);
  });

  it('shows every label with the "always" switch', () => {
    expect(edgeLabelShown(EDGE, { ...REST, always: true })).toBe(true);
    expect(edgeLabelShown({ from: 'x', to: 'y' }, { ...REST, always: true })).toBe(true);
  });
});
