import { resolve } from 'node:path';
import { makeConfig } from '../../../tests/e2e/wdio.base';

// Same app and acme-shop as the e2e suite: only the specs differ. The glob is absolute: wdio runs
// from docs/user, where a relative one would match no spec when the fixtures are picked.
export const config = makeConfig([resolve(import.meta.dirname, '*.shot.ts')]);
