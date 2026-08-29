import { afterEach, describe, expect, it, vi } from 'vitest';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSitemap } from '../src/load.js';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe('loadSitemap', () => {
  it('reads a local urlset', async () => {
    const sitemap = await loadSitemap(fixture('basic.xml'));
    expect(sitemap.entries).toHaveLength(7);
    expect(sitemap.sources).toHaveLength(1);
    expect(sitemap.errors).toEqual([]);
  });

  it('accepts raw XML instead of a path', async () => {
    const sitemap = await loadSitemap(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://e.com/a</loc></url></urlset>',
    );
    expect(sitemap.entries.map((e) => e.loc)).toEqual(['https://e.com/a']);
    expect(sitemap.sources).toEqual(['<inline>']);
  });

  it('gunzips a compressed sitemap', async () => {
    const sitemap = await loadSitemap(fixture('part-a.xml.gz'));
    expect(sitemap.entries).toHaveLength(2);
  });

  it('resolves index children to sibling files so it works offline', async () => {
    const sitemap = await loadSitemap(fixture('index.xml'), { offline: true });
    expect(sitemap.entries.map((e) => e.loc)).toEqual([
      'https://example.com/docs/getting-started',
      'https://example.com/docs/api/reference',
      'https://example.com/pricing',
      'https://shop.example.com/checkout',
    ]);
    expect(sitemap.refs).toHaveLength(3);
  });

  it('collects an unreachable child instead of throwing', async () => {
    const sitemap = await loadSitemap(fixture('index.xml'), { offline: true });
    expect(sitemap.errors).toEqual([
      { source: 'https://example.com/missing.xml', message: 'offline mode: no sibling file found' },
    ]);
  });

  it('stops at the index when told not to follow', async () => {
    const sitemap = await loadSitemap(fixture('index.xml'), { follow: false, offline: true });
    expect(sitemap.entries).toEqual([]);
    expect(sitemap.refs).toHaveLength(3);
    expect(sitemap.errors).toEqual([]);
  });

  it('honours maxUrls', async () => {
    const sitemap = await loadSitemap(fixture('basic.xml'), { maxUrls: 3 });
    expect(sitemap.entries).toHaveLength(3);
  });

  it('does not loop on an index that lists itself', async () => {
    const sitemap = await loadSitemap(fixture('loop.xml'), { offline: true });
    expect(sitemap.entries).toHaveLength(2);
  });

  it('throws when the root itself cannot be read', async () => {
    await expect(loadSitemap(fixture('does-not-exist.xml'))).rejects.toThrow(/cannot read/);
  });

  it('throws when the root is not a sitemap', async () => {
    await expect(loadSitemap('<rss><channel/></rss>')).rejects.toThrow(/not a sitemap/);
  });

  it('refuses to touch the network in offline mode', async () => {
    await expect(loadSitemap('https://example.com/sitemap.xml', { offline: true })).rejects.toThrow(
      /offline/,
    );
  });

  it('reports progress for every document it reads', async () => {
    const seen: Array<[string, number]> = [];
    await loadSitemap(fixture('index.xml'), {
      offline: true,
      onProgress: (source, urls) => seen.push([basename(source), urls]),
    });
    // Documents are read concurrently, so only the set is predictable here.
    expect(seen.sort()).toEqual([
      ['index.xml', 0],
      ['part-a.xml', 2],
      ['part-b.xml', 2],
    ]);
  });

  it('keeps entry order stable no matter which document finishes first', async () => {
    const runs = await Promise.all(
      [1, 2, 3].map(() => loadSitemap(fixture('index.xml'), { offline: true })),
    );
    const locs = runs.map((run) => run.entries.map((e) => e.loc).join(','));
    expect(new Set(locs).size).toBe(1);
    expect(runs[0]?.sources.map((s) => basename(s))).toEqual([
      'index.xml',
      'part-a.xml',
      'part-b.xml',
    ]);
  });
});

describe('loadSitemap input validation', () => {
  it('rejects an empty input rather than falling back to the working directory', async () => {
    await expect(loadSitemap('   ')).rejects.toThrow(/empty input/);
  });

  it('says so when handed a directory', async () => {
    await expect(loadSitemap(fixture(''))).rejects.toThrow(/is a directory/);
  });
});

