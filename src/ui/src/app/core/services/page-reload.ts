import { InjectionToken } from '@angular/core';

/**
 * Starts the page again, with none of its state: another repository was opened on a map already
 * shown, so nothing of the previous one (selection, sub-graph, diff, review) may stay.
 */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => () => window.location.reload(),
});
