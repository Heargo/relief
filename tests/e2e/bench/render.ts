// Scripted render benchmark of the map: pan, wheel zoom and selection, once on the overview and
// once zoomed on the files. Events are dispatched from the page, one per animation frame, so that a
// step costs what a frame of user input costs without WebDriver round trips.
//
// Per step: `work` = script (the event, the signals, the effects) + a forced style and layout
// (`offsetHeight`), in ms; `frame` = distance between two animation frames; `compute` / `dom` = sum of
// the `relief:*` self times (computeds / `sync*` writes); `layout` = the forced style and layout.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browser } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { root } from '../wdio.base';

export interface Stat {
  p50: number;
  p95: number;
  max: number;
}
export interface PhaseResult {
  worst?: unknown[];
  steps: number;
  frame: Stat;
  work: Stat;
  compute: Stat;
  dom: Stat;
  layout: Stat;
  byMeasure: Record<string, { mean: number; p95: number }>;
  longTasks: { api: boolean; count: number; totalMs: number; maxMs: number };
}
export interface BenchResult {
  repo: string;
  size: { width: number; height: number };
  states: Record<string, { nodes: number; edges: number; [scenario: string]: unknown }>;
}

const SIZE = { width: 1600, height: 900 };
// PROTOTYPE (S14): the painter under test (`dom`, `canvas`, `webgl`), passed as `?renderer=`.
const RENDERER = process.env['RELIEF_RENDERER'] ?? 'dom';

/** Runs in the page. `scenario`: pan | zoom | select. Returns the raw per-step samples. */
function runScenario(scenario: string, steps: number, done: (r: unknown) => void): void {
  const w = window as unknown as { __reliefPerf?: boolean };
  w.__reliefPerf = true;
  const canvas = document.querySelector<HTMLElement>('[data-testid="map-canvas"]');
  if (!canvas) throw new Error('no map-canvas');
  const box = canvas.getBoundingClientRect();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const samples: {
    frame: number;
    work: number;
    layout: number;
    measures: Record<string, number>;
  }[] = [];
  const pending: PerformanceEntry[] = [];
  const observer = new PerformanceObserver((list) => pending.push(...list.getEntries()));
  observer.observe({ type: 'measure' });
  const longTasks: number[] = [];
  const api = (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
  const longObserver = new PerformanceObserver((list) =>
    longTasks.push(...list.getEntries().map((e) => e.duration)),
  );
  if (api) longObserver.observe({ type: 'longtask' });

  let down = false;
  type Target = { x: number; y: number; el: Element };
  const targets: Target[] = [];
  if (scenario === 'select') {
    const scene = (
      window as unknown as {
        __reliefScene?: () => {
          nodes: { left: number; top: number; width: number; height: number }[];
        };
      }
    ).__reliefScene?.();
    const rects = scene
      ? scene.nodes.map((n) => ({
          r: {
            left: n.left,
            top: n.top,
            right: n.left + n.width,
            bottom: n.top + n.height,
            x: n.left,
            y: n.top,
            width: n.width,
            height: n.height,
          },
          el: canvas as Element,
        }))
      : Array.from(document.querySelectorAll<HTMLElement>('.map-node')).map((el) => ({
          r: el.getBoundingClientRect(),
          el: el as Element,
        }));
    // Smallest boxes first in the DOM order is not guaranteed: keep the order, filter by size.
    const nodes = rects.filter(({ r }) => {
      return (
        r.width > 24 &&
        r.height > 14 &&
        r.left > box.left &&
        r.right < box.right &&
        r.top > box.top &&
        r.bottom < box.bottom
      );
    });
    const stride = Math.max(1, Math.floor(nodes.length / steps));
    for (let i = 0; i < nodes.length && targets.length < steps; i += stride) {
      const { r, el } = nodes[i] as (typeof nodes)[number];
      targets.push({ x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 10), el });
    }
  }
  const total = scenario === 'select' ? targets.length : steps;

  let last = performance.now();
  let i = 0;
  const finish = () => {
    window.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy }),
    );
    observer.takeRecords();
    setTimeout(() => {
      observer.disconnect();
      longObserver.disconnect();
      done({ samples, longTasks, api });
    }, 50);
  };
  const step = () => {
    if (i >= total) return finish();
    const t0 = performance.now();
    const frame = t0 - last;
    last = t0;
    if (scenario === 'pan') {
      if (!down) {
        canvas.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: cx, clientY: cy }),
        );
        down = true;
      }
      const a = (i / 20) * Math.PI;
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: cx + 120 * Math.sin(a),
          clientY: cy + 60 * Math.sin(2 * a),
        }),
      );
    } else if (scenario === 'zoom') {
      // In for half of the steps, then out: the camera ends where it started.
      const dy = i < total / 2 ? -60 : 60;
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: dy,
          clientX: cx,
          clientY: cy,
        }),
      );
    } else {
      const { x, y, el } = targets[i] as Target;
      el.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y }),
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: x, clientY: y }),
      );
    }
    // Let Angular flush its effects (microtasks and a macrotask), then force style and layout.
    setTimeout(() => {
      const t1 = performance.now();
      void document.body.offsetHeight;
      const t2 = performance.now();
      observer.takeRecords().forEach((e) => pending.push(e));
      const measures: Record<string, number> = {};
      for (const e of pending.splice(0)) {
        const self = (e as PerformanceMeasure).detail?.self ?? e.duration;
        measures[e.name] = (measures[e.name] ?? 0) + self;
      }
      samples.push({ frame, work: t2 - t0, layout: t2 - t1, measures });
      i++;
      requestAnimationFrame(step);
    }, 0);
  };
  requestAnimationFrame(step);
}

