import type { GraphSnapshot } from '../../../core/models/contract';
import type { Layouts } from '../helpers/layout-compute.logic';
import type { LayoutExecutor } from './layout-executor';

interface Waiting {
  resolve: (layouts: Layouts) => void;
  reject: (reason: Error) => void;
}

/** Runs the layouts in a Web Worker, created on first use and again after a failure. */
export function workerLayoutExecutor(): LayoutExecutor {
  let worker: Worker | null = null;
  let next = 0;
  const waiting = new Map<number, Waiting>();

  const fail = (reason: string): void => {
    worker?.terminate();
    worker = null;
    for (const { reject } of waiting.values()) reject(new Error(reason));
    waiting.clear();
  };

  return (graph: GraphSnapshot) => {
    if (!worker) {
      const created = new Worker(new URL('./layout.worker', import.meta.url), { type: 'module' });
      created.addEventListener(
        'message',
        ({ data }: MessageEvent<{ id: number; layouts: Layouts }>) => {
          waiting.get(data.id)?.resolve(data.layouts);
          waiting.delete(data.id);
        },
      );
      created.addEventListener('error', () => fail('layout worker error'));
      created.addEventListener('messageerror', () => fail('layout worker message error'));
      worker = created;
    }
    const id = next++;
    return new Promise<Layouts>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker?.postMessage({ id, graph });
    });
  };
}
