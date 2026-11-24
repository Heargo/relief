import type { DiffResponse, EdgeChange, ReadingItem } from '../../../core/models/contract';
import { type ChangedSymbols, fileOf, isSeen, type Progress } from './reading-order.logic';

/** One commit of the range with the files to read in it (as the core lists them). */
export interface CommitEntry {
  commit: string;
  short: string;
  message: string;
  files: readonly ReadingItem[];
  otherFiles: number;
  /** The repository of the commit, in a workspace. */
  repo?: string | null;
}

/** What the map colours when one commit is selected. */
export interface CommitScope {
  commit: string;
  files: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

type EdgeLike = Pick<EdgeChange, 'from' | 'to' | 'kind' | 'status'>;

const edgeKey = (edge: EdgeLike): string => `${edge.from}>${edge.to}>${edge.kind}>${edge.status}`;

/** The files of the commit and the edges whose first commit it is. */
export function commitScope(entry: CommitEntry, edges: readonly EdgeChange[]): CommitScope {
  return {
    commit: entry.commit,
    files: new Set(entry.files.map((f) => f.id)),
    edges: new Set(edges.filter((e) => e.commit === entry.commit).map(edgeKey)),
  };
}

/** A file of the commit, its symbols, and the containers above its files. */
export function isNodeInScope(scope: CommitScope, id: string): boolean {
  if (scope.files.has(fileOf(id))) return true;
  for (const file of scope.files) if (file.startsWith(`${id}::`)) return true;
  return false;
}

export function isEdgeInScope(scope: CommitScope, edge: EdgeLike): boolean {
  return scope.edges.has(edgeKey(edge));
}

/** The diff reduced to what the commit changed: what the map colours. */
export function scopeDiff(response: DiffResponse, scope: CommitScope): DiffResponse {
  return {
    ...response,
    diff: {
      ...response.diff,
      nodes: response.diff.nodes.filter((n) => isNodeInScope(scope, n.id)),
      edges: response.diff.edges.filter((e) => isEdgeInScope(scope, e)),
    },
  };
}

/** Seen files of the commit over its files, on the seen state of the whole range. */
export function commitProgress(
  entry: CommitEntry,
  seen: readonly string[],
  changed: ChangedSymbols,
): Progress {
  return {
    seen: entry.files.filter((f) => isSeen(seen, f.id, changed)).length,
    total: entry.files.length,
  };
}

/** The commits that list the file, oldest first. */
export function commitsOfFile(commits: readonly CommitEntry[], file: string): string[] {
  return commits.filter((c) => c.files.some((f) => f.id === file)).map((c) => c.commit);
}

/** `parent..commit`, the parent being the previous commit (the base for the first); null if unknown. */
export function commitDiffRange(
  commits: readonly CommitEntry[],
  commit: string,
  base: string,
): string | null {
  const at = commits.findIndex((c) => c.commit === commit);
  if (at < 0) return null;
  return `${at === 0 ? base : commits[at - 1].commit}..${commit}`;
}

/** The commit after (`1`) or before (`-1`) `current`; the first or last one with none; stops at the ends. */
export function stepCommit(
  commits: readonly CommitEntry[],
  current: string | null,
  direction: 1 | -1,
): string | null {
  if (commits.length === 0) return null;
  const at = current === null ? -1 : commits.findIndex((c) => c.commit === current);
  if (at < 0) return (direction > 0 ? commits[0] : commits[commits.length - 1]).commit;
  return commits[Math.min(commits.length - 1, Math.max(0, at + direction))].commit;
}
