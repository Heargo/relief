/**
 * Ref whose snapshot is the head of a range, as the core resolves it: the working tree without a
 * range or for a single revision, the index or the working tree for those names, else the right
 * side of `A...B` / `A..B`.
 */
export function headRef(range: string | null | undefined): string {
  if (!range) return 'WORKTREE';
  const parts = range.split(/\.{2,3}/);
  if (parts.length < 2) return range === 'INDEX' ? 'INDEX' : 'WORKTREE';
  // `A..` and `A...` (a side missing): the core refuses the range, its diff fails; nothing to show.
  return parts[parts.length - 1] || 'WORKTREE';
}

/** The range read for a comparison: `destination...source`, or the destination alone for the working tree. */
export function settingsRange(settings: { source: string; destination: string }): string {
  return settings.source === 'WORKTREE'
    ? settings.destination
    : `${settings.destination}...${settings.source}`;
}
