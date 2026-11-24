export type MenuId = 'workspace' | 'settings' | 'help';

export const MENU_IDS: readonly MenuId[] = ['workspace', 'settings', 'help'];

function wrap(index: number, size: number): number {
  return ((index % size) + size) % size;
}

/**
 * The entry the focus goes to after `key`, among entries whose `disabled` flag is given (`-1`: none
 * is active). Disabled entries are skipped, the move wraps; any other key leaves `current` alone.
 */
export function nextItemIndex(disabled: readonly boolean[], current: number, key: string): number {
  const size = disabled.length;
  const first = disabled.findIndex((d) => !d);
  if (key === 'Home' || key === 'End') {
    return key === 'Home' ? first : disabled.lastIndexOf(false);
  }
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return current;
  if (size === 0 || first < 0) return -1;
  const step = key === 'ArrowDown' ? 1 : -1;
  const start = current < 0 && step < 0 ? size : current;
  for (let i = 1; i <= size; i++) {
    const candidate = wrap(start + step * i, size);
    if (!disabled[candidate]) return candidate;
  }
  return -1;
}

/** The menu the focus goes to after `ArrowLeft` / `ArrowRight`, wrapping. */
export function nextMenuIndex(count: number, current: number, key: string): number {
  if (key === 'ArrowRight') return wrap(current + 1, count);
  if (key === 'ArrowLeft') return wrap(current - 1, count);
  return current;
}

/** The menu whose access letter (the `Alt` + letter shortcut) is `key`, whatever its case. */
export function menuForAccessKey(
  key: string,
  keys: Readonly<Record<MenuId, string>>,
): MenuId | null {
  const wanted = key.toUpperCase();
  return MENU_IDS.find((id) => keys[id].toUpperCase() === wanted) ?? null;
}
