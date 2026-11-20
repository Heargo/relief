import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { EdgeUsagesResponse } from '../../../../core/models/contract';
import type { UsagesStatus } from '../../business/edge-usages.business';
import { groupUsages, hiddenUsages } from '../../helpers/edge-usages.logic';

/** Where the source of an edge uses what it imports: per file, per imported symbol. */
@Component({
  selector: 'app-edge-usages',
  imports: [TranslatePipe],
  templateUrl: './edge-usages.component.html',
  styleUrl: './edge-usages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EdgeUsagesComponent {
  readonly status = input.required<UsagesStatus>();
  readonly response = input<EdgeUsagesResponse | null>(null);
  readonly label = input.required<(id: string) => string>();
  /** A click on a usage: the source file and the line. */
  readonly openUsage = output<{ file: string; line: number }>();

  protected readonly files = computed(() => {
    const response = this.response();
    return response ? groupUsages(response) : [];
  });
  protected readonly hidden = computed(() => {
    const response = this.response();
    return response ? hiddenUsages(response) : 0;
  });
}
