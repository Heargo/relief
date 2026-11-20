import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { InputText } from '@openng/optimus-ui/inputtext';

import { RangePickerBusiness, type RangeSide } from '../../business/range-picker.business';
import { WORKTREE_RANGE } from '../../helpers/diff-layer.logic';
import { RANGE_TABS, shortRef } from '../../helpers/range.logic';

/** How long the reading line stays after a range change. */
const READING_MS = 5000;

/** The range control of the top bar: `base ··· head ⇄`, the commit count and the popover of a side. */
@Component({
  selector: 'app-range-picker',
  imports: [TranslatePipe, InputText],
  templateUrl: './range-picker.component.html',
  styleUrl: './range-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RangePickerComponent {
  protected readonly picker = inject(RangePickerBusiness);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly filter = viewChild<ElementRef<HTMLInputElement>>('filter');

  protected readonly worktree = WORKTREE_RANGE;
  protected readonly tabs = RANGE_TABS;
  protected readonly short = shortRef;

  protected readonly readingVisible = signal(false);
  private fade: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => this.filter()?.nativeElement.focus());
    // A new reading line shows for a few seconds.
    effect(() => {
      const reading = this.picker.reading();
      untracked(() => (reading ? this.flash() : this.readingVisible.set(false)));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.fade));
  }

  protected showReading(): void {
    clearTimeout(this.fade);
    this.readingVisible.set(true);
  }

  protected hideReading(): void {
    clearTimeout(this.fade);
    this.readingVisible.set(false);
  }

  protected flash(): void {
    this.showReading();
    this.fade = setTimeout(() => this.readingVisible.set(false), READING_MS);
  }

  protected toggle(side: RangeSide): void {
    this.picker.openSide(side);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.hideReading();
      if (this.picker.open()) this.picker.close();
    }
  }

  protected onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        this.picker.move(1);
        break;
      case 'ArrowUp':
        this.picker.move(-1);
        break;
      case 'Enter':
        this.picker.pickActive();
        break;
      case 'Tab':
        this.picker.nextTab();
        break;
      default:
        return;
    }
    event.preventDefault();
  }
}
