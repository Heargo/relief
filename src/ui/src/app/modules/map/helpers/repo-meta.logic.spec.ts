import { describe, expect, it } from 'vitest';

import type { SnapshotMeta } from '../../../core/models/contract';
import { repoMetaLine } from './repo-meta.logic';

function meta(adapters: string[], detector: string): SnapshotMeta {
  return {
    adapters,
    cachedFiles: 0,
    commit: '0123456789abcdef0123456789abcdef01234567',
    date: '2026-01-01T00:00:00Z',
    detector,
    ignoredFiles: 0,
    parsedFiles: 1,
    warnings: [],
  };
}

describe('repoMetaLine', () => {
  it('joins the language and the detector as acme-shop reports them', () => {
    expect(repoMetaLine(meta(['typescript'], 'workspaces'))).toBe('TypeScript · workspaces');
  });

  it('lists several languages before the detector', () => {
    expect(repoMetaLine(meta(['typescript', 'python'], 'generic'))).toBe(
      'TypeScript · Python · generic',
    );
  });

  it('keeps the detector alone when no adapter ran', () => {
    expect(repoMetaLine(meta([], 'generic'))).toBe('generic');
  });

  it('keeps the languages alone when the detector is empty', () => {
    expect(repoMetaLine(meta(['typescript'], ''))).toBe('TypeScript');
  });

  it('is empty when there is nothing to say', () => {
    expect(repoMetaLine(meta([], ''))).toBe('');
  });

  it('shows an unknown adapter name as it is', () => {
    expect(repoMetaLine(meta(['zig'], 'generic'))).toBe('zig · generic');
  });
});
