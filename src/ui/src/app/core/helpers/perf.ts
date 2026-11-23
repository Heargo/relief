// Performance marks of the map (ticket S05). Off unless `window.__reliefPerf` is true, which only
// the render benchmark (`just bench-ui`) sets: when off, `measured` is one property read.
// `performance.measure('relief:<name>', { detail: { self } })` is emitted when on; `self` excludes
// the measured calls nested inside (a computed read by another computed).

interface Frame {
  child: number;
}

const stack: Frame[] = [];

function enabled(): boolean {
  return (globalThis as { __reliefPerf?: boolean }).__reliefPerf === true;
}

/** Runs `fn`, and measures it as `relief:<name>` when the benchmark switch is on. */
export function measured<T>(name: string, fn: () => T): T {
  if (!enabled()) return fn();
  const start = performance.now();
  const frame: Frame = { child: 0 };
  stack.push(frame);
  try {
    return fn();
  } finally {
    stack.pop();
    const end = performance.now();
    const total = end - start;
    const parent = stack[stack.length - 1];
    if (parent) parent.child += total;
    performance.measure(`relief:${name}`, { start, end, detail: { self: total - frame.child } });
  }
}
