/// <reference lib="webworker" />
import type { GraphSnapshot } from '../../../core/models/contract';
import { computeLayouts } from '../helpers/layout-compute.logic';

addEventListener('message', ({ data }: MessageEvent<{ id: number; graph: GraphSnapshot }>) => {
  postMessage({ id: data.id, layouts: computeLayouts(data.graph) });
});
