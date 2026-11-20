import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffResponse, GraphSnapshot } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { DiffBusiness } from './diff.business';

const A = 'main...first';
const B = 'main...second';
const REFRESH = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sha = (c: string) => c.repeat(40);

function diffOf(base: string, head: string): DiffResponse {
  return {
    diff: {
      base: sha(base),
      head: sha(head),
      files: [],
      nodes: [{ id: REFRESH, status: 'removed', linesAdded: 0, linesRemoved: 0 }],
      edges: [],
    },
    formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
    renames: [],
  };
}

const DIFF_A = diffOf('e', 'c');
const DIFF_B = diffOf('f', 'd');
const graphOf = (ref: string): GraphSnapshot => ({ commit: ref, nodes: [], edges: [] });

const api = { diff: vi.fn(), snapshot: vi.fn() };

/** The replies of each call are held until the spec releases them. */
function holdReplies() {
  const diffs = { [A]: deferred<DiffResponse>(), [B]: deferred<DiffResponse>() };
  const snapshots = new Map<string, Deferred<{ graph: GraphSnapshot; meta: object }>>();
  api.diff.mockReset().mockImplementation((range: string) => diffs[range as typeof A].promise);
  api.snapshot.mockReset().mockImplementation((ref: string) => {
    const reply = deferred<{ graph: GraphSnapshot; meta: object }>();
    snapshots.set(ref, reply);
    return reply.promise;
  });
  const releaseSnapshots = async (...refs: string[]) => {
    for (const ref of refs) {
      await vi.waitFor(() => expect(snapshots.has(ref)).toBe(true));
      snapshots.get(ref)?.resolve({ graph: graphOf(ref), meta: {} });
    }
  };
  return { diffs, releaseSnapshots };
}

describe('DiffBusiness, two range changes in a row', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DiffBusiness, provideRouter([]), { provide: ReliefApiService, useValue: api }],
    });
  });

  it('keeps the diff and the side graphs of the last range when the first answers late', async () => {
    const { diffs, releaseSnapshots } = holdReplies();
    const business = TestBed.inject(DiffBusiness);
    const first = business.setRange(A);
    const second = business.setRange(B);
    await vi.waitFor(() => expect(api.diff).toHaveBeenCalledTimes(2));

    diffs[B].resolve(DIFF_B);
    await releaseSnapshots(sha('f'), sha('d'));
    await second;
    diffs[A].resolve(DIFF_A);
    await releaseSnapshots(sha('e'), sha('c'));
    await first;

    expect(business.range()).toBe(B);
    expect(business.status()).toBe('ready');
    expect(business.diff()).toEqual(DIFF_B);
    expect(business.baseGraph()).toEqual(graphOf(sha('f')));
    expect(business.headGraph()).toEqual(graphOf(sha('d')));
  });

  it('publishes neither an error nor a status when the first fails late', async () => {
    const { diffs, releaseSnapshots } = holdReplies();
    const business = TestBed.inject(DiffBusiness);
    const first = business.setRange(A);
    const second = business.setRange(B);
    await vi.waitFor(() => expect(api.diff).toHaveBeenCalledTimes(2));

    diffs[B].resolve(DIFF_B);
    await releaseSnapshots(sha('f'), sha('d'));
    await second;
    diffs[A].reject(new Error('unknown ref'));
    await first;

    expect(business.status()).toBe('ready');
    expect(business.error()).toBeNull();
    expect(business.diff()).toEqual(DIFF_B);
    expect(business.headGraph()).toEqual(graphOf(sha('d')));
  });
});
