export type LayoutMode = 'fewer-crossings' | 'raw-grid';

export const DEFAULT_LAYOUT_MODE: LayoutMode = 'fewer-crossings';
export const LAYOUT_KEY = 'relief.layout';

interface ModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readLayoutMode(storage: ModeStorage): LayoutMode {
  try {
    const value = storage.getItem(LAYOUT_KEY);
    return value === 'raw-grid' || value === 'fewer-crossings' ? value : DEFAULT_LAYOUT_MODE;
  } catch {
    return DEFAULT_LAYOUT_MODE;
  }
}

export function writeLayoutMode(storage: ModeStorage, mode: LayoutMode): void {
  try {
    storage.setItem(LAYOUT_KEY, mode);
  } catch {
    // Storage unavailable: the preference is just not kept.
  }
}
