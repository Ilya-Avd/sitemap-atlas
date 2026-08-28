import { describe, expect, it, vi } from 'vitest';
import {
  discover,
  discoverSitemaps,
  looksLikeSitemap,
  parseRobots,
  sameSite,
} from '../src/discover.js';

const SITEMAP =
  '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://e.com/a</loc></url></urlset>';
const HOMEPAGE = '<!doctype html><html><body>hello</body></html>';

describe('parseRobots', () => {
  it('picks up Sitemap directives whatever the case and spacing', () => {
    expect(
      parseRobots(
        [
          'User-agent: *',
          'Disallow: /admin',
          'Sitemap: https://e.com/a.xml',
          '  sitemap:https://e.com/b.xml',
          'SITEMAP:   https://e.com/c.xml',
        ].join('\n'),
      ),
    ).toEqual(['https://e.com/a.xml', 'https://e.com/b.xml', 'https://e.com/c.xml']);
  });

  it('keeps the listed order and drops repeats', () => {
    expect(
      parseRobots(
        'Sitemap: https://e.com/b.xml\nSitemap: https://e.com/a.xml\nSitemap: https://e.com/b.xml',
      ),
    ).toEqual(['https://e.com/b.xml', 'https://e.com/a.xml']);
  });

  it('finds nothing in a robots.txt without one', () => {
    expect(parseRobots('User-agent: *\nDisallow:\n')).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    expect(parseRobots('User-agent: *\r\nSitemap: https://e.com/a.xml\r\n')).toEqual([
      'https://e.com/a.xml',
    ]);
  });
});

describe('looksLikeSitemap', () => {
  it('accepts a urlset and a sitemapindex, prefixed or not', () => {
    expect(looksLikeSitemap(SITEMAP)).toBe(true);
    expect(looksLikeSitemap('<sitemapindex></sitemapindex>')).toBe(true);
    expect(looksLikeSitemap('<sm:urlset xmlns:sm="x"/>')).toBe(true);
  });

  it('rejects a homepage', () => {
    expect(looksLikeSitemap(HOMEPAGE)).toBe(false);
  });
});

describe('discoverSitemaps', () => {
  it('trusts robots.txt without downloading each sitemap', async () => {
    const read = vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt'))
        return 'Sitemap: https://e.com/one.xml\nSitemap: https://e.com/two.xml';
      throw new Error('should not be fetched');
    });
    expect(await discoverSitemaps('https://e.com/some/page', read)).toEqual([
      { loc: 'https://e.com/one.xml' },
      { loc: 'https://e.com/two.xml' },
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('falls back to the conventional paths and reuses the body it fetched', async () => {
    const read = vi.fn(async (url: string) => {
      if (url === 'https://e.com/sitemap_index.xml') return SITEMAP;
      throw new Error('HTTP 404 Not Found');
    });
    expect(await discoverSitemaps('https://e.com', read)).toEqual([
      { loc: 'https://e.com/sitemap_index.xml', body: SITEMAP },
    ]);
  });

  it('keeps probing past a path that answers with a homepage', async () => {
    const read = vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt')) return 'User-agent: *';
      if (url === 'https://e.com/sitemap.xml') return HOMEPAGE;
      if (url === 'https://e.com/sitemap_index.xml') return SITEMAP;
      throw new Error('HTTP 404');
    });
    expect((await discoverSitemaps('https://e.com', read))[0]?.loc).toBe(
      'https://e.com/sitemap_index.xml',
    );
  });

  it('returns nothing when the site has none', async () => {
    const read = async (): Promise<string> => {
      throw new Error('HTTP 404');
    };
    expect(await discoverSitemaps('https://e.com', read)).toEqual([]);
  });

  it('gives up on an unparseable address instead of throwing', async () => {
    const read = vi.fn();
    expect(await discoverSitemaps('not a url', read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('discover guards', () => {
  const SITEMAP =
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://e.com/a</loc></url></urlset>';

  it('resolves a relative Sitemap: line against the site', async () => {
    const read = async (url: string): Promise<string> => {
      if (url.endsWith('/robots.txt')) return 'Sitemap: /sitemap.xml';
      throw new Error('HTTP 404');
    };
    const result = await discover('https://e.com/some/page', read);
    expect(result.found).toEqual([{ loc: 'https://e.com/sitemap.xml' }]);
  });

  it('leaves a sitemap on an unrelated host alone, and says why', async () => {
    const read = async (url: string): Promise<string> => {
      if (url.endsWith('/robots.txt')) {
        return 'Sitemap: https://evil.example/x.xml\nSitemap: https://cdn.e.com/ok.xml';
      }
      throw new Error('HTTP 404');
    };
    const result = await discover('https://e.com', read);
    // A CDN under the same site is the legitimate case and stays.
    expect(result.found).toEqual([{ loc: 'https://cdn.e.com/ok.xml' }]);
    expect(result.skipped).toEqual([
      { loc: 'https://evil.example/x.xml', reason: 'different site' },
    ]);
  });

  it('skips a Sitemap: line that is not http(s)', async () => {
    const read = async (url: string): Promise<string> => {
      if (url.endsWith('/robots.txt')) return 'Sitemap: file:///etc/passwd';
      if (url === 'https://e.com/sitemap.xml') return SITEMAP;
      throw new Error('HTTP 404');
    };
    const result = await discover('https://e.com', read);
    expect(result.skipped).toEqual([{ loc: 'file:///etc/passwd', reason: 'not http(s)' }]);
    // Nothing usable was advertised, so probing still finds the real one.
    expect(result.found).toEqual([{ loc: 'https://e.com/sitemap.xml', body: SITEMAP }]);
  });
});

describe('sameSite', () => {
  it('accepts the host itself and hosts either side of it', () => {
    expect(sameSite('https://e.com', 'https://e.com/x.xml')).toBe(true);
    expect(sameSite('https://e.com', 'https://cdn.e.com/x.xml')).toBe(true);
    expect(sameSite('https://www.e.com', 'https://e.com/x.xml')).toBe(true);
  });

  it('rejects an unrelated host, including a lookalike', () => {
    expect(sameSite('https://e.com', 'https://evil.example/x.xml')).toBe(false);
    expect(sameSite('https://e.com', 'https://note.com/x.xml')).toBe(false);
    expect(sameSite('https://e.com', 'not a url')).toBe(false);
  });
});
