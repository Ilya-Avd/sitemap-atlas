import { describe, expect, it } from 'vitest';
import { buildTree, summarize } from '../src/tree.js';
import { renderHtml } from '../src/render/html.js';
import { renderMermaid } from '../src/render/mermaid.js';
import { renderText } from '../src/render/text.js';
import { renderCsv } from '../src/render/csv.js';
import type { SitemapEntry } from '../src/types.js';

const entries = (...locs: string[]): SitemapEntry[] => locs.map((loc) => ({ loc }));
const sample = () =>
  buildTree(entries('https://e.com/', 'https://e.com/a/b', 'https://e.com/a/c', 'https://e.com/d'));

describe('renderText', () => {
  it('draws the tree with counts', () => {
    expect(renderText(sample())).toBe(
      ['e.com  4', '├── a  2', '│   ├── b', '│   └── c', '└── d'].join('\n'),
    );
  });

  it('leaves counts out when asked', () => {
    expect(renderText(sample(), { counts: false })).not.toMatch(/\d/);
  });

  it('stops at maxDepth', () => {
    expect(renderText(sample(), { maxDepth: 1 })).toBe(
      ['e.com  4', '├── a  2', '└── d'].join('\n'),
    );
  });

  it('only emits escape codes when colour is on', () => {
    expect(renderText(sample())).not.toContain('\u001b');
    expect(renderText(sample(), { color: true })).toContain('\u001b');
  });
});

