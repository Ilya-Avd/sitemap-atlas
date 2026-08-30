import { describe, expect, it } from 'vitest';
import { buildTree, summarize } from '../src/tree.js';
import type { SitemapEntry, TreeNode } from '../src/types.js';

const entries = (...locs: string[]): SitemapEntry[] => locs.map((loc) => ({ loc }));
const names = (node: TreeNode): string[] => node.children.map((c) => c.name);
const at = (node: TreeNode, ...path: string[]): TreeNode => {
  let current = node;
  for (const name of path) {
    const next = current.children.find((c) => c.name === name);
    if (!next) throw new Error(`no child "${name}" under ${current.path}`);
    current = next;
  }

  return current;
};

describe('buildTree', () => {
  it('roots the tree at the host and branches on path segments', () => {
    const tree = buildTree(entries('https://e.com/', 'https://e.com/a/b', 'https://e.com/a/c'));
    expect(tree.name).toBe('e.com');
    expect(tree.path).toBe('https://e.com');
    expect(tree.entry?.loc).toBe('https://e.com/');
    expect(names(tree)).toEqual(['a']);
    expect(names(at(tree, 'a'))).toEqual(['b', 'c']);
  });

  it('counts every entry in the subtree', () => {
    const tree = buildTree(entries('https://e.com/a/b', 'https://e.com/a/c', 'https://e.com/d'));
    expect(tree.count).toBe(3);
    expect(at(tree, 'a').count).toBe(2);
    expect(at(tree, 'd').count).toBe(1);
  });

  it('treats a folder with no URL of its own as a branch without an entry', () => {
    const tree = buildTree(entries('https://e.com/a/b'));
    expect(at(tree, 'a').entry).toBeUndefined();
    expect(at(tree, 'a', 'b').entry?.loc).toBe('https://e.com/a/b');
  });

  it('maps a trailing slash onto the folder node itself', () => {
    const tree = buildTree(entries('https://e.com/a/', 'https://e.com/a/b'));
    expect(at(tree, 'a').entry?.loc).toBe('https://e.com/a/');
    expect(at(tree, 'a').count).toBe(2);
  });

  it('keeps both copies when a page is listed twice', () => {
    const tree = buildTree(entries('https://e.com/a', 'https://e.com/a/'));
    expect(at(tree, 'a').count).toBe(2);
    expect(summarize(tree).urls).toBe(2);
  });

  it('keeps query strings on the last segment so they do not merge', () => {
    const tree = buildTree(entries('https://e.com/s?q=a', 'https://e.com/s?q=b'));
    expect(names(tree).sort()).toEqual(['s?q=a', 's?q=b']);
  });

  it('decodes percent-encoded segments for display', () => {
    const tree = buildTree(entries('https://e.com/%D0%B1%D0%BB%D0%BE%D0%B3/post'));
    expect(names(tree)).toEqual(['блог']);
  });

  it('skips entries whose loc is not a URL', () => {
    const tree = buildTree(entries('https://e.com/a', 'nonsense', ''));
    expect(tree.count).toBe(1);
  });

  it('groups several hosts under a synthetic root', () => {
    const tree = buildTree(entries('https://a.com/x', 'https://b.com/y'));
    expect(tree.name).toBe('2 hosts');
    expect(names(tree)).toEqual(['a.com', 'b.com']);
    expect(at(tree, 'a.com').depth).toBe(1);
    expect(at(tree, 'a.com', 'x').depth).toBe(2);
  });

  it('treats http and https as separate origins', () => {
    const tree = buildTree(entries('http://e.com/a', 'https://e.com/b'));
    expect(tree.children).toHaveLength(2);
  });

  it('merges single-child chains when asked', () => {
    const tree = buildTree(entries('https://e.com/blog/2026/01/post'), { collapse: true });
    expect(names(tree)).toEqual(['blog/2026/01/post']);
    expect(tree.count).toBe(1);
  });

  it('does not collapse through a folder that is itself a page', () => {
    const tree = buildTree(entries('https://e.com/blog/', 'https://e.com/blog/2026/post'), {
      collapse: true,
    });
    expect(names(tree)).toEqual(['blog']);
    expect(names(at(tree, 'blog'))).toEqual(['2026/post']);
  });

  it('folds anything past maxDepth into a truncated count', () => {
    const tree = buildTree(entries('https://e.com/a/b/c', 'https://e.com/a/b/d'), { maxDepth: 2 });
    expect(at(tree, 'a', 'b').children).toEqual([]);
    expect(at(tree, 'a', 'b').truncated).toBe(2);
    expect(tree.count).toBe(2);
  });

  it('sorts by name, then by count on request', () => {
    const list = entries('https://e.com/b', 'https://e.com/a/1', 'https://e.com/a/2');
    expect(names(buildTree(list))).toEqual(['a', 'b']);
    expect(names(buildTree(list, { sortBy: 'count' }))).toEqual(['a', 'b']);
    expect(names(buildTree(list, { sortBy: 'count', order: 'asc' }))).toEqual(['b', 'a']);
  });

  it('sorts numerically so page-2 comes before page-10', () => {
    const tree = buildTree(entries('https://e.com/page-10', 'https://e.com/page-2'));
    expect(names(tree)).toEqual(['page-2', 'page-10']);
  });
});

describe('summarize', () => {
  it('reports totals, depth and the lastmod window', () => {
    const stats = summarize(
      buildTree([
        { loc: 'https://e.com/', lastmod: '2026-01-01' },
        { loc: 'https://e.com/a/b', lastmod: '2024-06-30' },
        { loc: 'https://e.com/a/c', images: 3 },
      ]),
    );
    expect(stats.urls).toBe(3);
    expect(stats.folders).toBe(1);
    expect(stats.maxDepth).toBe(2);
    expect(stats.hosts).toEqual(['e.com']);
    expect(stats.withLastmod).toBe(2);
    expect(stats.oldest).toBe('2024-06-30');
    expect(stats.newest).toBe('2026-01-01');
    expect(stats.images).toBe(3);
  });

  it('lists every host it saw', () => {
    const stats = summarize(buildTree(entries('https://a.com/x', 'https://b.com/y')));
    expect(stats.hosts).toEqual(['a.com', 'b.com']);
  });
});

describe('buildTree depth bookkeeping', () => {
  it('reindexes depth after collapsing, so it matches the real level', () => {
    const tree = buildTree(entries('https://e.com/a/b/c1', 'https://e.com/a/b/c2'), {
      collapse: true,
    });
    const check = (node: TreeNode, level: number): void => {
      expect(node.depth).toBe(level);
      for (const child of node.children) check(child, level + 1);
    };
    check(tree, 0);
    expect(summarize(tree).maxDepth).toBe(2);
  });
});
