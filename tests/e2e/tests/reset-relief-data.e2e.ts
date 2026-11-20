import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetReliefData } from '../helpers/review-state';

// Works on a private directory: never touches the `.relief/` of the repository the live app uses.
let previous: string | undefined;
let repo: string;
const entries = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);

beforeEach(() => {
  previous = process.env['RELIEF_E2E_REPO'];
  repo = mkdtempSync(join(tmpdir(), 'relief-reset-'));
  process.env['RELIEF_E2E_REPO'] = repo;
  for (const sub of ['state', 'cache']) {
    mkdirSync(join(repo, '.relief', sub), { recursive: true });
    writeFileSync(join(repo, '.relief', sub, 'leftover.json'), '{}');
  }
});

afterEach(() => {
  if (previous === undefined) delete process.env['RELIEF_E2E_REPO'];
  else process.env['RELIEF_E2E_REPO'] = previous;
  rmSync(repo, { recursive: true, force: true });
});

it('empties .relief/state/ and keeps .relief/cache/ by default', () => {
  resetReliefData();
  expect(entries(join(repo, '.relief', 'state'))).toEqual([]);
  expect(entries(join(repo, '.relief', 'cache'))).toEqual(['leftover.json']);
});

it('also empties .relief/cache/ when asked', () => {
  resetReliefData({ cache: true });
  expect(entries(join(repo, '.relief', 'state'))).toEqual([]);
  expect(entries(join(repo, '.relief', 'cache'))).toEqual([]);
});
