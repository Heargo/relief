import { makeConfig } from '../../../tests/e2e/wdio.base';

// Same app and acme-shop as the e2e suite: only the specs differ.
export const config = makeConfig(['./*.shot.ts']);
