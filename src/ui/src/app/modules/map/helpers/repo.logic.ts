/** Ref whose snapshot is shown: the head side of the range, else the first branch. */
export function displayRef(range: string | null | undefined, branches: string[]): string {
  if (range) {
    const parts = range.split(/\.{2,3}/);
    const head = parts[parts.length - 1];
    if (head) return head;
  }
  return branches[0] ?? 'HEAD';
}
