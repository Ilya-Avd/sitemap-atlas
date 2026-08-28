import { describe, expect, it } from 'vitest';
import { loadSitemap } from '../src/load.js';
import { buildTree, summarize } from '../src/tree.js';
import type { SitemapEntry } from '../src/types.js';

/** Both guards below cover crashes that only appear well past the spec limits. */
describe('scale', () => {
  it('flattens a document larger than the argument limit', async () => {
    // `entries.push(...doc.entries)` throws RangeError past ~125k arguments.
    const count = 150_000;
    const urls = new Array(count);
    for (let i = 0; i < count; i++) urls[i] = `<url><loc>https://e.com/p/${i}</loc></url>`;
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;

    const sitemap = await loadSitemap(xml);
    expect(sitemap.entries).toHaveLength(count);
    expect(sitemap.entries[count - 1]?.loc).toBe(`https://e.com/p/${count - 1}`);
  });

  it('builds a flat folder in linear time', () => {
    // Scanning children instead of indexing them made this quadratic: 50k
    // siblings took minutes. The bound is loose enough not to flake, tight
    // enough that a return to quadratic cannot pass.
    const count = 50_000;
    const entries: SitemapEntry[] = new Array(count);
    for (let i = 0; i < count; i++) entries[i] = { loc: `https://e.com/catalog/sku-${i}` };

    const started = Date.now();
    const tree = buildTree(entries);
    const took = Date.now() - started;

    expect(tree.children[0]?.children).toHaveLength(count);
    expect(summarize(tree).urls).toBe(count);
    expect(took).toBeLessThan(5000);
  });
});
