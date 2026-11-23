import { InjectionToken } from '@angular/core';

import type { GraphSnapshot } from '../../../core/models/contract';
import { computeLayouts, type Layouts } from '../helpers/layout-compute.logic';

export type { Layouts };

/** Computes the layouts of a graph, off the main thread in production. */
export type LayoutExecutor = (graph: GraphSnapshot) => Promise<Layouts>;

/** Computes the layouts on the calling thread: the business then applies them without waiting. */
export const onThreadExecutor: LayoutExecutor = (graph) => Promise.resolve(computeLayouts(graph));

/** Without a provider the layouts are computed on the calling thread. */
export const LAYOUT_EXECUTOR = new InjectionToken<LayoutExecutor>('LAYOUT_EXECUTOR', {
  providedIn: 'root',
  factory: () => onThreadExecutor,
});
