import type { NodeKind } from '../../../core/models/contract';
import type { NodeInfo } from './node-info.logic';
import type { NodeMode } from './visibility.logic';

/** What to write inside a box. Pure: the component only turns it into DOM. */
export interface NodeContent {
  /** Icon class of a symbol (type icon), else null. */
  icon: string | null;
  label: string;
  /** Secondary text (subkind of a system or an external). */
  sub: string | null;
  /** Counters, translated by the component (`map.counts.<unit>`). */
  counts: { unit: 'symbols' | 'files'; value: number }[];
}

export type SizeClass = 'small' | 'medium' | 'large';

export function sizeClass(width: number): SizeClass {
  if (width < 90) return 'small';
  return width > 260 ? 'large' : 'medium';
}

const SYMBOL_ICONS: Record<string, string> = {
  component: 'pi-objects-column',
  function: 'pi-code',
  hook: 'pi-link',
  class: 'pi-box',
  method: 'pi-wrench',
  type: 'pi-tag',
  const: 'pi-lock',
  route: 'pi-directions',
  table: 'pi-table',
  job: 'pi-clock',
};

export function symbolIcon(subkind: string): string {
  return SYMBOL_ICONS[subkind] ?? 'pi-circle-fill';
}

const SYSTEM_KINDS: NodeKind[] = ['service', 'package', 'workspace'];

export function nodeContent(info: NodeInfo, mode: NodeMode, size: SizeClass): NodeContent | null {
  if (mode === 'ghost' || mode === 'hidden') return null;
  if (info.kind === 'symbol') {
    return {
      icon: symbolIcon(info.subkind),
      label: size === 'small' ? '' : info.label,
      sub: null,
      counts: [],
    };
  }
  if (info.kind === 'external') {
    return {
      icon: null,
      label: info.label,
      sub: size === 'small' ? null : info.subkind,
      counts: [],
    };
  }
  const counts: NodeContent['counts'] = [];
  if (size !== 'small') {
    if (info.kind === 'file') {
      if (info.symbols > 0) counts.push({ unit: 'symbols', value: info.symbols });
    } else {
      if (info.kind === 'module' && info.files > 0)
        counts.push({ unit: 'files', value: info.files });
      if (size === 'large' && info.symbols > 0)
        counts.push({ unit: 'symbols', value: info.symbols });
    }
  }
  return {
    icon: null,
    label: info.label,
    sub: SYSTEM_KINDS.includes(info.kind) && size === 'large' ? info.subkind : null,
    counts,
  };
}
