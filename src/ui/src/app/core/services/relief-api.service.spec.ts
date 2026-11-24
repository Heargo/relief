import { TestBed } from '@angular/core/testing';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReliefApiService } from './relief-api.service';

type Call = { cmd: string; args: Record<string, unknown> | undefined };

/** `invoke` goes through the mocked IPC, the only transport. */
function mockTauri(handler: (cmd: string, args?: Record<string, unknown>) => unknown): Call[] {
  const calls: Call[] = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> | undefined });
    return handler(cmd, args as Record<string, unknown> | undefined);
  });
  return calls;
}

describe('ReliefApiService', () => {
  let service: ReliefApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [] });
    service = TestBed.inject(ReliefApiService);
  });

  afterEach(() => {
    clearMocks();
  });

  it('meta invokes the meta command and returns its answer', async () => {
    const meta = { repo: 'acme', range: 'main...feat/promo-codes', branches: ['main'], tags: [] };
    const calls = mockTauri(() => meta);
    expect(await service.meta()).toEqual(meta);
    expect(calls.map((c) => c.cmd)).toEqual(['meta']);
  });

  it('recents invokes the recents command', async () => {
    const list = [{ kind: 'repo', path: '/work/acme', name: 'acme' }];
    const calls = mockTauri(() => list);
    expect(await service.recents()).toEqual(list);
    expect(calls).toEqual([{ cmd: 'recents', args: {} }]);
  });

  it('openRepo invokes open_repo with the path and returns the meta of the new session', async () => {
    const meta = { repo: 'acme', range: null, branches: ['main'], tags: [] };
    const calls = mockTauri(() => meta);
    expect(await service.openRepo('/work/acme')).toEqual(meta);
    expect(calls).toEqual([{ cmd: 'open_repo', args: { path: '/work/acme' } }]);
  });

  it('addWorkspaceRepo invokes add_workspace_repo with the repository and its labels (K13)', async () => {
    const meta = { repo: 'space', range: null, branches: [], tags: [] };
    const calls = mockTauri(() => meta);
    expect(await service.addWorkspaceRepo('/work/shop-api', ['back'])).toEqual(meta);
    expect(calls).toEqual([
      { cmd: 'add_workspace_repo', args: { repo: '/work/shop-api', labels: ['back'] } },
    ]);
  });

  it('openRepoAsWorkspace invokes open_repo_as_workspace with the repository and the folder (K13)', async () => {
    const meta = { repo: 'shop-web', range: null, branches: [], tags: [] };
    const calls = mockTauri(() => meta);
    expect(await service.openRepoAsWorkspace('/work/shop-web', '/work/space')).toEqual(meta);
    expect(calls).toEqual([
      { cmd: 'open_repo_as_workspace', args: { repo: '/work/shop-web', dir: '/work/space' } },
    ]);
  });

  it('pickRepoFolder answers the paths queued in window.__reliefE2ePicks, in order, without any dialog (K13, e2e only)', async () => {
    const holder = window as unknown as { __reliefE2ePicks?: string[] };
    holder.__reliefE2ePicks = ['/tmp/one', '/tmp/two'];
    try {
      expect(await service.pickRepoFolder()).toBe('/tmp/one');
      expect(await service.pickRepoFolder()).toBe('/tmp/two');
      expect(holder.__reliefE2ePicks).toEqual([]);
    } finally {
      delete holder.__reliefE2ePicks;
    }
  });

  it('openRepo rejects with the API message', async () => {
    mockTauri(() => {
      throw { code: 'not_a_repository', message: 'not a git repository: /tmp/x' };
    });
    await expect(service.openRepo('/tmp/x')).rejects.toThrow('not a git repository: /tmp/x');
  });

  it('openDocs invokes open_docs with the language', async () => {
    const calls = mockTauri(() => null);
    await service.openDocs('fr');
    expect(calls).toEqual([{ cmd: 'open_docs', args: { lang: 'fr' } }]);
  });

  it('openDocs rejects with the API message', async () => {
    mockTauri(() => {
      throw { code: 'bad_request', message: 'unknown docs language: de' };
    });
    await expect(service.openDocs('en')).rejects.toThrow('unknown docs language: de');
  });

  it('snapshot invokes snapshot with the rev', async () => {
    const answer = { graph: { nodes: [] }, meta: {} };
    const calls = mockTauri(() => answer);
    expect(await service.snapshot('main')).toEqual(answer);
    expect(calls).toEqual([{ cmd: 'snapshot', args: { rev: 'main' } }]);
  });

  it('diff invokes diff with the range', async () => {
    const answer = { diff: { nodes: [] } };
    const calls = mockTauri(() => answer);
    expect(await service.diff('main...feat/promo-codes')).toEqual(answer);
    expect(calls).toEqual([{ cmd: 'diff', args: { range: 'main...feat/promo-codes' } }]);
  });

  it('diff without a range sends no range', async () => {
    const calls = mockTauri(() => ({}));
    await service.diff(null);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('diff');
    expect(calls[0].args?.['range'] ?? null).toBeNull();
  });

  it('reviewSummary invokes review_summary with the range', async () => {
    const answer = { signatures: [] };
    const calls = mockTauri(() => answer);
    expect(await service.reviewSummary('main...feat/promo-codes')).toEqual(answer);
    expect(calls).toEqual([{ cmd: 'review_summary', args: { range: 'main...feat/promo-codes' } }]);
  });

  it('code invokes code with node, side and range', async () => {
    const calls = mockTauri(() => 'export function computeTotal() {}');
    const text = await service.code('pkg:a::file:b.ts', 'head', 'main...feat/promo-codes');
    expect(text).toBe('export function computeTotal() {}');
    expect(calls).toEqual([
      {
        cmd: 'code',
        args: { node: 'pkg:a::file:b.ts', side: 'head', range: 'main...feat/promo-codes' },
      },
    ]);
  });

  it('code without a range sends no range', async () => {
    const calls = mockTauri(() => '');
    await service.code('pkg:a::file:b.ts', 'base');
    expect(calls[0].cmd).toBe('code');
    expect(calls[0].args?.['node']).toBe('pkg:a::file:b.ts');
    expect(calls[0].args?.['side']).toBe('base');
    expect(calls[0].args?.['range'] ?? null).toBeNull();
  });

  it('relays an ApiError as an Error with its message', async () => {
    mockTauri(() => {
      throw { code: 'unknown_ref', message: "unknown revision 'nope'" };
    });
    const error = await service.snapshot('nope').then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("unknown revision 'nope'");
  });

  it('relays the ApiError of every command', async () => {
    mockTauri(() => {
      throw { code: 'invalid_range', message: 'bad range' };
    });
    for (const call of [
      () => service.meta(),
      () => service.diff('x'),
      () => service.reviewSummary('x'),
      () => service.code('n', 'head'),
    ]) {
      await expect(call()).rejects.toThrow('bad range');
    }
  });
});
