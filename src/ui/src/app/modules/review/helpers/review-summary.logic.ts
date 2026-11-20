import type { ReviewSummary } from '../../../core/models/contract';

const FILE_MARK = '::file:';
const SYM_MARK = '::sym:';

/** What the user reads for a node id: the symbol name, else the file path. */
export function nodeLabel(id: string): string {
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
