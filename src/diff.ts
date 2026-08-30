import type { SitemapEntry, UrlStatus } from './types.js';

export interface DiffOptions {
  /**
   * Treat a changed `lastmod` as a change. Off by default: many generators
   * rewrite it on every build, which would mark the whole site as changed.
   */
  lastmod?: boolean;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  /** Share of the previous URLs that are gone, 0..1. */
  removedShare: number;
}

export interface SitemapDiff {
  /**
   * Every URL from either side, each tagged. Removed entries are included so
   * the tree can show what used to be there — that is the point of a diff.
   */
  entries: SitemapEntry[];
  summary: DiffSummary;
}

/**
 * Compare two sets of sitemap entries.
 *
 * URLs are matched exactly: a sitemap is a list of addresses, and a changed
 * address is a different page as far as anything downstream is concerned.
 */
export function diffSitemaps(
  before: SitemapEntry[],
  after: SitemapEntry[],
  options: DiffOptions = {},
): SitemapDiff {
  const { lastmod = false } = options;

  const previous = new Map<string, SitemapEntry>();
  for (const entry of before) previous.set(entry.loc, entry);

  const entries: SitemapEntry[] = [];
  const summary: DiffSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    removedShare: 0,
  };

  const seen = new Set<string>();
  for (const entry of after) {
    if (seen.has(entry.loc)) continue;
    seen.add(entry.loc);

    const old = previous.get(entry.loc);
    let status: UrlStatus;
    if (!old) {
      status = 'added';
      summary.added++;
    } else if (lastmod && old.lastmod !== entry.lastmod) {
      status = 'changed';
      summary.changed++;
    } else {
      status = 'unchanged';
      summary.unchanged++;
    }
    entries.push({ ...entry, status });
  }

  for (const [loc, entry] of previous) {
    if (seen.has(loc)) continue;
    entries.push({ ...entry, status: 'removed' });
    summary.removed++;
  }

  summary.removedShare = previous.size ? summary.removed / previous.size : 0;

  return { entries, summary };
}
