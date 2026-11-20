import { describe, expect, it } from 'vitest';

import type { ChangedSymbols } from './reading-order.logic';
import {
  commitDiffRange,
  commitProgress,
  commitScope,
  commitsOfFile,
  isEdgeInScope,
  isNodeInScope,
  stepCommit,
  type CommitEntry,
} from './commit-replay.logic';

const SESSION = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts';
const PAYMENT = 'pkg:@acme/api/billing::file:apps/api/billing/payment.ts';
const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';
const DISCOUNT = 'pkg:@acme/api/billing::file:apps/api/billing/discount.ts';
const REFRESH = `${SESSION}::sym:SessionStore.refresh`;
const TOTAL = `${INVOICE}::sym:computeTotal`;
const CLIENT_ERROR = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts::sym:HttpError';

const entry = (sha: string, message: string, files: string[], otherFiles = 0): CommitEntry => ({
  commit: sha,
  short: sha.slice(0, 7),
  message,
  files: files.map((id) => ({ id, reasons: [] })),
  otherFiles,
});

const DB = entry('1111111aaaa', 'feat(db): table discounts et repo', [DISCOUNT]);
const BILLING = entry('2222222bbbb', 'feat(billing): remise dans computeTotal', [
  DISCOUNT,
  INVOICE,
]);
const AUTH = entry('3333333cccc', 'refactor(auth): refresh() renvoie null au lieu de lever', [
  SESSION,
  PAYMENT,
]);
const CHECKOUT = entry('4444444dddd', 'feat(checkout): champ code promo', [INVOICE], 2);
const COMMITS = [DB, BILLING, AUTH, CHECKOUT];

const edge = (from: string, to: string, commit: string | null, status = 'added') =>
  ({ from, to, kind: 'imports', status, commit }) as never;

describe('map filter on one commit', () => {
  const edges = [
    edge(PAYMENT, CLIENT_ERROR, AUTH.commit),
    edge(INVOICE, DISCOUNT, BILLING.commit),
    edge(INVOICE, SESSION, null, 'removed'),
  ];

  it('colours the files of the commit, their symbols and their containers', () => {
    const scope = commitScope(AUTH, edges);
    expect(isNodeInScope(scope, SESSION)).toBe(true);
    expect(isNodeInScope(scope, PAYMENT)).toBe(true);
    expect(isNodeInScope(scope, REFRESH)).toBe(true);
    expect(isNodeInScope(scope, 'pkg:@acme/api/auth')).toBe(true);
    expect(isNodeInScope(scope, 'pkg:@acme/api/billing')).toBe(true);
  });

  it('does not colour the files and symbols of other commits', () => {
    const scope = commitScope(AUTH, edges);
    expect(isNodeInScope(scope, INVOICE)).toBe(false);
    expect(isNodeInScope(scope, TOTAL)).toBe(false);
    expect(isNodeInScope(scope, DISCOUNT)).toBe(false);
    expect(isNodeInScope(scope, 'pkg:@acme/web')).toBe(false);
  });

  it('a container is not coloured just because its id is a prefix of a longer id', () => {
    const scope = commitScope(AUTH, edges);
    expect(isNodeInScope(scope, 'pkg:@acme/api/auth-legacy')).toBe(false);
  });

  it('colours only the edges whose first commit is the selected one', () => {
    const scope = commitScope(AUTH, edges);
    expect(isEdgeInScope(scope, edges[0])).toBe(true);
    expect(isEdgeInScope(scope, edges[1])).toBe(false);
    expect(isEdgeInScope(scope, edges[2])).toBe(false);
  });

  it('a commit with no edge of its own colours no edge', () => {
    const scope = commitScope(DB, edges);
    expect(edges.some((e) => isEdgeInScope(scope, e))).toBe(false);
  });
});

describe('seen by commit, on the seen state of the whole range', () => {
  const changed: ChangedSymbols = {
    [DISCOUNT]: [`${DISCOUNT}::sym:applyPromo`],
    [INVOICE]: [TOTAL],
    [SESSION]: [REFRESH],
    [PAYMENT]: [],
  };

  it('counts the seen files of the commit over its files', () => {
    expect(commitProgress(AUTH, [REFRESH], changed)).toEqual({ seen: 1, total: 2 });
    expect(commitProgress(AUTH, [REFRESH, PAYMENT], changed)).toEqual({ seen: 2, total: 2 });
    expect(commitProgress(AUTH, [], changed)).toEqual({ seen: 0, total: 2 });
  });

  it('a file seen once counts as seen under every commit that lists it', () => {
    const seen = [TOTAL];
    expect(commitProgress(BILLING, seen, changed)).toEqual({ seen: 1, total: 2 });
    expect(commitProgress(CHECKOUT, seen, changed)).toEqual({ seen: 1, total: 1 });
  });

  it('files of other commits do not count', () => {
    expect(commitProgress(DB, [REFRESH, PAYMENT], changed)).toEqual({ seen: 0, total: 1 });
  });
});

describe('a file listed under several commits', () => {
  it('lists every commit that touches the file, oldest first', () => {
    expect(commitsOfFile(COMMITS, DISCOUNT)).toEqual([DB.commit, BILLING.commit]);
    expect(commitsOfFile(COMMITS, INVOICE)).toEqual([BILLING.commit, CHECKOUT.commit]);
    expect(commitsOfFile(COMMITS, SESSION)).toEqual([AUTH.commit]);
    expect(commitsOfFile(COMMITS, 'pkg:@acme/web::file:apps/web/x.ts')).toEqual([]);
  });

  it('the diff of a commit is asked on parent..commit, the parent being the previous commit', () => {
    expect(commitDiffRange(COMMITS, AUTH.commit, 'basebase')).toBe(
      `${BILLING.commit}..${AUTH.commit}`,
    );
  });

  it('the parent of the first commit is the base of the range', () => {
    expect(commitDiffRange(COMMITS, DB.commit, 'basebase')).toBe(`basebase..${DB.commit}`);
  });

  it('an unknown commit has no range', () => {
    expect(commitDiffRange(COMMITS, 'nope', 'basebase')).toBeNull();
  });
});

describe('n and p between commits', () => {
  it('n goes to the next commit, p to the previous one', () => {
    expect(stepCommit(COMMITS, BILLING.commit, 1)).toBe(AUTH.commit);
    expect(stepCommit(COMMITS, BILLING.commit, -1)).toBe(DB.commit);
  });

  it('with no commit selected, n selects the first and p the last', () => {
    expect(stepCommit(COMMITS, null, 1)).toBe(DB.commit);
    expect(stepCommit(COMMITS, null, -1)).toBe(CHECKOUT.commit);
  });

  it('stops at the ends and handles an empty list', () => {
    expect(stepCommit(COMMITS, CHECKOUT.commit, 1)).toBe(CHECKOUT.commit);
    expect(stepCommit(COMMITS, DB.commit, -1)).toBe(DB.commit);
    expect(stepCommit([], null, 1)).toBeNull();
  });
});
