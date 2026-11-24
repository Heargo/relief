/** The list with `item` removed when it is in, added at the end when it is not. */
export function toggled(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

/** The chosen labels that still exist; the order of `selected` is kept. */
export function pruneLabels(selected: string[], available: string[]): string[] {
  return selected.filter((label) => available.includes(label));
}
