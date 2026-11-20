import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  HostListener,
  inject,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { InputText } from '@openng/optimus-ui/inputtext';

import { RangePickerBusiness, type RangeSide } from '../../business/range-picker.business';
import { WORKTREE_RANGE } from '../../helpers/diff-layer.logic';
import { RANGE_TABS, shortRef } from '../../helpers/range.logic';

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

  constructor() {
    effect(() => this.filter()?.nativeElement.focus());
  }

  protected toggle(side: RangeSide): void {
    this.picker.openSide(side);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (this.picker.open() && target && !this.host.nativeElement.contains(target)) {
      this.picker.close();
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
