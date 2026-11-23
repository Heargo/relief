import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Edge,
  MetaResponse,
  Node,
  NodeKind,
  SnapshotResponse,
} from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { MapBusiness } from './map.business';

// U30: at the Symbols level the edges stop at the files; the selected node's go down to the symbols.

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

function call(from: string, to: string): Edge {
  return { from, to, kind: 'calls', precision: 'resolved' };
}

const WEB = 'pkg:@acme/web';
const WEB_FILE = `${WEB}::file:Promo.tsx`;
const VALIDATE = `${WEB_FILE}::sym:validateCodeLocally`;
const RENDER = `${WEB_FILE}::sym:PromoCodeInput`;
const API = 'pkg:@acme/api';
const API_FILE = `${API}::file:checkout.ts`;
const CHECKOUT = `${API_FILE}::sym:checkout`;
const DB = 'pkg:@acme/db';
const DB_FILE = `${DB}::file:discountRepo.ts`;
const FIND = `${DB_FILE}::sym:findDiscountByCode`;
const CREATE = `${DB_FILE}::sym:createDiscount`;

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [
      call(VALIDATE, FIND),
      call(RENDER, CREATE),
      call(RENDER, VALIDATE),
      call(CHECKOUT, FIND),
    ],
    nodes: [
      node('pkg:acme', 'repo', null),
      node(WEB, 'service', 'pkg:acme'),
      node(WEB_FILE, 'file', WEB),
      node(VALIDATE, 'symbol', WEB_FILE),
      node(RENDER, 'symbol', WEB_FILE),
      node(API, 'service', 'pkg:acme'),
      node(API_FILE, 'file', API),
      node(CHECKOUT, 'symbol', API_FILE),
      node(DB, 'package', 'pkg:acme'),
      node(DB_FILE, 'file', DB),
      node(FIND, 'symbol', DB_FILE),
      node(CREATE, 'symbol', DB_FILE),
    ],
  },
  meta: {
    adapters: ['ts'],
    cachedFiles: 0,
    commit: '0123456789abcdef0123456789abcdef01234567',
    date: '2026-01-01T00:00:00Z',
    detector: 'workspace',
    ignoredFiles: 0,
    parsedFiles: 1,
    warnings: [],
  },
};

async function atSymbols(): Promise<MapBusiness> {
  const business = TestBed.inject(MapBusiness);
  business.setViewport(1000, 600);
  await business.load();
  business.setLevel(3);
  vi.advanceTimersByTime(1000);
  return business;
}

const ends = (business: MapBusiness) =>
  business.edges().map((e) => `${e.from} > ${e.to} x${e.count}`);

describe('MapBusiness, edges at the shown level', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    TestBed.configureTestingModule({
      providers: [
        MapBusiness,
        {
          provide: ReliefApiService,
          useValue: {
            meta: vi.fn().mockResolvedValue(META),
            snapshot: vi.fn().mockResolvedValue(SNAPSHOT),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('at the Symbols level without selection, the edges are the pairs of files', async () => {
    const business = await atSymbols();
    expect(business.level()).toBe(3);
    expect(ends(business)).toEqual([`${WEB_FILE} > ${DB_FILE} x2`, `${API_FILE} > ${DB_FILE} x1`]);
  });

  it('with a file selected, its edges go down to the symbols and the others stay on files', async () => {
    const business = await atSymbols();
    business.selectNode(WEB_FILE);
    expect(ends(business)).toEqual([
      `${VALIDATE} > ${FIND} x1`,
      `${RENDER} > ${CREATE} x1`,
      `${RENDER} > ${VALIDATE} x1`,
      `${API_FILE} > ${DB_FILE} x1`,
    ]);
  });

  it('with a symbol selected, only its own edges go down to the symbols', async () => {
    const business = await atSymbols();
    business.selectNode(CHECKOUT);
    expect(ends(business)).toEqual([`${WEB_FILE} > ${DB_FILE} x2`, `${CHECKOUT} > ${FIND} x1`]);
  });

  it('folds back to the files once the selection is cleared', async () => {
    const business = await atSymbols();
    business.selectNode(WEB_FILE);
    business.deselectNode();
    expect(ends(business)).toEqual([`${WEB_FILE} > ${DB_FILE} x2`, `${API_FILE} > ${DB_FILE} x1`]);
  });

  it('keeps the symbol-to-symbol links in the aggregated edge (nothing is lost)', async () => {
    const business = await atSymbols();
    expect(business.edges()[0].links).toEqual([call(VALIDATE, FIND), call(RENDER, CREATE)]);
  });

  it('selecting an unfolded symbol edge keeps it, with its links, as the selected edge', async () => {
    const business = await atSymbols();
    business.selectNode(WEB_FILE);
    business.selectEdge(VALIDATE, FIND);
    expect(business.selectedEdge()?.from).toBe(VALIDATE);
    expect(business.selectedEdge()?.to).toBe(FIND);
    expect(business.selectedEdge()?.links).toEqual([call(VALIDATE, FIND)]);
  });

  it('selecting a package does not unfold the edges of all its symbols', async () => {
    const business = await atSymbols();
    business.selectNode(WEB);
    expect(ends(business)).toEqual([`${WEB_FILE} > ${DB_FILE} x2`, `${API_FILE} > ${DB_FILE} x1`]);
  });
});
