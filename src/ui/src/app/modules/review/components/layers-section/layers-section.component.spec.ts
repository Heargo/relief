import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { LayersSectionComponent } from './layers-section.component';

// Contract: `layer-toggle` buttons carry `data-layer` (diff | unchanged-edges | focus | impact) and
// `aria-pressed`; a shortcut is shown in a `layer-shortcut` child; each toggle emits `<name>Change`
// with the new boolean (diffChange, unchangedEdgesChange, focusChange, impactChange).
async function render(
  state: { diff?: boolean; unchangedEdges?: boolean; focus?: boolean; impact?: boolean } = {},
  lang: 'en' | 'fr' = 'en',
) {
  TestBed.configureTestingModule({ imports: [LayersSectionComponent], providers: TEST_PROVIDERS });
  await TestBed.inject(TranslateService).use(lang);
  const fixture = TestBed.createComponent(LayersSectionComponent);
  const ref = fixture.componentRef;
  ref.setInput('diff', state.diff ?? false);
  ref.setInput('unchangedEdges', state.unchangedEdges ?? false);
  ref.setInput('focus', state.focus ?? false);
  ref.setInput('impact', state.impact ?? false);
  const events: string[] = [];
  const c = fixture.componentInstance;
  c.diffChange.subscribe((v: boolean) => events.push(`diff:${v}`));
  c.unchangedEdgesChange.subscribe((v: boolean) => events.push(`unchangedEdges:${v}`));
  c.focusChange.subscribe((v: boolean) => events.push(`focus:${v}`));
  c.impactChange.subscribe((v: boolean) => events.push(`impact:${v}`));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const toggle = (layer: string) =>
    el.querySelector(`[data-testid="layer-toggle"][data-layer="${layer}"]`) as HTMLElement;
  const switchOf = (layer: string) => toggle(layer).closest('[role="switch"]') as HTMLElement;
  return { el, events, toggle, switchOf, fixture };
}

describe('LayersSectionComponent', () => {
  it('groups the four toggles in order', async () => {
    const { el } = await render();
    const layers = Array.from(el.querySelectorAll('[data-testid="layer-toggle"]')).map(
      (b) => (b as HTMLElement).dataset['layer'],
    );
    expect(layers).toEqual(['diff', 'unchanged-edges', 'focus', 'impact']);
  });

  it('shows the shortcut of focus and impact', async () => {
    const { toggle } = await render();
    expect(
      toggle('focus').querySelector('[data-testid="layer-shortcut"]')?.textContent?.trim(),
    ).toBe('f');
    expect(
      toggle('impact').querySelector('[data-testid="layer-shortcut"]')?.textContent?.trim(),
    ).toBe('i');
  });

  it('exposes each layer as a switch whose state is in aria-checked', async () => {
    const { switchOf } = await render({ focus: true, diff: true });
    for (const layer of ['diff', 'unchanged-edges', 'focus', 'impact']) {
      expect(switchOf(layer).getAttribute('role')).toBe('switch');
      expect(switchOf(layer).classList.contains('tog')).toBe(true);
    }
    expect(switchOf('focus').getAttribute('aria-checked')).toBe('true');
    expect(switchOf('diff').getAttribute('aria-checked')).toBe('true');
    expect(switchOf('impact').getAttribute('aria-checked')).toBe('false');
    expect(switchOf('unchanged-edges').getAttribute('aria-checked')).toBe('false');
  });

  it('toggles from the switch itself, with the same events as the label', async () => {
    const { switchOf, events } = await render({ diff: true });
    switchOf('diff').click();
    switchOf('impact').click();
    expect(events).toEqual(['diff:false', 'impact:true']);
  });

  it('describes each layer in a small line, in English and in French', async () => {
    const { el } = await render();
    const rows = Array.from(el.querySelectorAll('[data-testid="layer-description"]'));
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.textContent?.trim()).not.toBe('');
    TestBed.resetTestingModule();
    const fr = await render({}, 'fr');
    expect(
      fr.switchOf('diff').querySelector('[data-testid="layer-description"]')?.textContent?.trim(),
    ).toBe('couleurs ajouté / modifié / supprimé');
    expect(
      fr.switchOf('focus').querySelector('[data-testid="layer-description"]')?.textContent?.trim(),
    ).toBe('le changé + 1 saut, le reste estompé');
  });

  it('is a panel section with the common class', async () => {
    const { el } = await render();
    const section = el.querySelector('[data-testid="layers-section"]');
    expect(section?.classList.contains('sec')).toBe(true);
    expect(section?.querySelector('h3')).not.toBeNull();
  });

  it('emits the opposite value when a toggle is clicked', async () => {
    const { toggle, events } = await render({ diff: true });
    toggle('focus').click();
    toggle('diff').click();
    toggle('impact').click();
    toggle('unchanged-edges').click();
    expect(events).toEqual(['focus:true', 'diff:false', 'impact:true', 'unchangedEdges:true']);
  });

  it('is titled "Layers" in English and "Calques" in French', async () => {
    expect((await render()).el.querySelector('h3')?.textContent?.trim()).toBe('Layers');
    TestBed.resetTestingModule();
    expect((await render({}, 'fr')).el.querySelector('h3')?.textContent?.trim()).toBe('Calques');
  });
});
