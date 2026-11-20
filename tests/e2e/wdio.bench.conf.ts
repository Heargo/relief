// Render benchmark of the map (S05, `just bench-ui`): same harness as the e2e suite, its own specs
// (`bench/*.bench.ts`), never part of `just e2e`. The `excalidraw` spec opens the clone of S02.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, fixtureOf } from './wdio.base';

const benchDir = process.env['RELIEF_BENCH_DIR'] ?? join(homedir(), 'dev/relief-bench');
const excalidrawRange =
  '8fd970320e1d754d1c76bc31abc440b9d88aafab..47cbb5b6fbeba23fbdfb72729159d723f1176746';

const base = makeConfig(['./bench/*.bench.ts'], { mochaOpts: { ui: 'bdd', timeout: 600_000 } });

export const config: typeof base = {
  ...base,
  beforeSession: (runConfig, caps, specs) => {
    base.beforeSession?.(runConfig, caps, specs);
    if (fixtureOf(specs[0] as string) !== 'tiny') return;
    // `excalidraw.bench.ts` declares `@fixture tiny` (built, unused) and opens the real clone.
    const repo = join(benchDir, 'excalidraw');
    process.env['RELIEF_E2E_REPO'] = repo;
    const options = (caps as unknown as Record<string, { args: string[] }>)['tauri:options'];
    if (options) options.args = [repo, excalidrawRange];
  },
};
