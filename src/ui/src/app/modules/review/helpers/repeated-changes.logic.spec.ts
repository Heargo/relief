import { describe, expect, it } from 'vitest';

import type { ReadingItem, RepeatedChange } from '../../../core/models/contract';
import {
  collapseRepeated,
  foldRepeatedEdges,
  groupProposal,
  repeatedNodes,
  repeatedSummary,
} from './repeated-changes.logic';

// R18. Public API of this ticket:
//  - `repeatedSummary(items, t)`: the summary of a group as text, parts joined by ", "; each part is
//    `t('review.repeated.items.<type>', { ...params })` with params `{ kind, target }` for the edge
//    items (`target` is the label of the node: path of a file, name of a symbol) and `{ name }` for
//    the symbol items;
//  - `repeatedNodes(repeated, selected)`: `{ counts, faded }`, `counts` maps each representative to the
//    size of its group (the "×N"), `faded` holds the other members; the selected member is neither;
//  - `foldRepeatedEdges(edges, repeated, selected)`: the changed edges of the faded members are folded
//    into the edge of the representative (same target), summing `count`;
//  - `collapseRepeated(items, repeated)`: the reading entries, one per group (the representative);
//  - `groupProposal(repeated, seen, id)`: the members still unseen when `id` is the representative
//    of a group and is seen; null otherwise.
const pkg = 'pkg:app/src/features';
const F1 = `${pkg}::file:src/features/f1.ts`;
const F2 = `${pkg}::file:src/features/f2.ts`;
const F3 = `${pkg}::file:src/features/f3.ts`;
const F4 = `${pkg}::file:src/features/f4.ts`;
const F5 = `${pkg}::file:src/features/f5.ts`;
const HELPERS = 'pkg:app/src/util::file:src/util/helpers.ts';
const OTHER = 'pkg:app/src/util::file:src/util/other.ts';

const GROUP: RepeatedChange = {
  representative: F1,
  members: [F1, F2, F3, F4],
  summary: [{ type: 'edge_added', kind: 'imports', target: HELPERS }],
};

describe('repeatedSummary', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}${JSON.stringify(params)}` : key;

  it('translates each item with the label of its target and joins them', () => {
    expect(
      repeatedSummary(
        [
          { type: 'edge_added', kind: 'imports', target: HELPERS },
          { type: 'symbol_added', name: 'helper' },
          { type: 'symbol_removed', name: 'legacy' },
          { type: 'edge_removed', kind: 'imports', target: OTHER },
        ],
        t,
      ),
    ).toBe(
      [
        'review.repeated.items.edge_added{"kind":"imports","target":"src/util/helpers.ts"}',
        'review.repeated.items.symbol_added{"name":"helper"}',
        'review.repeated.items.symbol_removed{"name":"legacy"}',
        'review.repeated.items.edge_removed{"kind":"imports","target":"src/util/other.ts"}',
      ].join(', '),
    );
  });
});

describe('repeatedNodes', () => {
  it('counts the group on its representative and fades the other members', () => {
    const { counts, faded } = repeatedNodes([GROUP], null);

    expect(counts.get(F1)).toBe(4);
    expect(counts.size).toBe(1);
    expect([...faded].sort()).toEqual([F2, F3, F4]);
  });

  it('unfolds the member that is selected', () => {
    const { counts, faded } = repeatedNodes([GROUP], F3);

    expect(counts.get(F1)).toBe(4);
    expect([...faded].sort()).toEqual([F2, F4]);
  });

  it('has nothing without groups', () => {
    const { counts, faded } = repeatedNodes(undefined, null);

    expect(counts.size).toBe(0);
    expect(faded.size).toBe(0);
  });
});

describe('foldRepeatedEdges', () => {
  const edge = (from: string, to: string, count = 1, changed = true) => ({
    from,
    to,
    count,
    changed,
  });

  it('folds the changed edges of the members into the edge of the representative', () => {
    const edges = [edge(F1, HELPERS), edge(F2, HELPERS), edge(F3, HELPERS), edge(F4, HELPERS)];

    expect(foldRepeatedEdges(edges, [GROUP], null)).toEqual([edge(F1, HELPERS, 4)]);
  });

  it('moves a member edge the representative does not have onto it', () => {
    const edges = [edge(F1, HELPERS), edge(F2, HELPERS), edge(F2, OTHER)];

    expect(foldRepeatedEdges(edges, [GROUP], null)).toEqual([
      edge(F1, HELPERS, 2),
      edge(F1, OTHER, 1),
    ]);
  });

  it('keeps the unchanged edges and the edges of other files as they are', () => {
    const edges = [edge(F2, OTHER, 3, false), edge(F5, HELPERS)];

    expect(foldRepeatedEdges(edges, [GROUP], null)).toEqual(edges);
  });

  it('keeps the edges of the selected member', () => {
    const edges = [edge(F1, HELPERS), edge(F2, HELPERS), edge(F3, HELPERS)];

    expect(foldRepeatedEdges(edges, [GROUP], F2)).toEqual([
      edge(F1, HELPERS, 2),
      edge(F2, HELPERS),
    ]);
  });

  it('returns the edges untouched without groups', () => {
    const edges = [edge(F2, HELPERS)];

    expect(foldRepeatedEdges(edges, undefined, null)).toEqual(edges);
  });
});

describe('collapseRepeated', () => {
  const item = (id: string): ReadingItem => ({
    id,
    reasons: [{ kind: 'lines', added: 1, removed: 0 }],
  });

  it('keeps one entry per group, the representative, at its place', () => {
    const items = [item(F1), item(F2), item(F5), item(F3), item(F4)];

    expect(collapseRepeated(items, [GROUP]).map((i) => i.id)).toEqual([F1, F5]);
  });

  it('keeps everything without groups', () => {
    const items = [item(F1), item(F2)];

    expect(collapseRepeated(items, undefined)).toEqual(items);
  });
});

describe('groupProposal', () => {
  it('lists the unseen members once the representative is seen', () => {
    expect(groupProposal([GROUP], [F1, F3], F1)).toEqual([F2, F4]);
  });

  it('proposes nothing while the representative is not seen', () => {
    expect(groupProposal([GROUP], [F3], F1)).toBeNull();
  });

  it('proposes nothing for a member, another file, or a group already seen', () => {
    expect(groupProposal([GROUP], [F1, F2], F2)).toBeNull();
    expect(groupProposal([GROUP], [F5], F5)).toBeNull();
    expect(groupProposal([GROUP], [F1, F2, F3, F4], F1)).toBeNull();
  });
});
