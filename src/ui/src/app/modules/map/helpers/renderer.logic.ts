export type Renderer = 'dom' | 'canvas';

const KEY = 'relief.renderer';

function parse(value: string | null): Renderer | null {
  return value === 'dom' || value === 'canvas' ? value : null;
}

/** The engine that draws the map: `?renderer=` wins over the stored preference; `dom` by default. */
export function chooseRenderer(
  search: string,
  storage: { getItem(key: string): string | null },
): Renderer {
  const fromQuery = parse(new URLSearchParams(search).get('renderer'));
  if (fromQuery) return fromQuery;
  try {
    return parse(storage.getItem(KEY)) ?? 'dom';
  } catch {
    return 'dom';
  }
}
