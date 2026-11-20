import { computed, Injectable, signal } from '@angular/core';

import {
  clampPanelWidths,
  DEFAULT_PANEL_WIDTHS,
  isRightPanelWide,
  PanelWidths,
  readPanelWidths,
  toggleRightPanelWide,
  widthFromDrag,
  writePanelWidths,
} from '../helpers/panels.logic';

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Widths of the side panels: the user's preference, bounded to the window at display time. */
@Injectable()
export class PanelsBusiness {
  private readonly preferred = signal<PanelWidths>(this.load());
  private readonly windowWidth = signal(window.innerWidth);

  readonly widths = computed(() => clampPanelWidths(this.preferred(), this.windowWidth()));
  readonly rightWide = computed(() => isRightPanelWide(this.preferred().right, this.windowWidth()));

  windowResized(): void {
    this.windowWidth.set(window.innerWidth);
  }

  drag(side: 'left' | 'right', pointerX: number): void {
    const width = widthFromDrag(side, pointerX, window.innerWidth);
    this.preferred.update((p) => ({ ...p, [side]: width }));
  }

  reset(side: 'left' | 'right'): void {
    this.preferred.update((p) => ({ ...p, [side]: DEFAULT_PANEL_WIDTHS[side] }));
    this.save();
  }

  toggleRightWide(): void {
    this.preferred.update((p) => toggleRightPanelWide(p, window.innerWidth));
    this.save();
  }

  save(): void {
    const target = storage();
    if (target) writePanelWidths(target, this.preferred());
  }

  private load(): PanelWidths {
    const source = storage();
    return source ? readPanelWidths(source) : DEFAULT_PANEL_WIDTHS;
  }
}
