// The map scene settles a few frames after the first render: the camera may still fly to its fit,
// and jsdom measures the viewport as 0 x 0. Reading client coordinates from the scene before that
// makes a click land where the edge or node used to be.

interface Stable {
  whenStable(): Promise<unknown>;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function snapshot(): string {
  const read = (window as unknown as { __reliefScene?: () => unknown }).__reliefScene;
  return read ? JSON.stringify(read()) : '';
}

/** Waits until `window.__reliefScene()` gives the same answer on two consecutive frames. */
export async function settleScene(fixture: Stable, maxFrames = 120): Promise<void> {
  let previous = snapshot();
  for (let i = 0; i < maxFrames; i++) {
    await nextFrame();
    await fixture.whenStable();
    const current = snapshot();
    if (current !== '' && current === previous) return;
    previous = current;
  }
  throw new Error('the map scene never settled');
}
