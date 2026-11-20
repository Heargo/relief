export type DiffLineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

function splitLines(text: string | null): string[] {
  if (!text) return [];
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
}

/** Unified line diff of two texts (longest common subsequence); a removed line comes before the line that replaces it. A missing side is an empty text. */
export function lineDiff(
  before: string | null,
  after: string | null,
  start: { oldStart?: number; newStart?: number } = {},
): DiffLine[] {
  const oldStart = start.oldStart ?? 1;
  const newStart = start.newStart ?? 1;
  const a = splitLines(before);
  const b = splitLines(after);
  const common: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] =
        a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: 'context', text: a[i], oldLine: oldStart + i, newLine: newStart + j });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || common[i + 1][j] >= common[i][j + 1])) {
      out.push({ kind: 'removed', text: a[i], oldLine: oldStart + i, newLine: null });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j], oldLine: null, newLine: newStart + j });
      j++;
    }
  }
  return out;
}
