import type { ReviewSummary } from '../../../core/models/contract';

const FILE_MARK = '::file:';
const SYM_MARK = '::sym:';

/** `repo:<name>/<rest>` of a workspace cut into the repository and the rest; null elsewhere. */
function splitRepo(text: string): { repo: string; rest: string } | null {
  const match = /^repo:([^/]+)\/(.*)$/s.exec(text);
  return match ? { repo: match[1], rest: match[2] } : null;
}

/** A file path of a workspace diff (`repo:api/src/a.ts`) as read: `api · src/a.ts`. */
export function displayPath(path: string): string {
  const split = splitRepo(path);
  return split ? `${split.repo} · ${split.rest}` : path;
}

/**
 * What the user reads for a node id: the symbol name, else the file path; in a workspace, the
 * repository first (`api · src/orders.ts`).
 */
export function nodeLabel(id: string): string {
  const split = splitRepo(id);
  if (split) return `${split.repo} · ${nodeLabel(split.rest)}`;
  const sym = id.indexOf(SYM_MARK);
  if (sym >= 0) return id.slice(sym + SYM_MARK.length);
  const file = id.indexOf(FILE_MARK);
  return file >= 0 ? id.slice(file + FILE_MARK.length) : id;
}

/** The signals of the left bar: breaking signatures, introduced violations, couplings, ignored files. */
export function signalCount(summary: ReviewSummary): number {
  return (
    summary.signatures.filter((s) => s.breaking).length +
    summary.violations.filter((v) => v.introduced).length +
    summary.couplingsAdded.length +
    summary.couplingsRemoved.length +
    summary.formatOnlyFiles.length
  );
}