describe('loadSitemap discovery', () => {
  const SITEMAP =
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://e.com/a</loc></url></urlset>';
  const HOMEPAGE = '<!doctype html><html><body>hi</body></html>';

  const serve = (routes: Record<string, string>) =>
    vi.fn(async (url: string | URL) => {
      const body = routes[String(url)];
      if (body === undefined) {
        return new Response('nope', { status: 404, statusText: 'Not Found' });
      }
      return new Response(body, { status: 200 });
    });

  afterEach(() => vi.unstubAllGlobals());

  it('finds the sitemap when handed a bare site address', async () => {
    vi.stubGlobal(
      'fetch',
      serve({
        'https://e.com/': HOMEPAGE,
        'https://e.com/robots.txt': 'Sitemap: https://e.com/real-sitemap.xml',
        'https://e.com/real-sitemap.xml': SITEMAP,
      }),
    );
    const found: string[][] = [];
    const sitemap = await loadSitemap('https://e.com/', { onDiscover: (f) => found.push(f) });
    expect(sitemap.entries.map((e) => e.loc)).toEqual(['https://e.com/a']);
    expect(sitemap.sources).toEqual(['https://e.com/real-sitemap.xml']);
    expect(found).toEqual([['https://e.com/real-sitemap.xml']]);
  });

  it('merges every sitemap robots.txt lists', async () => {
    vi.stubGlobal(
      'fetch',
      serve({
        'https://e.com/': HOMEPAGE,
        'https://e.com/robots.txt':
          'Sitemap: https://e.com/one.xml\nSitemap: https://e.com/two.xml',
        'https://e.com/one.xml': SITEMAP,
        'https://e.com/two.xml': SITEMAP.replace('/a<', '/b<'),
      }),
    );
    const sitemap = await loadSitemap('https://e.com/');
    expect(sitemap.entries.map((e) => e.loc)).toEqual(['https://e.com/a', 'https://e.com/b']);
  });

  it('does not go looking when the URL was already a sitemap', async () => {
    const fetcher = serve({ 'https://e.com/sitemap.xml': SITEMAP });
    vi.stubGlobal('fetch', fetcher);
    await loadSitemap('https://e.com/sitemap.xml');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('stays put when discovery is switched off', async () => {
    vi.stubGlobal(
      'fetch',
      serve({
        'https://e.com/': HOMEPAGE,
        'https://e.com/robots.txt': 'Sitemap: https://e.com/real-sitemap.xml',
        'https://e.com/real-sitemap.xml': SITEMAP,
      }),
    );
    await expect(loadSitemap('https://e.com/', { discover: false })).rejects.toThrow(
      /not a sitemap/,
    );
  });

  it('says a site has none rather than repeating the homepage error', async () => {
    vi.stubGlobal('fetch', serve({ 'https://e.com/': HOMEPAGE }));
    await expect(loadSitemap('https://e.com/')).rejects.toThrow(/no sitemap found/);
  });
});

describe('loadSitemap discovery errors', () => {
  const HOMEPAGE = '<!doctype html><html><body>hi</body></html>';

  afterEach(() => vi.unstubAllGlobals());

  it('distinguishes advertised-but-unreadable from nothing-advertised', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const routes: Record<string, string> = {
          'https://e.com/': HOMEPAGE,
          'https://e.com/robots.txt': 'Sitemap: https://e.com/gone.xml',
        };
        const body = routes[String(url)];
        if (body === undefined) return new Response('', { status: 404, statusText: 'Not Found' });
        return new Response(body, { status: 200 });
      }),
    );
    await expect(loadSitemap('https://e.com/')).rejects.toThrow(
      /advertises 1 sitemap\(s\), but none could be read/,
    );
  });

  it('records a skipped cross-site sitemap as an error, not silence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const routes: Record<string, string> = {
          'https://e.com/': HOMEPAGE,
          'https://e.com/robots.txt':
            'Sitemap: https://elsewhere.example/x.xml\nSitemap: https://e.com/real.xml',
          'https://e.com/real.xml':
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://e.com/a</loc></url></urlset>',
        };
        const body = routes[String(url)];
        if (body === undefined) return new Response('', { status: 404, statusText: 'Not Found' });
        return new Response(body, { status: 200 });
      }),
    );
    const sitemap = await loadSitemap('https://e.com/');
    expect(sitemap.entries).toHaveLength(1);
    expect(sitemap.errors).toEqual([
      {
        source: 'https://elsewhere.example/x.xml',
        message: 'advertised in robots.txt but skipped: different site',
      },
    ]);
  });
});

describe('loadSitemap content mode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never fetches what was handed to it as content', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    // A single line piped in is a one-URL list, not an address to go and read.
    const sitemap = await loadSitemap('https://e.com/a', { content: true });
    expect(sitemap.entries.map((e) => e.loc)).toEqual(['https://e.com/a']);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('still fetches the same string when it is given as a location', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://e.com/x</loc></url></urlset>',
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const sitemap = await loadSitemap('https://e.com/sitemap.xml');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sitemap.entries.map((e) => e.loc)).toEqual(['https://e.com/x']);
  });
});
