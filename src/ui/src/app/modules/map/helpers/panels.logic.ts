export interface PanelWidths {
  left: number;
  right: number;
}

export interface WidthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_PANEL_WIDTHS: PanelWidths = { left: 300, right: 430 };

const MIN_LEFT = 180;
const MIN_RIGHT = 260;
const MIN_MAP = 280;
const MAX_LEFT_RATIO = 0.4;
const MAX_RIGHT_DRAG_RATIO = 0.7;
const WIDE_RATIO = 0.55;
const IS_WIDE_RATIO = 0.45;
const LEFT_KEY = 'relief.lw';
const RIGHT_KEY = 'relief.rw';

function boundLeft(left: number, windowWidth: number): number {
  return Math.round(Math.max(MIN_LEFT, Math.min(left, windowWidth * MAX_LEFT_RATIO)));
}

/** Bounds the preferred widths to what the window can show. */
export function clampPanelWidths(widths: PanelWidths, windowWidth: number): PanelWidths {
  const left = boundLeft(widths.left, windowWidth);
  const right = Math.round(
    Math.max(MIN_RIGHT, Math.min(widths.right, windowWidth - left - MIN_MAP)),
  );
  return { left, right };
}

/** Panel width for a pointer position while dragging a handle. */
export function widthFromDrag(
  side: 'left' | 'right',
  pointerX: number,
  windowWidth: number,
): number {
  if (side === 'left') return boundLeft(pointerX, windowWidth);
  return Math.round(
    Math.max(MIN_RIGHT, Math.min(windowWidth - pointerX, windowWidth * MAX_RIGHT_DRAG_RATIO)),
  );
}

export function isRightPanelWide(right: number, windowWidth: number): boolean {
  return right >= windowWidth * IS_WIDE_RATIO;
}

export function toggleRightPanelWide(widths: PanelWidths, windowWidth: number): PanelWidths {
  const right = isRightPanelWide(widths.right, windowWidth)
    ? DEFAULT_PANEL_WIDTHS.right
    : Math.round(windowWidth * WIDE_RATIO);
  return { ...widths, right };
}

function readWidth(storage: WidthStorage, key: string, fallback: number): number {
  try {
    const value = Number(storage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function readPanelWidths(storage: WidthStorage): PanelWidths {
  return {
    left: readWidth(storage, LEFT_KEY, DEFAULT_PANEL_WIDTHS.left),
    right: readWidth(storage, RIGHT_KEY, DEFAULT_PANEL_WIDTHS.right),
  };
}

export function writePanelWidths(storage: WidthStorage, widths: PanelWidths): void {
  try {
    storage.setItem(LEFT_KEY, String(widths.left));
    storage.setItem(RIGHT_KEY, String(widths.right));
  } catch {
    // Storage unavailable: the preference is just not kept.
  }
}