const stat = (xs: number[]): Stat => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { p50: at(0.5), p95: at(0.95), max: s[s.length - 1] ?? 0 };
};

async function scenario(name: string, steps: number): Promise<PhaseResult> {
  const raw = (await browser.executeAsync(
    `const [name, steps, done] = arguments; (${runScenario.toString()})(name, steps, done);`,
    name,
    steps,
  )) as {
    samples: { frame: number; work: number; layout: number; measures: Record<string, number> }[];
    longTasks: number[];
    api: boolean;
  };
  // Steps whose first sample follows a scenario switch are kept: the first frame is part of the cost.
  const isCompute = (n: string) => !n.startsWith('relief:sync');
  const sum = (m: Record<string, number>, keep: (n: string) => boolean) =>
    Object.entries(m).reduce((t, [n, v]) => (keep(n) ? t + v : t), 0);
  const names = new Set(raw.samples.flatMap((s) => Object.keys(s.measures)));
  const byMeasure: PhaseResult['byMeasure'] = {};
  for (const n of names) {
    const xs = raw.samples.map((s) => s.measures[n] ?? 0);
    byMeasure[n] = { mean: xs.reduce((a, b) => a + b, 0) / xs.length, p95: stat(xs).p95 };
  }
  // Without the Long Tasks API (WebKitGTK), a task is a step whose frame took more than 50 ms.
  const longs = raw.api ? raw.longTasks : raw.samples.map((s) => s.work).filter((w) => w > 50);
  // PROTOTYPE (S14): the three worst steps with their marks, to see what the long frames hold.
  const worst = [...raw.samples]
    .sort((a, b) => b.work - a.work)
    .slice(0, 3)
    .map((s) => ({
      work: s.work,
      layout: s.layout,
      measures: Object.fromEntries(Object.entries(s.measures).filter(([, v]) => v >= 1)),
    }));
  return {
    worst,
    steps: raw.samples.length,
    frame: stat(raw.samples.slice(1).map((s) => s.frame)),
    work: stat(raw.samples.map((s) => s.work)),
    compute: stat(raw.samples.map((s) => sum(s.measures, isCompute))),
    dom: stat(raw.samples.map((s) => sum(s.measures, (n) => !isCompute(n)))),
    layout: stat(raw.samples.map((s) => s.layout)),
    byMeasure,
    longTasks: {
      api: raw.api,
      count: longs.length,
      totalMs: longs.reduce((a, b) => a + b, 0),
      maxMs: Math.max(0, ...longs),
    },
  };
}

const counts = () =>
  browser.execute(() => {
    const scene = (
      window as unknown as { __reliefScene?: () => { nodes: unknown[]; edges: number } }
    ).__reliefScene?.();
    if (scene) return { nodes: scene.nodes.length, edges: scene.edges };
    return {
      nodes: document.querySelectorAll('[data-testid="map-node"]').length,
      edges: document.querySelectorAll('[data-testid="map-edge"]').length,
    };
  });

/** Wheel zoom on the centre until `wanted` nodes are in the DOM (or 60 steps). */
async function zoomToFiles(wanted: number): Promise<void> {
  for (let n = 0; n < 60; n++) {
    const { nodes } = await counts();
    if (nodes >= wanted) return;
    await browser.execute(() => {
      const canvas = document.querySelector('[data-testid="map-canvas"]') as HTMLElement;
      const b = canvas.getBoundingClientRect();
      for (let k = 0; k < 4; k++)
        canvas.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY: -60,
            clientX: b.x + b.width / 2,
            clientY: b.y + b.height / 2,
          }),
        );
    });
    await browser.pause(150);
  }
}

export function benchRepository(name: string): void {
  it(`measures the map render on ${name}`, async () => {
    await openRelief({ size: SIZE, query: RENDERER === 'dom' ? '' : `?renderer=${RENDERER}` });
    await browser.waitUntil(async () => (await counts()).nodes > 0, { timeout: 120_000 });
    await browser.pause(2000);
    const result: BenchResult & { renderer: string } = {
      repo: name,
      renderer: RENDERER,
      size: SIZE,
      states: {},
    };
    for (const [state, wanted] of [
      ['overview', 0],
      ['files', 400],
    ] as const) {
      if (wanted) {
        await zoomToFiles(wanted);
        await browser.pause(1500);
      }
      const c = await counts();
      const entry: BenchResult['states'][string] = { ...c };
      for (const [scenarioName, steps] of [
        ['pan', 120],
        ['zoom', 80],
        ['select', 12],
      ] as const) {
        entry[scenarioName] = await scenario(scenarioName, steps);
        await browser.pause(500);
      }
      result.states[state] = entry;
    }
    const dir = join(root, 'target/bench-ui');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}-${RENDERER}.json`), JSON.stringify(result, null, 2));
    console.log(`bench-ui ${name} ${RENDERER}: ${JSON.stringify(result)}`);
  });
}
