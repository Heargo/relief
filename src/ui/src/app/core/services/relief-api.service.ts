import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import type {
  ApiError,
  CommitReadingResponse,
  DiffResponse,
  EdgeUsagesResponse,
  ImpactResponse,
  LogResponse,
  MetaResponse,
  RepoComparison,
  CoChangeResponse,
  MetricsResponse,
  ReadingOrderResponse,
  ReviewState,
  Settings,
  ReviewSummary,
  RulesResponse,
  SearchResponse,
  SnapshotResponse,
} from '../models/contract';

/** An error of the API: its message, and its `code` (`no_session`, `not_a_repository`…). */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

/** A repository or workspace opened before. */
export interface RecentEntry {
  kind: 'repo' | 'workspace';
  path: string;
  name: string;
}

/**
 * The only place that calls the relief API: the Tauri commands of the desktop app.
 * Rejects with an `Error` carrying the API message.
 */
@Injectable({ providedIn: 'root' })
export class ReliefApiService {
  meta(): Promise<MetaResponse> {
    return this.command<MetaResponse>('meta');
  }

  /**
   * The graph of a ref. With a `budget`, at most that many nodes: the containers below are closed
   * (`childCount`) except those listed in `expand`, whose children are added.
   */
  snapshot(ref: string, budget?: number, expand?: readonly string[]): Promise<SnapshotResponse> {
    return this.command<SnapshotResponse>('snapshot', { rev: ref, budget, expand });
  }

  /**
   * Diff of a range (`A...B`); without one, the range the app was opened with. With a `budget`,
   * the response also carries `graph`, the review subgraph of the head (at most that many nodes).
   */
  diff(range: string | null, budget?: number, expand?: readonly string[]): Promise<DiffResponse> {
    return this.command<DiffResponse>('diff', { range, budget, expand });
  }

  /** The nodes of the head of a range (the opening one by default) matching a name, best first. */
  search(query: string, limit: number, range: string | null = null): Promise<SearchResponse> {
    return this.command<SearchResponse>('search', { range, query, limit });
  }

  /** Structural overview of a range (`A...B`); without one, the range the app was opened with. */
  reviewSummary(range: string | null): Promise<ReviewSummary> {
    return this.command<ReviewSummary>('review_summary', { range });
  }

  /** The architecture rules of the head of a range, with the text of relief.config.yaml. */
  rules(range: string): Promise<RulesResponse> {
    return this.command<RulesResponse>('rules', { range });
  }

  /** Symbols reached from `seeds` in the head of a range; without a range, the opening one. */
  impact(
    seeds: string[],
    direction: 'callers' | 'dependencies',
    maxDepth: number,
    followHttp: boolean,
    range: string | null = null,
  ): Promise<ImpactResponse> {
    return this.command<ImpactResponse>('impact', {
      seeds,
      direction,
      maxDepth,
      followHttp,
      range,
    });
  }

  /** Churn, complexity, owner and tests of the files and symbols of a ref, over a window of days. */
  metrics(rev: string, sinceDays: number | null = null): Promise<MetricsResponse> {
    return this.command<MetricsResponse>('metrics', { rev, sinceDays });
  }

  /** Pairs of files changed together in the history before a ref. */
  coChange(
    rev: string,
    sinceDays: number | null = null,
    minCommits: number | null = null,
  ): Promise<CoChangeResponse> {
    return this.command<CoChangeResponse>('co_change', { rev, sinceDays, minCommits });
  }

  /** Changed files or symbols of a range, in reading order. */
  readingOrder(
    granularity: 'file' | 'symbol',
    range: string | null = null,
  ): Promise<ReadingOrderResponse> {
    return this.command<ReadingOrderResponse>('reading_order', { granularity, range });
  }

  /** The commits of a range, oldest first, with the files to read in each. */
  commitReading(range: string | null = null): Promise<CommitReadingResponse> {
    return this.command<CommitReadingResponse>('commit_reading', { range });
  }

