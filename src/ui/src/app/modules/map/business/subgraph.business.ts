import { effect, inject, Injectable, untracked } from '@angular/core';

import { ReliefApiService } from '../../../core/services/relief-api.service';
import { resultOfHit, type SearchResult } from '../helpers/search.logic';
import { MapBusiness } from './map.business';
import { RepoBusiness } from './repo.business';

const SEARCH_LIMIT = 8;

/**
 * The map holds at most a budget of nodes: the content of a container comes when the user zooms
 * into it, and a search asks the core, which knows the nodes that are not loaded.
 */
@Injectable()
export class SubgraphBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly repo = inject(RepoBusiness);
  private readonly map = inject(MapBusiness);

  constructor() {
    effect(() => {
      const id = this.map.containerToLoad();
      if (id) untracked(() => void this.open(id));
    });
  }

  /** Loads a closed container, then frames it. */
  async open(id: string): Promise<void> {
    if (await this.repo.expand(id)) this.map.whenShown(() => this.map.dive(id));
  }

  /** Selects and frames a node, loading what holds it first when it is not in the graph. */
  async reveal(id: string): Promise<void> {
    if (!this.map.hasNode(id)) {
      if (!(await this.repo.reveal(id))) return;
      this.map.whenShown(() => this.map.selectResult(id));
      return;
    }
    this.map.selectResult(id);
  }

  /** The best nodes of the head of `range` matching `query`, asked to the core; null when it cannot answer. */
  async search(query: string, range: string | null): Promise<SearchResult[] | null> {
    if (!query.trim()) return null;
    try {
      const found = await this.api.search(query, SEARCH_LIMIT, range);
      return found.hits.map(resultOfHit);
    } catch {
      return null;
    }
  }
}
