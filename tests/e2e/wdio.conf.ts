import { makeConfig } from './wdio.base';

export const config = makeConfig(['./tests/**/*.e2e.ts']);
