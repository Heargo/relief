import type { GraphDiff, Violation } from '../../../core/models/contract';
import {
  aggregateEdgeStatus,
  type DiffStatus,
  edgeStatus,
} from '../../review/helpers/diff-layer.logic';
import { edgeViolations, type Split } from '../../rules/helpers/rules.logic';
import {
  type AggregatedEdge,
  edgeLabel,
  edgeLabelClass,
  type EdgeLabelClass,
  type EdgeLabelWords,
  type EdgeShape,
  edgeTooltip,
} from './edges.logic';

/** Everything an edge says that does not depend on the camera. */
export interface EdgeState {
  status: DiffStatus;
  violations: Split<number>;
  added: number;
  removed: number;
  moved: number;
  /** The diff layer is on. */
  review: boolean;
  cls: EdgeLabelClass;
  label: string;
  tooltip: string;
}

export interface EdgeStateContext {
  diff: GraphDiff | undefined;
  violations: readonly Violation[];
  words: EdgeLabelWords;
  label: (id: string) => string;
  unit: (count: number) => string;
}

export function edgeState(edge: AggregatedEdge, context: EdgeStateContext): EdgeState {
  const { diff, violations, words } = context;
  const counts = { added: 0, removed: 0, moved: 0 };
  const statuses: DiffStatus[] = [];
  if (diff) {
    for (const link of edge.links) {
      const status = edgeStatus(link, diff);
      statuses.push(status);
      if (status === 'added') counts.added++;
      else if (status === 'removed') counts.removed++;
      else if (status === 'moved') counts.moved++;
    }
  }
  const review = diff !== undefined;
  const linkViolations = edgeViolations(edge.links, violations);
  const cls = edgeLabelClass({
    count: edge.count,
    ...counts,
    violations: linkViolations,
    review,
  }) as EdgeLabelClass;
  return {
    status: diff ? aggregateEdgeStatus(statuses) : 'unchanged',
    violations: linkViolations,
    ...counts,
    review,
    cls,
    label: edgeLabel({ count: edge.count, ...counts, cls, review }, words),
    tooltip: edgeTooltip(edge, context.label, context.unit),
  };
}

/** Changes when what is written in the DOM for an edge changes (not when only the camera moves). */
export function edgeSyncKey(
  shape: EdgeShape,
  state: EdgeState,
  selected: boolean,
  scale: number,
): string {
  const { violations: v } = state;
  return [
    shape.d,
    shape.arrow,
    shape.mx,
    shape.my,
    shape.covered,
    shape.length > 60,
    state.status,
    v.introduced,
    v.existing,
    state.added,
    state.removed,
    state.moved,
    state.review,
    state.cls,
    state.label,
    state.tooltip,
    selected,
    scale,
  ].join('|');
}
