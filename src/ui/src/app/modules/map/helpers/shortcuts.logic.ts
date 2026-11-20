export type ShortcutAction =
  | { type: 'level'; level: number }
  | { type: 'search' }
  | { type: 'help' }
  | { type: 'escape' }
  | { type: 'impact' }
  | { type: 'focus' }
  | { type: 'range'; side: 'base' | 'head' }
  | { type: 'reading'; move: 'next' | 'previous' | 'seen' };

export interface Shortcut {
  /** `KeyboardEvent.key` values. */
  keys: string[];
  descriptionKey: string;
  action: (key: string) => ShortcutAction;
}

/** Single source for the keyboard and the help window. */
export const SHORTCUTS: Shortcut[] = [
  {
    keys: ['0', '1', '2', '3'],
    descriptionKey: 'map.shortcutsList.levels',
    action: (key) => ({ type: 'level', level: Number(key) }),
  },
  { keys: ['/'], descriptionKey: 'map.shortcutsList.search', action: () => ({ type: 'search' }) },
  { keys: ['i'], descriptionKey: 'map.shortcutsList.impact', action: () => ({ type: 'impact' }) },
  { keys: ['f'], descriptionKey: 'map.shortcutsList.focus', action: () => ({ type: 'focus' }) },
  {
    keys: ['n'],
    descriptionKey: 'map.shortcutsList.next',
    action: () => ({ type: 'reading', move: 'next' }),
  },
  {
    keys: ['p'],
    descriptionKey: 'map.shortcutsList.previous',
    action: () => ({ type: 'reading', move: 'previous' }),
  },
  {
    keys: ['v'],
    descriptionKey: 'map.shortcutsList.seen',
    action: () => ({ type: 'reading', move: 'seen' }),
  },
  {
    keys: ['b'],
    descriptionKey: 'map.shortcutsList.rangeBase',
    action: () => ({ type: 'range', side: 'base' }),
  },
  {
    keys: ['h'],
    descriptionKey: 'map.shortcutsList.rangeHead',
    action: () => ({ type: 'range', side: 'head' }),
  },
  { keys: ['?'], descriptionKey: 'map.shortcutsList.help', action: () => ({ type: 'help' }) },
  {
    keys: ['Escape'],
    descriptionKey: 'map.shortcutsList.escape',
    action: () => ({ type: 'escape' }),
  },
];

export function actionForKey(key: string): ShortcutAction | null {
  const shortcut = SHORTCUTS.find((s) => s.keys.includes(key));
  return shortcut ? shortcut.action(key) : null;
}

/** What a key is called on screen. */
export function keyLabel(key: string): string {
  return key === 'Escape' ? 'Esc' : key;
}

export type EscapeStep = 'close-help' | 'deselect' | 'level-up' | 'fit-all';

export function escapeStep(state: {
  helpOpen: boolean;
  selectedNodeId: string | null;
  selectedEdge?: boolean;
  level: number;
}): EscapeStep {
  if (state.helpOpen) return 'close-help';
  if (state.selectedNodeId !== null || state.selectedEdge) return 'deselect';
  return state.level > 0 ? 'level-up' : 'fit-all';
}

/** True when the focus is where keys are text, not shortcuts. */
export function isTypingTarget(
  target: { tagName: string; isContentEditable: boolean } | null,
): boolean {
  if (!target) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** `Alt` + arrow: the previous / next step of the navigation. */
export function historyMove(key: string): 'back' | 'forward' | null {
  if (key === 'ArrowLeft') return 'back';
  return key === 'ArrowRight' ? 'forward' : null;
}

/** Buttons 4 and 5 of a mouse (`MouseEvent.button` 3 and 4). */
export function mouseHistoryMove(button: number): 'back' | 'forward' | null {
  if (button === 3) return 'back';
  return button === 4 ? 'forward' : null;
}
