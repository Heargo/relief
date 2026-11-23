import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Checkbox } from '@openng/optimus-ui/checkbox';

import type { ReadingItem, ReadingReason, RepeatedChange } from '../../../../core/models/contract';
import type { CommitRow, ReadingMode } from '../../business/reading-order.business';
import { groupProposal } from '../../helpers/repeated-changes.logic';
import { nodeLabel } from '../../helpers/review-summary.logic';

/** The "reading order" section of the left panel: the numbered list, the seen boxes, the progress. */
@Component({
  selector: 'app-reading-order-section',
  imports: [TranslatePipe, FormsModule, Checkbox, NgTemplateOutlet],
  templateUrl: './reading-order-section.component.html',
  styleUrl: './reading-order-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadingOrderSectionComponent {
  readonly items = input.required<ReadingItem[]>();
  readonly mode = input<ReadingMode>('file');
  readonly selected = input<string | null>(null);
  readonly seenIds = input<ReadonlySet<string>>(new Set());
  readonly progress = input.required<{ seen: number; total: number }>();
  readonly persisted = input(true);
  /** Groups of files that make the same change: the entry stands for the whole group. */
  readonly repeated = input<RepeatedChange[]>([]);
  readonly commits = input<CommitRow[]>([]);
  readonly selectedCommit = input<string | null>(null);
  readonly modeChange = output<ReadingMode>();
  readonly nodeSelect = output<string>();
  readonly commitSelect = output<string>();
  readonly showAll = output<void>();
  readonly toggle = output<string>();
  readonly markNext = output<void>();
  /** The representative of a group whose members the user asks to mark seen. */
  readonly groupMark = output<string>();

  protected readonly modes: ReadingMode[] = ['file', 'symbol', 'commit'];
  protected readonly label = nodeLabel;
  protected readonly canMark = computed(() => {
    const id = this.selected();
    return id !== null && this.items().some((i) => i.id === id);
  });

  protected groupSize(id: string): number | null {
    return this.repeated().find((g) => g.representative === id)?.members.length ?? null;
  }

  /** Whether the group of `id` is seen at its representative only. */
  protected proposes(id: string): boolean {
    return groupProposal(this.repeated(), this.seenIds(), id) !== null;
  }

  protected reasonKey(reason: ReadingReason): string {
    return `review.reading.reasons.${reason.kind}`;
  }

  protected lines(reason: ReadingReason): { added: number; removed: number } | null {
    return reason.kind === 'lines' ? reason : null;
  }
}
