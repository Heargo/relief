import { describe, expect, it } from 'vitest';

import type { DiffResponse } from '../../../core/models/contract';
import { diffMarks, formatOnlyFiles, nodeStatus, oldLocations } from './diff-layer.logic';
import { formatOnlyHiddenLines, hasStructuralChange } from './diff-panel.logic';

// K08: in a workspace, the file paths of the diff carry their repository (`repo:<name>/<path>`),
// so `src/index.ts` of two repositories are two files.

const WEB_INDEX = 'repo:web/pkg:web::file:src/index.ts';
const API_INDEX = 'repo:api/pkg:api::file:src/index.ts';

const RESPONSE: DiffResponse = {
  diff: {
    base: 'a',
    head: 'b',
    files: [
      { path: 'repo:web/src/index.ts', linesAdded: 3, linesRemoved: 0 },
      { path: 'repo:api/src/index.ts', linesAdded: 7, linesRemoved: 2 },
    ],
    nodes: [{ id: WEB_INDEX, status: 'modified', body: true, linesAdded: 3, linesRemoved: 0 }],
    edges: [],
  },
  formatOnly: { files: 1, linesAdded: 7, linesRemoved: 2 },
  renames: [{ from: 'repo:api/src/old.ts', to: 'repo:api/src/moved.ts' }],
  baseResolved: 'abc',
} as unknown as DiffResponse;

describe('the diff of a workspace', () => {
  it('tells the format-only file of one repository from the changed file of the other', () => {
    expect(formatOnlyFiles(RESPONSE)).toEqual(['repo:api/src/index.ts']);
    expect(formatOnlyHiddenLines(API_INDEX, RESPONSE)).toBe(9);
    expect(hasStructuralChange(API_INDEX, RESPONSE)).toBe(true);
    expect(hasStructuralChange(WEB_INDEX, RESPONSE)).toBe(true);
  });

  it('sizes each file with its own lines', () => {
    const graph = {
      commit: 'c',
      edges: [],
      nodes: [WEB_INDEX, API_INDEX].map((id) => ({
        id,
        kind: 'file',
        subkind: 'file',
        parent: null,
        visibility: 'public',
        contentHash: 'h',
      })),
    } as unknown as Parameters<typeof diffMarks>[0];
    const marks = diffMarks(graph, RESPONSE);
    expect(marks.get(WEB_INDEX)?.status).toBe('modified');
    expect(nodeStatus(API_INDEX, RESPONSE)).toBe('unchanged');
    expect(oldLocations(RESPONSE).size).toBe(0);
  });
});
