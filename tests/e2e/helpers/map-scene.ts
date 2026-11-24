import { browser } from '@wdio/globals';

// The map is read through `window.__reliefScene()`, whatever draws it (DOM today, Canvas later):
// the scene lists what is drawn, with rectangles in client coordinates (what a pointer action
// takes). Nothing here knows about `map-node`, `map-edge`, `data-*` attributes or CSS classes.

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SceneNode extends ClientRect {
  id: string;
  kind: string;
  mode: 'open' | 'box' | 'ghost';
  label: string;
  labelShown: boolean;
  header: 'header' | 'tab' | 'none';
  /** Height of the header band in pixels (0 without header). */
  headerHeight: number;
  /** Where the title tab sits when `header` is 'tab' (straddling the top border), else null. */
  tabRect: ClientRect | null;
  /** The shown label does not fit in its header or box. */
  labelClipped: boolean;
  status: 'added' | 'removed' | 'modified' | 'moved' | 'unchanged' | null;
  intensity: number | null;
  oldLocation: boolean;
  badges: string[];
  counts: { unit: 'symbols' | 'files'; value: number }[];
  sub: string | null;
  impact: 'hit' | 'box' | 'dim' | null;
  impactCount: number;
  reading: { seen: boolean; count: { seen: number; total: number } | null } | null;
  flagged: boolean;
  loading: boolean;
  risk: number | null;
  faded: boolean;
  emphasis: 'sharp' | 'dim' | null;
  /** R17: "tested by N" badge on the target of folded test edges, null without. */
  testedBy: { count: number; added: number } | null;
  /** R18: "×N identical" on the representative of a group of repeated changes, null without. */
  repeated: { count: number } | null;
}

export interface SceneEdge {
  from: string;
  to: string;
  status: 'added' | 'removed' | 'modified' | 'moved' | 'unchanged';
  count: number;
  changed: boolean;
  selected: boolean;
  merged: boolean;
  coChange: boolean;
  impactPath: boolean;
  violation: 'new' | 'old' | null;
  emphasis: 'out' | 'in' | 'picked' | 'dim' | 'hidden' | 'normal';
  label: { text: string; cls: string; visible: boolean };
  tooltip: string;
  labelRect: ClientRect | null;
  /** Middle of the edge, in client coordinates (on its branch when it is bundled). */
  mid: { x: number; y: number };
  /** U31: id of the bundle the edge belongs to, null when drawn alone. */
  bundle: string | null;
  /** U31: the pointer is on the edge. */
  hovered: boolean;
  /** R19: faded by the step-by-step focus. */
  faded: boolean;
  /** U32: the points of the route along the corridors, in client coordinates; null for the direct curve. */
  route: { x: number; y: number }[] | null;
}

/** U31: edges that enter (or leave) a box by the same side, drawn as a shared trunk. */
export interface SceneBundle {
  id: string;
  box: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  end: 'in' | 'out';
  /** Number of edges in the bundle (3 at least). */
  count: number;
  /** Number of new edges (review). */
  added: number;
  status: 'added' | 'removed' | 'modified' | 'moved' | 'unchanged';
  mixed: boolean;
  selected: boolean;
  label: { text: string };
  edges: { from: string; to: string }[];
  /** Middle of the trunk, in client coordinates: a click there selects the bundle. */
  mid: { x: number; y: number };
}

export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  bundles: SceneBundle[];
}

export async function scene(): Promise<Scene> {
  const result = await browser.execute(() => {
    const read = (window as unknown as { __reliefScene?: () => unknown }).__reliefScene;
    return read ? read() : null;
  });
  if (!result) throw new Error('window.__reliefScene is not exposed by the map');
  return result as Scene;
}

export async function sceneNodes(): Promise<SceneNode[]> {
  return (await scene()).nodes;
}

/** A node of the scene by id, or undefined when it is not drawn. */
export async function sceneNode(id: string): Promise<SceneNode | undefined> {
  return (await sceneNodes()).find((n) => n.id === id);
}

/** The first drawn node (a ghost excepted) whose label is `text`. */
export async function sceneNodeByLabel(text: string): Promise<SceneNode | undefined> {
  return (await sceneNodes()).find((n) => n.label === text && n.mode !== 'ghost');
}

export async function sceneEdges(): Promise<SceneEdge[]> {
  return (await scene()).edges;
}

export async function sceneBundles(): Promise<SceneBundle[]> {
  return (await scene()).bundles;
}

/** A full (not merged, not co-change) edge of the scene, or undefined. */
export async function sceneEdge(from: string, to: string): Promise<SceneEdge | undefined> {
  return (await sceneEdges()).find(
    (e) => e.from === from && e.to === to && !e.merged && !e.coChange,
  );
}

