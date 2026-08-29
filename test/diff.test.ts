import { describe, expect, it } from 'vitest';
import { diffSitemaps } from '../src/diff.js';
import { buildTree } from '../src/tree.js';
import { renderText } from '../src/render/text.js';
import type { SitemapEntry } from '../src/types.js';

const at = (...locs: string[]): SitemapEntry[] => locs.map((loc) => ({ loc }));
const statuses = (entries: SitemapEntry[]): Record<string, string | undefined> =>
  Object.fromEntries(entries.map((e) => [e.loc, e.status]));

describe('diffSitemaps', () => {
  it('tags what appeared, what went and what stayed', () => {
    const diff = diffSitemaps(
      at('https://e.com/a', 'https://e.com/b'),
      at('https://e.com/b', 'https://e.com/c'),
    );
    expect(statuses(diff.entries)).toEqual({
      'https://e.com/b': 'unchanged',
      'https://e.com/c': 'added',
      'https://e.com/a': 'removed',
    });
    expect(diff.summary).toEqual({
      added: 1,
      removed: 1,
      changed: 0,
      unchanged: 1,
      removedShare: 0.5,
    });
  });

  it('keeps removed URLs in the result, so the tree can show them', () => {
    const diff = diffSitemaps(at('https://e.com/gone'), []);
    expect(diff.entries.map((e) => e.loc)).toEqual(['https://e.com/gone']);
    expect(diff.entries[0]?.status).toBe('removed');
  });

  it('ignores lastmod unless asked, because generators rewrite it every build', () => {
    const before = [{ loc: 'https://e.com/a', lastmod: '2026-01-01' }];
    const after = [{ loc: 'https://e.com/a', lastmod: '2026-08-01' }];
    expect(diffSitemaps(before, after).summary.changed).toBe(0);
    expect(diffSitemaps(before, after).summary.unchanged).toBe(1);
    expect(diffSitemaps(before, after, { lastmod: true }).summary.changed).toBe(1);
  });

  it('does not count a URL twice when the new sitemap lists it twice', () => {
    const diff = diffSitemaps([], at('https://e.com/a', 'https://e.com/a'));
    expect(diff.summary.added).toBe(1);
    expect(diff.entries).toHaveLength(1);
  });

  it('reports the share removed, and copes with an empty starting point', () => {
    expect(diffSitemaps(at('https://e.com/a', 'https://e.com/b'), []).summary.removedShare).toBe(1);
    expect(diffSitemaps([], at('https://e.com/a')).summary.removedShare).toBe(0);
  });

  it('carries the metadata of whichever side the URL came from', () => {
    const diff = diffSitemaps(
      [{ loc: 'https://e.com/gone', lastmod: '2026-01-01', priority: 0.4 }],
      [{ loc: 'https://e.com/new', changefreq: 'daily' }],
    );
    const removed = diff.entries.find((e) => e.status === 'removed');
    const added = diff.entries.find((e) => e.status === 'added');
    expect(removed?.priority).toBe(0.4);
    expect(added?.changefreq).toBe('daily');
  });
});

describe('a diff through the tree and the terminal renderer', () => {
  it('marks each line with what happened to it', () => {
    const diff = diffSitemaps(
      at('https://e.com/keep', 'https://e.com/drop'),
      at('https://e.com/keep', 'https://e.com/new'),
    );
    const out = renderText(buildTree(diff.entries));
    expect(out).toContain('- drop');
    expect(out).toContain('+ new');
    expect(out).toContain('keep');
    expect(out).not.toContain('+ keep');
  });
});
