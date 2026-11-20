import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective } from '@openng/optimus-ui/button';

import type { DiffResponse, GraphSnapshot } from '../../../../core/models/contract';
import { DiffPanelBusiness } from '../../business/diff-panel.business';
import {
  baseNodeId,
  formatOnlyHiddenLines,
  reasonTranslation,
  startLine,
} from '../../helpers/diff-panel.logic';
import { lineDiff } from '../../helpers/line-diff.logic';

/** Structural diff of the selected node: unified lines per symbol, and the verdict on its signature. */
@Component({
  selector: 'app-diff-panel',
  imports: [TranslatePipe, ButtonDirective],
  providers: [DiffPanelBusiness],
  templateUrl: './diff-panel.component.html',
  styleUrl: './diff-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffPanelComponent {
  protected readonly panel = inject(DiffPanelBusiness);

  readonly nodeId = input.required<string>();
  readonly diff = input.required<DiffResponse>();
  readonly range = input<string | null>(null);
  readonly baseGraph = input<GraphSnapshot | null>(null);
  readonly headGraph = input<GraphSnapshot | null>(null);
  readonly wide = input(false);
  readonly toggleWide = output<void>();

  protected readonly shownAnyway = signal(false);
  protected readonly hiddenLines = computed(() =>
    formatOnlyHiddenLines(this.nodeId(), this.diff()),
  );
  protected readonly textHidden = computed(
    () => this.hiddenLines() !== null && !this.shownAnyway(),
  );
  protected readonly blocks = computed(() =>
    this.panel.blocks().map((block) => {
      const signature =
        block.change?.status === 'modified' ? (block.change.signature ?? null) : null;
      return {
        ...block,
        lines: lineDiff(block.base, block.head, {
          oldStart: startLine(this.baseGraph(), baseNodeId(block.nodeId, this.diff())),
          newStart: startLine(this.headGraph(), block.nodeId),
        }),
        signature,
        reason: signature ? reasonTranslation(signature.reason) : null,
      };
    }),
  );

  constructor() {
    effect(() => {
      const [id, diff, range] = [this.nodeId(), this.diff(), this.range()];
      untracked(() => {
        this.shownAnyway.set(false);
        void this.panel.show(id, diff, range);
      });
    });
  }
}
