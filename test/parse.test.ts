import { describe, expect, it } from 'vitest';
import { parseSitemap } from '../src/parse.js';

const urlset = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`;

describe('parseSitemap', () => {
  it('reads the standard fields of a urlset', () => {
    const doc = parseSitemap(
      urlset(`<url>
        <loc>https://example.com/a</loc>
        <lastmod>2026-01-15</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
      </url>`),
    );
    expect(doc.kind).toBe('urlset');
    expect(doc.entries).toEqual([
      { loc: 'https://example.com/a', lastmod: '2026-01-15', changefreq: 'weekly', priority: 0.7 },
    ]);
  });

  it('keeps a single <url> out of an array', () => {
    const doc = parseSitemap(urlset('<url><loc>https://example.com/only</loc></url>'));
    expect(doc.entries).toHaveLength(1);
  });

  it('clamps priority into 0..1 and drops unparseable values', () => {
    const doc = parseSitemap(
      urlset(`<url><loc>https://e.com/a</loc><priority>7</priority></url>
              <url><loc>https://e.com/b</loc><priority>-3</priority></url>
              <url><loc>https://e.com/c</loc><priority>high</priority></url>`),
    );
    expect(doc.entries.map((e) => e.priority)).toEqual([1, 0, undefined]);
  });

  it('ignores a changefreq that is not in the spec', () => {
    const doc = parseSitemap(
      urlset('<url><loc>https://e.com/a</loc><changefreq>whenever</changefreq></url>'),
    );
    expect(doc.entries[0]?.changefreq).toBeUndefined();
  });

  it('accepts an uppercase changefreq', () => {
    const doc = parseSitemap(
      urlset('<url><loc>https://e.com/a</loc><changefreq>DAILY</changefreq></url>'),
    );
    expect(doc.entries[0]?.changefreq).toBe('daily');
  });

  it('collects hreflang alternates and counts images', () => {
    const doc = parseSitemap(
      urlset(`<url>
        <loc>https://e.com/a</loc>
        <xhtml:link rel="alternate" hreflang="de" href="https://e.com/de/a"/>
        <xhtml:link rel="alternate" hreflang="fr" href="https://e.com/fr/a"/>
        <image:image><image:loc>https://e.com/1.png</image:loc></image:image>
        <image:image><image:loc>https://e.com/2.png</image:loc></image:image>
      </url>`),
    );
    expect(doc.entries[0]?.alternates).toEqual([
      { hreflang: 'de', href: 'https://e.com/de/a' },
      { hreflang: 'fr', href: 'https://e.com/fr/a' },
    ]);
    expect(doc.entries[0]?.images).toBe(2);
  });

  it('reads a sitemapindex as refs, not entries', () => {
    const doc = parseSitemap(`<?xml version="1.0"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://e.com/a.xml</loc><lastmod>2026-02-01</lastmod></sitemap>
        <sitemap><loc>https://e.com/b.xml</loc></sitemap>
      </sitemapindex>`);
    expect(doc.kind).toBe('sitemapindex');
    expect(doc.entries).toEqual([]);
    expect(doc.refs).toEqual([
      { loc: 'https://e.com/a.xml', lastmod: '2026-02-01' },
      { loc: 'https://e.com/b.xml', lastmod: undefined },
    ]);
  });

  it('handles a namespace-prefixed root element', () => {
    const doc = parseSitemap(`<?xml version="1.0"?>
      <sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sm:url><sm:loc>https://e.com/a</sm:loc></sm:url>
      </sm:urlset>`);
    expect(doc.entries.map((e) => e.loc)).toEqual(['https://e.com/a']);
  });

  it('skips a <url> with no <loc>', () => {
    const doc = parseSitemap(urlset('<url><lastmod>2026-01-01</lastmod></url>'));
    expect(doc.entries).toEqual([]);
  });

  it('tags entries with the source it was given', () => {
    const doc = parseSitemap(urlset('<url><loc>https://e.com/a</loc></url>'), 'part-a.xml');
    expect(doc.entries[0]?.source).toBe('part-a.xml');
  });

  it('rejects XML that is not a sitemap', () => {
    expect(() => parseSitemap('<rss><channel/></rss>')).toThrow(/not a sitemap/);
  });
});

describe('parseSitemap without a third-party parser', () => {
  it('decodes numeric character references in a loc', () => {
    const doc = parseSitemap(
      urlset('<url><loc>https://e.com/&#1087;&#x443;&#1090;&#1100;?a=1&amp;b=2</loc></url>'),
    );
    expect(doc.entries[0]?.loc).toBe('https://e.com/путь?a=1&b=2');
  });

  it('takes a loc wrapped in CDATA verbatim', () => {
    const doc = parseSitemap(urlset('<url><loc><![CDATA[https://e.com/a?x=1&y=2]]></loc></url>'));
    expect(doc.entries[0]?.loc).toBe('https://e.com/a?x=1&y=2');
  });

  it('reads an empty sitemap as empty, not as an error', () => {
    expect(parseSitemap(urlset(''))).toEqual({ kind: 'urlset', entries: [], refs: [] });
    expect(parseSitemap('<sitemapindex/>')).toEqual({
      kind: 'sitemapindex',
      entries: [],
      refs: [],
    });
  });

  it('does not let an image loc overwrite the page loc', () => {
    const doc = parseSitemap(
      urlset(`<url>
        <loc>https://e.com/page</loc>
        <image:image><image:loc>https://cdn.e.com/photo.jpg</image:loc></image:image>
      </url>`),
    );
    expect(doc.entries[0]?.loc).toBe('https://e.com/page');
    expect(doc.entries[0]?.images).toBe(1);
  });

  it('survives a comment inside a value', () => {
    const doc = parseSitemap(urlset('<url><loc>https://e.com/<!-- note -->a</loc></url>'));
    expect(doc.entries[0]?.loc).toBe('https://e.com/a');
  });

  it('ignores a stray DOCTYPE and processing instruction', () => {
    const doc = parseSitemap(
      `<?xml version="1.0"?><!DOCTYPE urlset><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://e.com/a</loc></url></urlset>`,
    );
    expect(doc.entries.map((e) => e.loc)).toEqual(['https://e.com/a']);
  });
});
