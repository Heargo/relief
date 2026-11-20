import type { EdgeUsagesResponse } from '../../../core/models/contract';

/** A code line cut around the identifier that is the usage. */
export interface SnippetParts {
  before: string;
  mark: string;
  after: string;
}

export interface UsageRow {
  line: number;
  parts: SnippetParts;
  enclosing: string | null;
}

/** The usages of one imported symbol in one file. */
export interface UsageGroup {
  binding: string;
  rows: UsageRow[];
}

export interface UsageFile {
  file: string;
  groups: UsageGroup[];
}

/** Cuts `snippet` (indentation dropped) around the identifier that starts at `column`. */
export function snippetParts(snippet: string, column: number): SnippetParts {
  const chars = Array.from(snippet);
  const indent = chars.findIndex((c) => !/\s/.test(c));
  const start = indent < 0 ? 0 : indent;
  const rest = chars.slice(column).join('');
  const word = /^[\w$]+/.exec(rest)?.[0] ?? '';
  const length = Array.from(word).length;
  return {
    before: chars.slice(start, column).join(''),
    mark: word,
    after: chars.slice(column + length).join(''),
  };
}

/** Per file, the usages grouped by imported symbol (first seen first), in line order. */
export function groupUsages(response: EdgeUsagesResponse): UsageFile[] {
  return response.files.map((file) => {
    const groups = new Map<string, UsageRow[]>();
    for (const u of file.usages) {
      const rows = groups.get(u.binding) ?? [];
      rows.push({
        line: u.line,
        parts: snippetParts(u.snippet, u.column),
        enclosing: u.enclosing ?? null,
      });
      groups.set(u.binding, rows);
    }
    return {
      file: file.file,
      groups: Array.from(groups, ([binding, rows]) => ({ binding, rows })),
    };
  });
}

/** Usages found but not listed (the core caps the list). */
export function hiddenUsages(response: EdgeUsagesResponse): number {
  const shown = response.files.reduce((sum, f) => sum + f.usages.length, 0);
  return Math.max(0, response.total - shown);
}

/** Edge kinds whose usages live in the code of the source file. */
export function hasCodeUsages(kinds: readonly string[]): boolean {
  return kinds.some((k) => k !== 'http' && k !== 'co_change' && k !== 'depends_on');
}
