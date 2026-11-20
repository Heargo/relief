import { describe, expect, it } from 'vitest';

import type { AggregatedEdge } from './edges.logic';
import { nodeEdges } from './node-edges.logic';

function edge(from: string, to: string, count = 1): AggregatedEdge {
  return { from, to, count, kinds: ['calls'], links: [], changed: false };
}

const WEB_DB = edge('web', 'db', 5);
const API_DB = edge('api', 'db');
const WEB_API = edge('web', 'api');
const DB_CORE = edge('db', 'core');
const EDGES = [WEB_DB, API_DB, WEB_API, DB_CORE];

describe('nodeEdges', () => {
  it('splits the edges of a node into what it depends on and what uses it', () => {
    expect(nodeEdges(EDGES, 'db')).toEqual({ dependsOn: [DB_CORE], usedBy: [WEB_DB, API_DB] });
  });

  it('keeps only the outgoing edges for a node nobody uses', () => {
    expect(nodeEdges(EDGES, 'web')).toEqual({ dependsOn: [WEB_DB, WEB_API], usedBy: [] });
  });

  it('keeps only the incoming edges for a node that depends on nothing', () => {
    expect(nodeEdges(EDGES, 'core')).toEqual({ dependsOn: [], usedBy: [DB_CORE] });
  });

  it('is empty for a node with no edge at the displayed level', () => {
    expect(nodeEdges(EDGES, 'elsewhere')).toEqual({ dependsOn: [], usedBy: [] });
    expect(nodeEdges([], 'db')).toEqual({ dependsOn: [], usedBy: [] });
  });
});
