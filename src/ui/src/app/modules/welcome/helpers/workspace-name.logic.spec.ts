import { describe, expect, it } from 'vitest';

import { workspaceNameOf } from './workspace-name.logic';

describe('workspaceNameOf', () => {
  it('is the name of the folder', () => {
    expect(workspaceNameOf('/work/shop')).toBe('shop');
  });

  it('ignores a trailing separator', () => {
    expect(workspaceNameOf('/work/shop/')).toBe('shop');
  });

  it('reads Windows paths', () => {
    expect(workspaceNameOf('C:\\work\\shop')).toBe('shop');
  });

  it('falls back to "workspace" for a root folder', () => {
    expect(workspaceNameOf('/')).toBe('workspace');
  });
});
