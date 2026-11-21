import type { NodeKind } from '../../../core/models/contract';

/** Header of an open container: the room the layout reserved, capped at the mockup size. */
export interface OpenHeader {
  height: number;
  fontSize: number;
  labelVisible: boolean;
}

interface HeaderSpec {
  /** Header height reserved by the layout, in world units (`layout.logic.ts`). */
  world: number;
  /** Mockup height, in screen px. */
  maxHeight: number;
  /** Mockup font size, in screen px. */
  maxFont: number;
}

const SYSTEM: HeaderSpec = { world: 50, maxHeight: 38, maxFont: 15 };
const MODULE: HeaderSpec = { world: 36, maxHeight: 30, maxFont: 13 };
const FILE: HeaderSpec = { world: 30, maxHeight: 26, maxFont: 12 };

/** Under this font size (px) a label is unreadable. */
const MIN_FONT = 8;
const FONT_RATIO = 0.5;
/** A closed box smaller than this shows no label. */
const MIN_CLOSED_HEIGHT = 14;
const MIN_CLOSED_WIDTH = 28;

function specOf(kind: NodeKind | string): HeaderSpec {
  if (kind === 'module') return MODULE;
  if (kind === 'file') return FILE;
  return SYSTEM;
}

export function openHeader(kind: NodeKind | string, scale: number): OpenHeader {
  const spec = specOf(kind);
  const height = Math.min(spec.world * scale, spec.maxHeight);
  const fontSize = Math.min(spec.maxFont, height * FONT_RATIO);
  return { height, fontSize, labelVisible: fontSize >= MIN_FONT };
}

/** Font size of the title of an open container whose header is `height` px high. */
export function headerFontSize(kind: NodeKind | string, height: number): number {
  return Math.min(specOf(kind).maxFont, height * FONT_RATIO);
}

/** Under this font size (px) the title leaves the header for a tab on the border. */
export const TAB_FONT = 11;

export type HeaderLabel = 'header' | 'tab' | 'none';

export interface HeaderLayout {
  height: number;
  fontSize: number;
  label: HeaderLabel;
}

/** Header of an open container and where its title goes: in the header, or on a tab. */
export function headerLayout(kind: NodeKind | string, scale: number): HeaderLayout {
  const { height, fontSize } = openHeader(kind, scale);
  return { height, fontSize, label: fontSize >= TAB_FONT ? 'header' : 'tab' };
}

export function closedLabelVisible(width: number, height: number): boolean {
  return width >= MIN_CLOSED_WIDTH && height >= MIN_CLOSED_HEIGHT;
}

/** Border width of a box: the header starts on it so that it ends where the layout says. */
const BORDER = 1;
const SUB_FONT = 11;

export interface HeaderStyle {
  height: string;
  fontSize: string;
  lineHeight: string;
  marginTop: string;
  /** Font of the sub-elements (sub text, chips, badges, icon). */
  subFontSize: string;
}

/** The inline style of an open header. */
export function headerStyle(open: Pick<OpenHeader, 'height' | 'fontSize'>): HeaderStyle {
  return {
    height: `${open.height}px`,
    fontSize: `${open.fontSize}px`,
    lineHeight: '1',
    marginTop: `-${BORDER}px`,
    subFontSize: `${Math.min(SUB_FONT, open.fontSize)}px`,
  };
}