/** Waits until `predicate` holds on the scene; returns that scene. */
export async function waitForScene(
  predicate: (scene: Scene) => boolean,
  timeout = 8000,
): Promise<Scene> {
  let last: Scene | undefined;
  await browser.waitUntil(
    async () => {
      try {
        last = await scene();
      } catch {
        return false;
      }
      return predicate(last);
    },
    { timeout, interval: 100, timeoutMsg: 'the map scene never satisfied the condition' },
  );
  return last as Scene;
}

export async function waitForNode(id: string, timeout = 8000): Promise<SceneNode> {
  const found = await waitForScene((s) => s.nodes.some((n) => n.id === id), timeout);
  return found.nodes.find((n) => n.id === id) as SceneNode;
}

/** Where a click selects the node itself: its header for an open container, else its centre. */
function clickPoint(node: SceneNode): { x: number; y: number } {
  const x = Math.round(node.left + node.width / 2);
  const y =
    node.mode === 'open'
      ? Math.round(node.top + Math.min(6, node.height / 2))
      : Math.round(node.top + node.height / 2);
  return { x, y };
}

async function nodePoint(id: string): Promise<{ x: number; y: number }> {
  return clickPoint(await waitForNode(id));
}

async function edgePoint(from: string, to: string): Promise<{ x: number; y: number }> {
  const found = await waitForScene((s) =>
    s.edges.some((e) => e.from === from && e.to === to && !e.merged && !e.coChange),
  );
  const edge = found.edges.find((e) => e.from === from && e.to === to && !e.merged && !e.coChange);
  const { x, y } = (edge as SceneEdge).mid;
  return { x: Math.round(x), y: Math.round(y) };
}

async function click({ x, y }: { x: number; y: number }): Promise<void> {
  await browser.action('pointer').move({ x, y }).down().up().perform();
}

/** A real pointer click at the middle of a scene edge (merged ones included). */
export async function clickSceneEdge(edge: SceneEdge): Promise<void> {
  await click({ x: Math.round(edge.mid.x), y: Math.round(edge.mid.y) });
}

/** A real pointer click on the trunk of a bundle. */
export async function clickBundle(bundle: SceneBundle): Promise<void> {
  await click({ x: Math.round(bundle.mid.x), y: Math.round(bundle.mid.y) });
}

/** A real pointer click at the node. */
export async function clickNode(id: string): Promise<void> {
  await click(await nodePoint(id));
}

/** A real pointer double click at the node. */
export async function doubleClickNode(id: string): Promise<void> {
  const { x, y } = await nodePoint(id);
  await browser.action('pointer').move({ x, y }).down().up().pause(60).down().up().perform();
}

/** A real pointer click at the middle of the edge. */
export async function clickEdge(from: string, to: string): Promise<void> {
  await click(await edgePoint(from, to));
}

/** Moves the pointer onto the middle of the edge. */
export async function hoverEdge(from: string, to: string): Promise<void> {
  const { x, y } = await edgePoint(from, to);
  await browser.action('pointer').move({ x, y }).perform();
}

/** Waits until a node is drawn and has stopped moving (the camera animation is over); returns it. */
export async function settledNode(id: string, timeout = 8000): Promise<SceneNode> {
  await waitForNode(id, timeout);
  let previous = '';
  let node: SceneNode | undefined;
  await browser.waitUntil(
    async () => {
      node = await sceneNode(id);
      const key = node
        ? [node.left, node.top, node.width, node.height].map((v) => Math.round(v)).join(',')
        : '';
      const same = key !== '' && key === previous;
      previous = key;
      return same;
    },
    { timeout, interval: 300, timeoutMsg: `${id} never stopped moving` },
  );
  return node as SceneNode;
}

/** The nodes of the scene whose id satisfies `test`. */
export async function sceneNodesMatching(test: (id: string) => boolean): Promise<SceneNode[]> {
  return (await sceneNodes()).filter((n) => test(n.id));
}

/** Waits until the scene holds a node whose id satisfies `test`; returns it. */
export async function waitForNodeMatching(
  test: (id: string) => boolean,
  timeout = 8000,
): Promise<SceneNode> {
  const found = await waitForScene((s) => s.nodes.some((n) => test(n.id)), timeout);
  return found.nodes.find((n) => test(n.id)) as SceneNode;
}

/** Waits until the number of drawn nodes is the same on two reads, and non-zero. */
export async function settledNodeCount(timeout = 8000): Promise<number> {
  let previous = -1;
  let now = 0;
  await browser.waitUntil(
    async () => {
      now = (await sceneNodes()).length;
      const same = now > 0 && now === previous;
      previous = now;
      return same;
    },
    { timeout, interval: 600, timeoutMsg: 'the map never settled' },
  );
  return now;
}
