import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageBusiness } from '../../../../core/business/language.business';
import type { ReviewSummary } from '../../../../core/models/contract';
import { splitViolations } from '../../../rules/helpers/rules.logic';
import { nodeLabel } from '../../helpers/review-summary.logic';

type FileKind = 'added' | 'removed' | 'moved' | 'format-only';

interface FileRow {
  kind: FileKind;
  path: string;
  from: string | null;
  nodeId: string;
}

/** The right panel without selection: structural changes of the range, each row selects its node. */
@Component({
  selector: 'app-structural-overview',
  imports: [TranslatePipe],
  templateUrl: './structural-overview.component.html',
  styleUrl: './structural-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructuralOverviewComponent {
  private readonly language = inject(LanguageBusiness);

  readonly summary = input.required<ReviewSummary>();
  readonly nodeSelect = output<string>();

  protected readonly label = nodeLabel;
  protected readonly violations = computed(() => splitViolations(this.summary().violations));

  protected readonly fileRows = computed<FileRow[]>(() => {
    const summary = this.summary();
    const row = (
      kind: FileKind,
      path: string,
      nodeId: string,
      from: string | null = null,
    ): FileRow => ({
      kind,
      path,
      from,
      nodeId,
    });
    return [
      ...summary.addedFiles.map((f) => row('added', f.path, f.node)),
      ...summary.removedFiles.map((f) => row('removed', f.path, f.node)),
      ...summary.movedFiles.map((m) => row('moved', m.to, m.node, m.from)),
      ...summary.formatOnlyFiles.map((f) => row('format-only', f.path, f.node)),
    ];
  });

  protected select(id: string): void {
    this.nodeSelect.emit(id);
  }

  protected plural(key: string, count: number): string {
    return this.language.t(count === 1 ? `${key}_one` : key, { count });
  }
}
