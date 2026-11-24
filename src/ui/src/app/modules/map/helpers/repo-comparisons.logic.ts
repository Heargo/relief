import { filterRefs, shortcutRefs } from '../../review/helpers/range.logic';

export type ComparisonSide = 'source' | 'destination';

/** The rows of the popover of one side of a repository: the quick picks, then its branches. */
export function comparisonOptions(
  side: ComparisonSide,
  branches: readonly string[],
  query: string,
): string[] {
  const quick = shortcutRefs(side === 'source' ? 'head' : 'base', branches, []);
  const rest = filterRefs(branches, query).filter((ref) => !quick.includes(ref));
  return [...filterRefs(quick, query), ...rest];
}
