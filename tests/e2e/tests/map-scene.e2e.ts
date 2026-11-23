import { $, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import {
  clickEdge,
  clickNode,
  doubleClickNode,
  hoverEdge,
  scene,
  sceneEdge,
  sceneNode,
  sceneNodeByLabel,
  waitForNode,
  waitForScene,
} from '../helpers/map-scene';
import { poll, rectOf, tid } from '../helpers/ui';

// Contract with the UI (S15): `window.__reliefScene()` returns what the map draws,
//  - `nodes`: { id, kind, mode, label, labelShown, header, status, badges, impact, emphasis, ...,
//    left, top, width, height } (client coordinates);
//  - `edges`: { from, to, status, count, selected, merged, coChange, emphasis, label, tooltip, ...,
//    mid: { x, y } } (client coordinates).
const WEB = 'pkg:@acme/web';
const API = 'pkg:@acme/api';
const DB = 'pkg:@acme/db';

it('exposes the nodes drawn at level 0, with their label and a client rectangle', async () => {
  await openRelief();
  await waitForNode(WEB);
  const nodes = (await scene()).nodes;
  const systems = nodes.filter((n) => n.kind === 'service' || n.kind === 'package');
  expect(systems.map((n) => n.id).sort()).toEqual([API, DB, 'pkg:@acme/shared', WEB].sort());
  const api = await sceneNodeByLabel('apps/api');
  expect(api?.id).toBe(API);
  expect(api!.width).toBeGreaterThan(50);
  expect(api!.height).toBeGreaterThan(30);
});

it('the middle of an edge is a client point inside the map', async () => {
  await openRelief();
  await waitForScene((s) => s.edges.length > 0);
  const edge = await sceneEdge(WEB, DB);
  expect(edge).toBeDefined();
  const canvas = await rectOf('map-canvas');
  expect(edge!.mid.x).toBeGreaterThan(canvas.x);
  expect(edge!.mid.x).toBeLessThan(canvas.x + canvas.width);
  expect(edge!.mid.y).toBeGreaterThan(canvas.y);
  expect(edge!.mid.y).toBeLessThan(canvas.y + canvas.height);
  expect(edge!.status).toBe('added');
  expect(edge!.count).toBeGreaterThanOrEqual(1);
});

it('clicking a node by its coordinates selects it: it stays sharp, the others are dimmed', async () => {
  await openRelief();
  await waitForNode(WEB);
  expect((await sceneNode(WEB))!.emphasis).toBeNull();

  await clickNode(WEB);

  const after = await waitForScene((s) => s.nodes.find((n) => n.id === WEB)?.emphasis === 'sharp');
  expect(after.nodes.some((n) => n.emphasis === 'dim')).toBe(true);
  expect((await sceneEdge(WEB, DB))!.emphasis).toBe('out');
});

it('clicking an edge by its coordinates selects it and opens its panel', async () => {
  await openRelief();
  await waitForScene((s) => s.edges.some((e) => e.from === WEB && e.to === DB));

  await clickEdge(WEB, DB);

  await expect(tid('edge-panel')).toBeDisplayed();
  const edge = await waitForScene(
    (s) => !!s.edges.find((e) => e.from === WEB && e.to === DB)?.selected,
  );
  expect(edge.edges.find((e) => e.from === WEB && e.to === DB)!.emphasis).toBe('picked');
});

it('hovering an edge leaves its tooltip text in the scene', async () => {
  await openRelief();
  await waitForScene((s) => s.edges.some((e) => e.from === WEB && e.to === DB));
  await hoverEdge(WEB, DB);
  const edge = await sceneEdge(WEB, DB);
  expect(edge!.tooltip).toContain('apps/web');
  expect(edge!.tooltip).toContain('packages/db');
});

it('double-clicking a node by its coordinates frames it', async () => {
  await openRelief();
  const before = await waitForNode(API);

  await doubleClickNode(API);

  await poll(
    async () => (await sceneNode(API))?.width ?? 0,
    (width) => width > before.width * 1.3,
  );
  await expect(tid('current-level')).not.toHaveAttribute('data-level', '0');
  await expect($('[data-testid="map-canvas"]')).toBeDisplayed();
});
