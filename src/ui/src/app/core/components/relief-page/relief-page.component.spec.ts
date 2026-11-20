import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReliefApiService } from '../../services/relief-api.service';

import { TEST_PROVIDERS } from '../../../../testing/test-providers';
import { ReliefPageComponent } from './relief-page.component';

async function render(lang: 'en' | 'fr'): Promise<HTMLElement> {
  TestBed.configureTestingModule({ imports: [ReliefPageComponent], providers: TEST_PROVIDERS });
  await TestBed.inject(TranslateService).use(lang).toPromise();
  const fixture = TestBed.createComponent(ReliefPageComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ReliefPageComponent', () => {
  it('shows the relief title and the English tagline', async () => {
    const el = await render('en');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('relief');
    expect(el.textContent).toContain('Zoomable map of a git repository');
  });

  it('shows the French tagline', async () => {
    const el = await render('fr');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('relief');
    expect(el.textContent).toContain("Carte zoomable d'un dépôt git");
  });
});

describe('ReliefPageComponent help link', () => {
  const api = { openDocs: vi.fn() };

  async function renderWithApi(lang: 'en' | 'fr'): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [ReliefPageComponent],
      providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
    });
    await TestBed.inject(TranslateService).use(lang).toPromise();
    const fixture = TestBed.createComponent(ReliefPageComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => api.openDocs.mockReset().mockResolvedValue(undefined));

  it('opens the English docs on click when the UI is in English', async () => {
    const el = await renderWithApi('en');
    const help = [...el.querySelectorAll<HTMLElement>('a, button')].find(
      (e) => e.textContent?.trim() === 'Help',
    );
    expect(help).toBeDefined();
    help?.click();
    expect(api.openDocs).toHaveBeenCalledExactlyOnceWith('en');
  });

  it('opens the French docs on click when the UI is in French', async () => {
    const el = await renderWithApi('fr');
    const help = [...el.querySelectorAll<HTMLElement>('a, button')].find(
      (e) => e.textContent?.trim() === 'Aide',
    );
    expect(help).toBeDefined();
    help?.click();
    expect(api.openDocs).toHaveBeenCalledExactlyOnceWith('fr');
  });
});
