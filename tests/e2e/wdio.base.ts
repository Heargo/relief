// Shared WebdriverIO setup for the e2e suite and the doc screenshots (docs/user/screenshots):
// builds the fixtures the specs ask for (acme-shop by default) in a temporary directory, starts
// tauri-driver and drives the release build of the desktop app, one session (one window) per spec file.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import type { Options } from '@wdio/types';

export const root = resolve(import.meta.dirname, '../..');
export const range = 'main...feat/promo-codes';
const defaultFixture = 'acme-shop';
const port = 4444;

function findInPath(name: string): string {
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    const candidate = join(dir, name);
    if (dir && existsSync(candidate)) return candidate;
  }
  throw new Error(
    `${name} not found in PATH (Arch: webkitgtk-6.0, Debian/Ubuntu: webkit2gtk-driver)`,
  );
}

function waitForPort(): Promise<void> {
  const deadline = Date.now() + 30_000;
  return new Promise((done, fail) => {
    const attempt = () => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        done();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) fail(new Error('tauri-driver did not start'));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

/** The fixture a spec asks for with `// @fixture <name>` on its first line (acme-shop otherwise). */
export function fixtureOf(specFile: string): string {
  const first = readFileSync(specFile.replace(/^file:\/\//, ''), 'utf8').split('\n', 1)[0] ?? '';
  return /^\/\/\s*@fixture\s+([\w-]+)\s*$/.exec(first)?.[1] ?? defaultFixture;
}

/** True when the second line of the spec is `// @no-range`: acme-shop is then opened without a range. */
export function opensWithoutRange(specFile: string): boolean {
  const second = readFileSync(specFile.replace(/^file:\/\//, ''), 'utf8').split('\n')[1] ?? '';
  return /^\/\/\s*@no-range\s*$/.test(second);
}

/**
 * True when the second line of the spec is `// @welcome`: the app is started without argument
 * (welcome screen), with the fixture of the spec as its only recent repository.
 */
export function opensWithoutPath(specFile: string): boolean {
  const second = readFileSync(specFile.replace(/^file:\/\//, ''), 'utf8').split('\n')[1] ?? '';
  return /^\/\/\s*@welcome\s*$/.test(second);
}

/** Spec files of a run: the `--spec` files when given, else the configured globs. */
function specFiles(patterns: string | string[] | undefined): string[] {
  const list = [patterns ?? []].flat(2);
  return list.flatMap((pattern) => globSync(pattern.replace(/^file:\/\//, '')));
}

export function makeConfig(
  specs: string[],
  overrides: Partial<Options.Testrunner> = {},
): Options.Testrunner & { capabilities: WebdriverIO.Capabilities[] } {
  let driver: ChildProcess | undefined;
  let tmp: string | undefined;

  // tauri-driver runs in its own process group: killing the group also stops WebKitWebDriver and
  // the app it started. Also stopped on exit and on Ctrl-C, where onComplete does not run.
  const stop = () => {
    if (driver?.pid) {
      try {
        process.kill(-driver.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    driver = undefined;
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  };

  const capability = {
    maxInstances: 1,
    'tauri:options': {
      application: join(root, 'target/release/relief'),
      args: [] as string[],
    },
  } as unknown as WebdriverIO.Capabilities;

  return {
    runner: 'local',
    specs,
    maxInstances: 1,
    capabilities: [capability],
    hostname: '127.0.0.1',
    port,
    path: '/',
    // The embedded app answers on the tauri scheme: relative `browser.url('/docs/…')` resolves there.
    baseUrl: 'tauri://localhost',
    logLevel: 'warn',
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: { ui: 'bdd', timeout: 120_000 },
    waitforTimeout: 10_000,
    onPrepare: async (runConfig, capabilities) => {
      tmp = mkdtempSync(join(tmpdir(), 'relief-e2e-'));
      // Each fixture asked by a spec (acme-shop only when a spec has no annotation) is built once per run, in <tmp>/<name> (the folder name is
      // the repository name shown in the top bar).
      const names = new Set(specFiles(runConfig.spec ?? runConfig.specs).map(fixtureOf));
      for (const name of names) {
        const repo = join(tmp, name);
        mkdirSync(repo);
        const build = spawnSync(
          join(root, 'target/release/relief-fixtures'),
          ['build', name, repo],
          {
            stdio: 'inherit',
          },
        );
        if (build.status !== 0) {
          stop();
          throw new Error(`relief-fixtures build ${name} failed`);
        }
      }
      // The app reads and writes its recents in a temporary folder, never in the real ~/.config.
      mkdirSync(join(tmp, 'config'));
      process.env['RELIEF_CONFIG_DIR'] = join(tmp, 'config');
      // Read by the workers (beforeSession) to find the fixtures.
      process.env['RELIEF_E2E_TMP'] = tmp;
      driver = spawn(
        'tauri-driver',
        ['--port', String(port), '--native-driver', findInPath('WebKitWebDriver')],
        {
          stdio: ['ignore', 'inherit', 'inherit'],
          env: { ...process.env, GDK_BACKEND: 'x11' },
          detached: true,
        },
      );
      process.once('exit', stop);
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          stop();
          process.exit(130);
        });
      }
      await waitForPort();
    },
    // One session per spec: the app opens the repository the spec asked for.
    beforeSession: (_config, caps, specs) => {
      const name = fixtureOf(specs[0] as string);
      const repo = join(process.env['RELIEF_E2E_TMP'] as string, name);
      process.env['RELIEF_E2E_REPO'] = repo;
      const options = (caps as unknown as Record<string, { args: string[] }>)['tauri:options'];
      const welcome = opensWithoutPath(specs[0] as string);
      // Welcome specs start without argument; the fixture is their only recent repository.
      writeFileSync(
        join(process.env['RELIEF_E2E_TMP'] as string, 'config', 'recents.json'),
        JSON.stringify({ entries: welcome ? [{ kind: 'repo', path: repo }] : [] }),
      );
      if (options)
        options.args = welcome
          ? []
          : name === defaultFixture && !opensWithoutRange(specs[0] as string)
            ? [repo, range]
            : [repo];
    },
    onComplete: () => stop(),
    ...overrides,
  };
}
