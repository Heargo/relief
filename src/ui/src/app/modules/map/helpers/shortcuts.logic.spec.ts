import { describe, expect, it } from 'vitest';

import { actionForKey, escapeStep, isTypingTarget, SHORTCUTS } from './shortcuts.logic';

describe('actionForKey', () => {
  it('maps 0 to 3 to the level actions', () => {
    expect(actionForKey('0')).toEqual({ type: 'level', level: 0 });
    expect(actionForKey('3')).toEqual({ type: 'level', level: 3 });
  });

  it('maps / to the search, ? to the help and Escape to the escape cascade', () => {
    expect(actionForKey('/')).toEqual({ type: 'search' });
    expect(actionForKey('?')).toEqual({ type: 'help' });
    expect(actionForKey('Escape')).toEqual({ type: 'escape' });
  });

  it('ignores keys that are not shortcuts', () => {
    expect(actionForKey('a')).toBeNull();
    expect(actionForKey('4')).toBeNull();
    expect(actionForKey('Enter')).toBeNull();
  });
});

describe('SHORTCUTS', () => {
  it('lists every key the keyboard reacts to, so the help shows them all', () => {
    const listed = SHORTCUTS.flatMap((s) => s.keys);
    for (const key of ['0', '1', '2', '3', '/', '?', 'Escape']) {
      expect(listed).toContain(key);
      expect(actionForKey(key)).not.toBeNull();
    }
  });

  it('gives every entry a translation key for its description', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.descriptionKey).toMatch(/^map\./);
      expect(shortcut.keys.length).toBeGreaterThan(0);
    }
  });
});

describe('escapeStep', () => {
  it('closes the help first', () => {
    expect(escapeStep({ helpOpen: true, selectedNodeId: 'n', level: 3 })).toBe('close-help');
  });

  it('then deselects the node', () => {
    expect(escapeStep({ helpOpen: false, selectedNodeId: 'n', level: 3 })).toBe('deselect');
  });

  it('deselects a selected edge before going up a level', () => {
    expect(
      escapeStep({ helpOpen: false, selectedNodeId: null, selectedEdge: true, level: 2 }),
    ).toBe('deselect');
    expect(escapeStep({ helpOpen: true, selectedNodeId: null, selectedEdge: true, level: 2 })).toBe(
      'close-help',
    );
  });

  it('then goes up one level', () => {
    expect(escapeStep({ helpOpen: false, selectedNodeId: null, level: 3 })).toBe('level-up');
    expect(escapeStep({ helpOpen: false, selectedNodeId: null, level: 1 })).toBe('level-up');
  });

  it('then shows everything', () => {
    expect(escapeStep({ helpOpen: false, selectedNodeId: null, level: 0 })).toBe('fit-all');
  });
});

describe('isTypingTarget', () => {
  it('is true for text fields and editable content', () => {
    expect(isTypingTarget({ tagName: 'INPUT', isContentEditable: false })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA', isContentEditable: false })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT', isContentEditable: false })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isTypingTarget({ tagName: 'BODY', isContentEditable: false })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('focus shortcut', () => {
  it('f toggles the PR focus layer', () => {
    expect(actionForKey('f')).toEqual({ type: 'focus' });
  });
});
