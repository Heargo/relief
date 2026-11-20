/** Changed symbols of each changed file (file id to symbol ids). */
export type ChangedSymbols = Record<string, string[]>;

export interface Progress {
  seen: number;
  total: number;
}

const SYM_MARK = '::sym:';

/** The file id of a symbol id; a file id is its own file. */
export function fileOf(id: string): string {
  const at = id.indexOf(SYM_MARK);
  return at >= 0 ? id.slice(0, at) : id;
}

function isSymbol(id: string): boolean {
  return id.includes(SYM_MARK);
}

/** A file is seen when all its changed symbols are (on its own id when it has none). */
export function isSeen(seen: readonly string[], id: string, changed: ChangedSymbols): boolean {
  if (isSymbol(id)) return seen.includes(id);
  const symbols = changed[id] ?? [];
  return symbols.length === 0 ? seen.includes(id) : symbols.every((s) => seen.includes(s));
}

/** Marks an entry seen, or unmarks it; a file carries its changed symbols along. */
export function toggleSeen(seen: readonly string[], id: string, changed: ChangedSymbols): string[] {
  const targets = isSymbol(id) || !(changed[id]?.length ?? 0) ? [id] : (changed[id] ?? []);
  if (isSeen(seen, id, changed)) return seen.filter((s) => !targets.includes(s));
  return [...seen, ...targets.filter((t) => !seen.includes(t))];
}

export function progress(
  ids: readonly string[],
  seen: readonly string[],
  changed: ChangedSymbols,
): Progress {
  return { seen: ids.filter((id) => isSeen(seen, id, changed)).length, total: ids.length };
}

/** The entry after (`1`) or before (`-1`) `current`; the first or last one with none; stops at the ends. */
export function step(
  ids: readonly string[],
  current: string | null,
  direction: 1 | -1,
): string | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at < 0) return direction > 0 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, at + direction))];
}

/** The first unseen entry after `current` (from the start when `current` is not in the list). */
export function nextUnseen(
  ids: readonly string[],
  current: string | null,
  seen: readonly string[],
  changed: ChangedSymbols,
): string | null {
  const from = current === null ? 0 : ids.indexOf(current) + 1;
  return ids.slice(from).find((id) => !isSeen(seen, id, changed)) ?? null;
}

/** Seen and total entries of the list under a container id (the entry itself included). */
export function containerProgress(
  container: string,
  ids: readonly string[],
  seen: readonly string[],
  changed: ChangedSymbols,
): Progress {
  return progress(
    ids.filter((id) => id === container || id.startsWith(`${container}::`)),
    seen,
    changed,
  );
}

interface Entry {
  id: string;
  reasons: readonly { kind: string; added?: number; removed?: number }[];
}

function changedLines(entry: Entry): number {
  return entry.reasons.reduce((sum, r) => sum + (r.added ?? 0) + (r.removed ?? 0), 0);
}

/**
 * The changed symbols of each changed file. A file that also changed outside its symbols (lines
 * beyond the ones the symbols account for, an import for instance) lists its own id too: reading
 * its symbols is not reading the file.
 */
export function changedSymbols(files: readonly Entry[], symbols: readonly Entry[]): ChangedSymbols {
  const out: ChangedSymbols = {};
  const symbolLines: Record<string, number> = {};
  for (const file of files) out[file.id] = [];
  for (const symbol of symbols) {
    const file = fileOf(symbol.id);
    (out[file] ??= []).push(symbol.id);
    symbolLines[file] = (symbolLines[file] ?? 0) + changedLines(symbol);
  }
  for (const file of files) {
    if (out[file.id].length > 0 && changedLines(file) > (symbolLines[file.id] ?? 0)) {
      out[file.id].push(file.id);
    }
  }
  return out;
}