describe('renderMermaid', () => {
  it('emits a graph with one node per branch', () => {
    const out = renderMermaid(sample());
    expect(out.split('\n')[0]).toBe('graph LR');
    expect(out).toContain('n0["e.com (4)"]');
    expect(out).toContain('n0 --> n1');
    expect(out).toContain('classDef d0');
  });

  it('honours the direction', () => {
    expect(renderMermaid(sample(), { direction: 'TD' }).split('\n')[0]).toBe('graph TD');
  });

  it('caps the node count and says how many it dropped', () => {
    const many = entries(...Array.from({ length: 50 }, (_, i) => `https://e.com/p${i}`));
    const out = renderMermaid(buildTree(many), { maxNodes: 10 });
    expect(out.match(/^ {2}n\d+\[/gm)).toHaveLength(10);
    expect(out).toMatch(/%% 41 URLs omitted/);
  });

  it('escapes quotes in labels', () => {
    const tree = buildTree(entries('https://e.com/say%22hi%22'));
    expect(renderMermaid(tree)).toContain('#quot;hi#quot;');
  });
});

describe('renderHtml', () => {
  const html = () => {
    const tree = sample();
    return renderHtml(tree, summarize(tree), { source: 'sitemap.xml', now: new Date(0) });
  };

  it('is a complete document', () => {
    expect(html().startsWith('<!doctype html>')).toBe(true);
    expect(html().trimEnd().endsWith('</html>')).toBe(true);
  });

  it('pulls nothing from the network', () => {
    const out = html();
    expect(out).not.toMatch(/<script[^>]+src=/i);
    expect(out).not.toMatch(/<link[^>]+stylesheet/i);
    expect(out).not.toMatch(/@import/i);
    expect(out).not.toMatch(/https?:\/\/(?!e\.com|www\.w3\.org|www\.sitemaps\.org)/);
  });

  it('inlines the viewer', () => {
    expect(html()).toContain('window.__SITEMAP__=');
    expect(html()).toContain('--bg-panel');
  });

  it('shows the headline numbers', () => {
    expect(html()).toContain('<b>4</b> URLs');
    expect(html()).toContain('sitemap.xml');
  });

  it('drops the derivable path from every node to keep the file small', () => {
    const payload = html().match(/window\.__SITEMAP__=(.*?);<\/script>/)?.[1] as string;
    const data = JSON.parse(payload.replace(/\u003c/g, '<'));
    expect(data.root.path).toBe('https://e.com');
    expect(data.root.children[0].path).toBeUndefined();
  });

  it('cannot be broken out of by a URL that looks like markup', () => {
    const tree = buildTree(entries('https://e.com/%3C%2Fscript%3E%3Cscript%3Ealert(1)'));
    const out = renderHtml(tree, summarize(tree));
    expect(out).not.toContain('</script><script>alert(1)');
    expect(out).toContain('\u003c/script>');
  });

  it('reports unreadable sources as a warning', () => {
    const tree = sample();
    const out = renderHtml(tree, summarize(tree), {
      errors: [{ source: 'https://e.com/b.xml', message: 'HTTP 404 Not Found' }],
    });
    expect(out).toContain('chip warn');
    expect(out).toContain('HTTP 404 Not Found');
  });
});

describe('renderHtml payload', () => {
  const payloadOf = (html: string): Record<string, unknown> =>
    JSON.parse(
      (html.match(/window\.__SITEMAP__=(.*?);<\/script>/)?.[1] as string).replace(/\u003c/g, '<'),
    );

  it('drops a loc that the viewer can rebuild from the node path', () => {
    const tree = buildTree(entries('https://e.com/a/b'));
    const data = payloadOf(renderHtml(tree, summarize(tree)));
    const leaf = (data.root as { children: { children: { entry: object }[] }[] }).children[0]
      ?.children[0];
    expect(leaf?.entry).toEqual({});
  });

  it('marks a trailing slash instead of repeating the URL', () => {
    const tree = buildTree(entries('https://e.com/a/'));
    const data = payloadOf(renderHtml(tree, summarize(tree)));
    expect((data.root as { children: { entry: object }[] }).children[0]?.entry).toEqual({
      slash: 1,
    });
  });

  it('keeps a loc the path cannot reproduce', () => {
    const tree = buildTree([{ loc: 'https://e.com/%7Etilde' }]);
    const data = payloadOf(renderHtml(tree, summarize(tree)));
    expect((data.root as { children: { entry: { loc: string } }[] }).children[0]?.entry.loc).toBe(
      'https://e.com/%7Etilde',
    );
  });

  it('reduces hreflang alternates to a count', () => {
    const tree = buildTree([
      {
        loc: 'https://e.com/a',
        alternates: [
          { hreflang: 'de', href: 'https://e.com/de/a' },
          { hreflang: 'fr', href: 'https://e.com/fr/a' },
        ],
      },
    ]);
    const html = renderHtml(tree, summarize(tree));
    expect(html).not.toContain('https://e.com/de/a');
    const data = payloadOf(html);
    expect((data.root as { children: { entry: { alts: number } }[] }).children[0]?.entry.alts).toBe(
      2,
    );
  });
});

describe('renderText truncation', () => {
  it('marks the cut once, not once per level on the way back up', () => {
    const many = buildTree(
      entries(...Array.from({ length: 12 }, (_, i) => `https://e.com/g${i % 3}/p${i}`)),
    );
    const out = renderText(many, { maxNodes: 5 });
    expect(out.match(/\.\.\./g)).toHaveLength(1);
  });
});

describe('renderHtml failures block', () => {
  const tree = () => buildTree(entries('https://e.com/a'));

  it('agrees with itself about plurals', () => {
    const one = renderHtml(tree(), summarize(tree()), {
      errors: [{ source: 'a.xml', message: 'gone' }],
    });
    expect(one).toContain('1 source could not be read');
    expect(one).toContain('<b>1</b> failed source');

    const two = renderHtml(tree(), summarize(tree()), {
      errors: [
        { source: 'a.xml', message: 'gone' },
        { source: 'b.xml', message: 'gone' },
      ],
    });
    expect(two).toContain('2 sources could not be read');
    expect(two).toContain('<b>2</b> failed sources');
  });

  it('is left out entirely when everything was read', () => {
    expect(renderHtml(tree(), summarize(tree()))).not.toContain('could not be read');
  });
});

describe('renderCsv', () => {
  const tree = () =>
    buildTree([
      { loc: 'https://e.com/', lastmod: '2026-01-01', changefreq: 'daily', priority: 1 },
      { loc: 'https://e.com/a/b', images: 2 },
    ]);

  it('writes a header and one row per URL, in tree order', () => {
    const rows = renderCsv(tree()).split('\n');
    expect(rows[0]).toBe('loc,depth,lastmod,changefreq,priority,images,videos,status');
    expect(rows[1]).toBe('https://e.com/,0,2026-01-01,daily,1,,,');
    expect(rows[2]).toBe('https://e.com/a/b,2,,,,2,,');
  });

  it('can be a TSV instead', () => {
    expect(renderCsv(tree(), { delimiter: '\t' }).split('\n')[0]).toContain('loc\tdepth');
  });

  it('leaves the header out on request', () => {
    expect(renderCsv(tree(), { header: false }).split('\n')[0]).toMatch(/^https:/);
  });

  it('quotes a value that would otherwise break the row', () => {
    // Commas are legal in a URL path, and would split the row unquoted.
    const awkward = buildTree([{ loc: 'https://e.com/a,b' }]);
    expect(renderCsv(awkward, { header: false })).toBe('"https://e.com/a,b",1,,,,,,');
    expect(renderCsv(awkward, { header: false, delimiter: '\t' })).toBe(
      'https://e.com/a,b\t1\t\t\t\t\t\t',
    );
  });

  it('carries the diff status through', () => {
    const diffed = buildTree([{ loc: 'https://e.com/x', status: 'added' }]);
    expect(renderCsv(diffed, { header: false })).toContain(',added');
  });
});
