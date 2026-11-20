import type { GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A node placed on the map, in world units. `x`/`y` are absolute. */
export interface LaidOutNode extends Rect {
  id: string;
  kind: NodeKind;
  parent: string | null;
  children: string[];
}

export interface MapLayout {
  nodes: Map<string, LaidOutNode>;
  /** Top-level nodes: the children of the repo node. */
  roots: string[];
  bounds: Rect;
}

const SYMBOL_SIZE = { w: 210, h: 26 };
const EXTERNAL_SIZE = { w: 240, h: 110 };
const ROOT_GAP = 160;

interface Spacing {
  pad: number;
  header: number;
  gap: number;
  minW: number;
}

const FILE: Spacing = { pad: 8, header: 30, gap: 5, minW: 226 };
const MODULE: Spacing = { pad: 14, header: 36, gap: 16, minW: 200 };
const SYSTEM: Spacing = { pad: 22, header: 50, gap: 26, minW: 240 };

function spacingOf(kind: NodeKind): Spacing {
  if (kind === 'file') return FILE;
  if (kind === 'module') return MODULE;
  return SYSTEM;
}

export function isLeafKind(kind: NodeKind): boolean {
  return kind === 'symbol' || kind === 'external';
}

export function rankOf(kind: NodeKind): number {
  if (kind === 'service' || kind === 'package' || kind === 'workspace') return 0;
  if (kind === 'file' || kind === 'symbol') return 2;
  return 1;
}

/** A node and its size; `rx`/`ry` are its position inside its parent, set when the parent is sized. */
interface Placed {
  node: Node;
  w: number;
  h: number;
  children: Placed[];
  rx: number;
  ry: number;
}

type Sized = Placed;

/** Order of the children of each container (key `null`: the children of the repo). */
export type ChildOrder = Map<string | null, string[]>;

/** The nodes of the graph grouped by container: what the layout needs, whatever the order. */
export interface LayoutInput {
  rootNodes: Node[];
  childrenOf: Map<string, Node[]>;
}

export function groupChildren(graph: GraphSnapshot): LayoutInput {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, Node[]>();
  const rootNodes: Node[] = [];
  for (const node of graph.nodes) {
    if (node.kind === 'repo') continue;
    const parent = node.parent ? byId.get(node.parent) : undefined;
    if (!parent || parent.kind === 'repo') {
      rootNodes.push(node);
    } else {
      const list = childrenOf.get(parent.id) ?? [];
      list.push(node);
      childrenOf.set(parent.id, list);
    }
  }
  return { rootNodes, childrenOf };
}

/** `nodes` sorted by their position in `ids`; the ones missing from `ids` keep their order, last. */
function sortedBy(nodes: Node[], ids: string[] | undefined): Node[] {
  if (!ids) return nodes;
  const at = (n: Node) => {
    const i = ids.indexOf(n.id);
    return i < 0 ? ids.length : i;
  };
  return nodes
    .map((n) => [n, at(n)] as const)
    .sort((a, b) => a[1] - b[1])
    .map(([n]) => n);
}

/**
 * Nested grid layout (sizes and paddings of the mockup), absolute positions in world units. The
 * children follow `order` when given, the order of the snapshot otherwise.
 */
export function layoutGraph(graph: GraphSnapshot, order?: ChildOrder): MapLayout {
  return layoutInput(groupChildren(graph), order);
}

/** Same as `layoutGraph`, from children already grouped (for callers that lay out many orders). */
export function layoutInput(input: LayoutInput, order?: ChildOrder): MapLayout {
  let rootNodes = input.rootNodes;
  let childrenOf = input.childrenOf;
  if (order) {
    rootNodes = sortedBy(rootNodes, order.get(null));
    childrenOf = new Map();
    for (const [id, list] of input.childrenOf) childrenOf.set(id, sortedBy(list, order.get(id)));
  }
  rootNodes = [...rootNodes].sort((a, b) => rankOf(a.kind) - rankOf(b.kind));

  const sized = rootNodes.map((n) => size(n, childrenOf));
  const placed = shelfPack(sized);

  const nodes = new Map<string, LaidOutNode>();
  const roots: string[] = [];
  for (const root of placed) {
    roots.push(root.node.id);
    place(root, root.rx, root.ry, null, nodes);
  }
  return { nodes, roots, bounds: boundsOf(placed) };
}

function size(node: Node, childrenOf: Map<string, Node[]>): Sized {
  if (node.kind === 'symbol') return { node, ...SYMBOL_SIZE, children: [], rx: 0, ry: 0 };
  if (node.kind === 'external') return { node, ...EXTERNAL_SIZE, children: [], rx: 0, ry: 0 };
  const kids = (childrenOf.get(node.id) ?? []).map((c) => size(c, childrenOf));
  const spacing = spacingOf(node.kind);
  const cols = node.kind === 'file' ? 1 : Math.max(1, Math.ceil(Math.sqrt(kids.length)));
  let x = spacing.pad;
  let y = spacing.header;
  let rowH = 0;
  let maxW = 0;
  kids.forEach((kid, i) => {
    if (i > 0 && i % cols === 0) {
      y += rowH + spacing.gap;
      x = spacing.pad;
      rowH = 0;
    }
    kid.rx = x;
    kid.ry = y;
    x += kid.w + spacing.gap;
    rowH = Math.max(rowH, kid.h);
    maxW = Math.max(maxW, x - spacing.gap);
  });
  return {
    node,
    w: Math.max(maxW + spacing.pad, spacing.minW),
    h: y + rowH + spacing.pad,
    children: kids,
    rx: 0,
    ry: 0,
  };
}

/** Rows of roots, wrapped so the whole map stays roughly 4:3 instead of one long line. */
function shelfPack(roots: Sized[]): Placed[] {
  const area = roots.reduce((sum, r) => sum + r.w * r.h, 0);
  const widest = roots.reduce((max, r) => Math.max(max, r.w), 0);
  const maxRowW = Math.max(widest, Math.sqrt(area) * 1.35);
  const placed: Placed[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const root of roots) {
    if (x > 0 && x + root.w > maxRowW) {
      y += rowH + ROOT_GAP;
      x = 0;
      rowH = 0;
    }
    root.rx = x;
    root.ry = y;
    placed.push(root);
    x += root.w + ROOT_GAP;
    rowH = Math.max(rowH, root.h);
  }
  return placed;
}

function place(
  item: Placed,
  x: number,
  y: number,
  parent: string | null,
  out: Map<string, LaidOutNode>,
): void {
  const { node } = item;
  out.set(node.id, {
    id: node.id,
    kind: node.kind,
    parent,
    children: item.children.map((c) => c.node.id),
    x,
    y,
    w: item.w,
    h: item.h,
  });
  if (isLeafKind(node.kind)) return;
  for (const child of item.children) place(child, x + child.rx, y + child.ry, node.id, out);
}

function boundsOf(roots: Placed[]): Rect {
  if (roots.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x1 = Math.max(...roots.map((r) => r.rx + r.w));
  const y1 = Math.max(...roots.map((r) => r.ry + r.h));
  return { x: 0, y: 0, w: x1, h: y1 };
}

/** Layout halfway between two layouts of the same nodes (`u` from 0 to 1). */
export function interpolateLayout(from: MapLayout, to: MapLayout, u: number): MapLayout {
  const mix = (a: number, b: number) => a + (b - a) * u;
  const nodes = new Map<string, LaidOutNode>();
  for (const [id, target] of to.nodes) {
    const start = from.nodes.get(id) ?? target;
    nodes.set(id, {
      ...target,
      x: mix(start.x, target.x),
      y: mix(start.y, target.y),
      w: mix(start.w, target.w),
      h: mix(start.h, target.h),
    });
  }
  return {
    nodes,
    roots: to.roots,
    bounds: {
      x: mix(from.bounds.x, to.bounds.x),
      y: mix(from.bounds.y, to.bounds.y),
      w: mix(from.bounds.w, to.bounds.w),
      h: mix(from.bounds.h, to.bounds.h),
    },
  };
}
