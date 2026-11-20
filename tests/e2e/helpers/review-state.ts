import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Empties `.relief/state/` of the repository under test. acme-shop is built once for the whole
 * suite, so each spec starts by clearing the review progress the previous one saved. The
 * repository path is exported by wdio.base.ts as RELIEF_E2E_REPO.
 */
export function clearReviewState(): void {
  resetReliefData();
}

/**
 * Empties `.relief/state/` of the repository of the spec (RELIEF_E2E_REPO, set per spec by
 * wdio.base.ts), and `.relief/cache/` too with `{ cache: true }`. A missing folder is fine.
 */
export function resetReliefData({ cache = false }: { cache?: boolean } = {}): void {
  const repo = process.env['RELIEF_E2E_REPO'];
  if (!repo) throw new Error('RELIEF_E2E_REPO is not set (see wdio.base.ts)');
  for (const sub of cache ? ['state', 'cache'] : ['state']) {
    rmSync(join(repo, '.relief', sub), { recursive: true, force: true });
    mkdirSync(join(repo, '.relief', sub), { recursive: true });
  }
}