  /** The first-parent history of a revision, newest first, narrowed by a query on SHA and subject. */
  log(rev: string, limit: number, query: string | null = null): Promise<LogResponse> {
    return this.command<LogResponse>('log', { rev, limit, query });
  }

  /** What was marked seen in a range (empty when never saved). */
  reviewState(range: string): Promise<ReviewState> {
    return this.command<ReviewState>('review_state', { range });
  }

  /** Saves what is marked seen in a range. */
  setReviewState(range: string, state: ReviewState): Promise<void> {
    return this.command<void>('set_review_state', { range, state });
  }

  /** The comparison to open with: the opening range, else the saved defaults, else the working tree against main. */
  settings(): Promise<Settings> {
    return this.command<Settings>('settings');
  }

  /** Saves the default comparison. */
  setSettings(settings: Settings): Promise<void> {
    return this.command<void>('set_settings', { settings });
  }

  /** Source text of a file or symbol on one side of a range; without one, the range the app was opened with. */
  code(node: string, side: 'base' | 'head', range: string | null = null): Promise<string> {
    return this.command<string>('code', { node, side, range });
  }

  /** Where the source files of an edge use what they import from its target, on one side. */
  edgeUsages(
    from: string,
    to: string,
    side: 'base' | 'head',
    range: string | null = null,
  ): Promise<EdgeUsagesResponse> {
    return this.command<EdgeUsagesResponse>('edge_usages', { from, to, side, range });
  }

  /** Opens the embedded user docs (second window) in `fr` or `en`. */
  openDocs(lang: 'en' | 'fr'): Promise<void> {
    return this.command<void>('open_docs', { lang });
  }

  /** The repositories and workspaces opened before, most recent first. */
  recents(): Promise<RecentEntry[]> {
    return this.command<RecentEntry[]>('recents');
  }

  /** Starts the session on a repository (welcome screen); answers its meta. */
  openRepo(path: string): Promise<MetaResponse> {
    return this.command<MetaResponse>('open_repo', { path });
  }

  /** Starts the session on a workspace (its `.relief.json` file or its folder); answers its meta. */
  openWorkspace(path: string): Promise<MetaResponse> {
    return this.command<MetaResponse>('open_workspace', { path });
  }

  /** The labels a repository of the open workspace can carry. */
  workspaceLabels(): Promise<string[]> {
    return this.command<string[]>('workspace_labels');
  }

  /** Replaces the labels of a repository of the open workspace; answers its meta. */
  setRepoLabels(name: string, labels: string[]): Promise<MetaResponse> {
    return this.command<MetaResponse>('set_workspace_repo_labels', { name, labels });
  }

  /** The comparison of each repository of the open workspace. */
  workspaceComparisons(): Promise<RepoComparison[]> {
    return this.command<RepoComparison[]>('workspace_comparisons');
  }

  /**
   * Changes the comparison of one repository of the open workspace for the session and, with
   * `save`, in the workspace file; answers the comparisons of the workspace.
   */
  setRepoComparison(
    name: string,
    source: string,
    destination: string,
    save: boolean,
  ): Promise<RepoComparison[]> {
    return this.command<RepoComparison[]>('set_workspace_repo_comparison', {
      name,
      source,
      destination,
      save,
    });
  }

  /** The native folder picker; null when cancelled. */
  async pickRepoFolder(): Promise<string | null> {
    try {
      const chosen = await open({ directory: true, multiple: false });
      return typeof chosen === 'string' ? chosen : null;
    } catch (error) {
      throw new Error(messageOf(error));
    }
  }

  private async command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    try {
      return await invoke<T>(name, args);
    } catch (error) {
      throw new ApiRequestError(messageOf(error), codeOf(error));
    }
  }
}

function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as Partial<ApiError>;
    if (typeof code === 'string') return code;
  }
  return null;
}

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as Partial<ApiError>;
    if (typeof message === 'string') return message;
  }
  return error instanceof Error ? error.message : String(error);
}
