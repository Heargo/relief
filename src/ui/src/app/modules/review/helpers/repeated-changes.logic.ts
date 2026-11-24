import type {
  ReadingItem,
  RepeatedChange,
  RepeatedChangeItem,
} from '../../../core/models/contract';
import { nodeLabel } from './review-summary.logic';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The change shared by a group as text: each part translated, joined by ", ". */
export function repeatedSummary(items: readonly RepeatedChangeItem[], t: Translate): string {
  return items
    .map((item) =>
      item.type === 'edge_added' || item.type === 'edge_removed'
        ? t(`review.repeated.items.${item.type}`, {
            kind: item.kind,
            target: nodeLabel(item.target),
          })
        : t(`review.repeated.items.${item.type}`, { name: item.name }),
    )
    .join(', ');
}

/** The "×N" of each representative and the other members, faded; the selected member is unfolded. */
export function repeatedNodes(
  repeated: readonly RepeatedChange[] | undefined,
  selected: string | null,
): { counts: Map<string, number>; faded: Set<string> } {
  const counts = new Map<string, number>();
  const faded = new Set<string>();
  for (const group of repeated ?? []) {
    counts.set(group.representative, group.members.length);
    for (const member of group.members) {
      if (member !== group.representative && member !== selected) faded.add(member);
    }
  }
  return { counts, faded };
}

/** Folds the changed edges of the faded members into those of their representative. */
export function foldRepeatedEdges<
  E extends { from: string; to: string; count: number; changed: boolean },
>(
  edges: readonly E[],
  repeated: readonly RepeatedChange[] | undefined,
  selected: string | null,
): E[] {
  if (!repeated || repeated.length === 0) return [...edges];
  const { faded } = repeatedNodes(repeated, selected);
  const repOf = new Map<string, string>();
  for (const group of repeated) {
    for (const member of group.members) repOf.set(member, group.representative);
  }
  const folded = new Map<string, E>();
  const kept: E[] = [];
  for (const edge of edges) {
    const rep = repOf.get(edge.from);
    const foldable =
      rep !== undefined && edge.changed && (edge.from === rep || faded.has(edge.from));
    if (!foldable) {
      kept.push(edge);
      continue;
    }
    const key = `${rep}\0${edge.to}`;
    const into = folded.get(key);
    folded.set(key, into ? { ...into, count: into.count + edge.count } : { ...edge, from: rep });
  }
  return [...folded.values(), ...kept];
}

/** The reading entries with one per group: the representative, at its place. */
export function collapseRepeated(
  items: readonly ReadingItem[],
  repeated: readonly RepeatedChange[] | undefined,
): ReadingItem[] {
  if (!repeated || repeated.length === 0) return [...items];
  const hidden = new Set<string>();
  for (const group of repeated) {
    for (const member of group.members) if (member !== group.representative) hidden.add(member);
  }
  return items.filter((item) => !hidden.has(item.id));
}

/** The unseen members when `id` is the representative of a group and is seen; null otherwise. */
export function groupProposal(
  repeated: readonly RepeatedChange[] | undefined,
  seen: readonly string[] | ReadonlySet<string>,
  id: string,
): string[] | null {
  const has = (x: string) =>
    Array.isArray(seen) ? seen.includes(x) : (seen as ReadonlySet<string>).has(x);
  const group = repeated?.find((g) => g.representative === id);
  if (!group || !has(id)) return null;
  const unseen = group.members.filter((m) => !has(m));
  return unseen.length > 0 ? unseen : null;
}
