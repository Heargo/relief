import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { InputText } from '@openng/optimus-ui/inputtext';

import { WORKTREE_RANGE } from '../../../review/helpers/diff-layer.logic';
import { shortRef } from '../../../review/helpers/range.logic';
import { RepoComparisonsBusiness } from '../../business/repo-comparisons.business';
import { comparisonOptions, type ComparisonSide } from '../../helpers/repo-comparisons.logic';

/** The left panel as a menu: the comparison (source merged into destination) of each repository. */
@Component({
  selector: 'app-repo-comparisons',
  imports: [TranslatePipe, InputText],
  templateUrl: './repo-comparisons.component.html',
  styleUrl: './repo-comparisons.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoComparisonsComponent {
  protected readonly state = inject(RepoComparisonsBusiness);
  protected readonly worktree = WORKTREE_RANGE;
  protected readonly short = shortRef;

  protected options(side: ComparisonSide, branches: readonly string[]): string[] {
    return comparisonOptions(side, branches, this.state.query());
  }

  protected isOpen(name: string, side: ComparisonSide): boolean {
    const open = this.state.open();
    return open?.name === name && open.side === side;
  }

  @HostListener('window:keydown.escape')
  protected onEscape(): void {
    this.state.close();
  }
}
