# sitemap-atlas

Turn a `sitemap.xml` into a tree you can actually read — one self-contained HTML page, a Mermaid diagram, or a plain tree in your terminal.

`zero runtime dependencies` · ~100 bytes per URL · works offline · Node 18.17+ · MIT

[![npm](https://img.shields.io/npm/v/sitemap-atlas.svg)](https://www.npmjs.com/package/sitemap-atlas)
[![CI](https://github.com/Ilya-Avd/sitemap-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/Ilya-Avd/sitemap-atlas/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Why

A sitemap is the most complete description of a site anyone has, and it is almost unreadable. Open one and the real problems start:

- it is **thousands of `<url>` elements**, and no amount of scrolling tells you the shape of the site;
- every tool in the ecosystem **generates** sitemaps — almost nothing reads them back;
- the online visualizers want you to **paste the URL list of your site into someone else's server**;
- a site with `<sitemapindex>` is **split across a dozen files**, so even counting the pages is work;
- after a release you want to know **what changed**, and `diff` on XML tells you nothing useful;
- the thing you actually need — "which section grew, which one has not been touched in two years" — is **not in the file at all**, it has to be computed.

sitemap-atlas answers those on your own machine. Nothing is uploaded, nothing is fetched except the sitemap you asked for.

<p align="center">
  <img src="docs/graph.svg" width="650"
       alt="The graph view: a site root branching into sections, each labelled with the number of URLs beneath it">
</p>

## Features

- **Two views over one tree** — a searchable outline and a pan/zoom graph, sharing the same fold state.
- **Self-contained output** — the HTML has no CDN, no fonts, no scripts to fetch. Open it from disk, mail it, commit it.
- **Comparison** — `--against` an earlier sitemap tags every URL added, removed or changed, and colours the same tree.
- **A CI guard** — `--fail-if-removed 5%` fails the build when a deploy quietly drops part of the site.
- **Finds the sitemap itself** — give it a bare domain and it reads `robots.txt`, then the conventional paths.
- **Sitemap indexes** — followed automatically; a downloaded set resolves to the sibling files next to it, so `--offline` still works.
- **Any list of URLs** — a crawler export or a pasted column of links builds the same tree. XML is optional.
- **Five outputs** — interactive HTML, terminal tree, Mermaid, CSV and JSON.
- **Scales** — 500k URLs in about six seconds; the viewer stays responsive because the DOM is capped and folds lazily.
- **Gzip, namespaces, entities** — `.xml.gz` detected by content, `xhtml:link` alternates, `image`/`video`/`news`, prefixed roots.
- **Never surprises you with a request** — a local file never touches the network, and a sitemap advertised on an unrelated host is reported, not fetched.
- **No dependencies** — the sitemap parser is part of the package.

## Install

```bash
npm install -g sitemap-atlas
```

Or without installing anything:

```bash
npx sitemap-atlas https://example.com
```

## Quick start

```bash
sitemap-atlas https://example.com -o report.html --open
```

```
  found 1 sitemap: https://example.com/sitemap.xml
  read https://example.com/sitemap.xml — 1,085 URLs
  report.html  (1,085 URLs, 90 KB)
```

That is the whole thing: point it at a site, get a page you can open. Everything below is optional.

Without `-o` it prints the tree instead, so it composes with the rest of your shell:

```
example.com  1,085
├── about
├── blog  481
│   ├── 2025  96
│   └── 2026  96
├── docs  105
│   ├── api  13
│   └── getting-started  13
└── products  453
    └── catalog  400
```

## Recipes

### See what a release changed

```bash
sitemap-atlas https://example.com --against ./last-week.xml -o changes.html
```

Added URLs come out green, removed ones struck through in red, and every folder carries a running `+N −M` so you can see where the release landed without opening it. The report has an **Only changes** filter for large sites.

```
shop.example  8
├── blog  2
│   ├── post-1
│   └── + post-2
├── - old-landing
└── products  3
    └── - discontinued
```

### Fail a build that loses pages

```bash
sitemap-atlas https://example.com --against ./baseline.xml --fail-if-removed 5% -q
```

Exits 1 when more than 5% of the previous URLs are gone. Takes a plain count too: `--fail-if-removed 20`.

### Count a changed `lastmod` as a change

```bash
sitemap-atlas new.xml --against old.xml --lastmod
```

Off by default: many generators rewrite `lastmod` on every build, which would mark the whole site as changed.

### Turn any list of URLs into a tree

```bash
cat crawl-export.txt | sitemap-atlas -
sitemap-atlas ./urls.txt -o report.html
```

Blank lines and `#` comments are ignored. The tree only ever needed addresses — XML is just the usual container.

### Read a downloaded sitemap index, offline

```bash
sitemap-atlas ./sitemap_index.xml --offline
```

The index lists public URLs, but the parts are sitting next to it on disk. Those are used, and nothing touches the network.

### Make a big site legible

```bash
sitemap-atlas ./sitemap.xml --collapse --depth 3 -o report.html
```

`--collapse` merges single-child chains, so `/blog/2026/01/15/` becomes one node instead of four. `--depth` folds everything below a level into a `+N deeper` count.

### Put the structure in your docs

```bash
sitemap-atlas ./sitemap.xml -f mermaid --depth 3 > structure.mmd
```

Mermaid renders on GitHub, in Notion and in most wikis.

### Take it to a spreadsheet

```bash
sitemap-atlas ./sitemap.xml -o urls.csv
sitemap-atlas new.xml --against old.xml -o changes.tsv
```

One row per URL with `loc, depth, lastmod, changefreq, priority, images, videos, status`. A `.tsv` extension switches the delimiter.

### Ask a precise question

```bash
sitemap-atlas ./sitemap.xml -f json | jq '.stats'
sitemap-atlas ./sitemap.xml -f json | jq '[.. | .entry? // empty | select(.priority > 0.8) | .loc]'
```

### Be polite to someone else's server

```bash
sitemap-atlas https://example.com --user-agent "acme-audit (+https://acme.example)" --timeout 5000
```

## CLI

```
sitemap-atlas <file|url|-> [options]
```

| Option | Description |
| --- | --- |
| `-o, --out <file>` | Write here; the extension picks the format |
| `-f, --format <fmt>` | `html`, `text`, `mermaid`, `json` or `csv` — default `text`, or inferred from `-o` |
| `--against <old>` | Compare with an earlier sitemap and show what changed |
| `--lastmod` | Also treat a changed `<lastmod>` as a change |
| `--fail-if-removed <n>` | Exit 1 if more than `n` URLs — or `n%` — disappeared |
| `--open` | Open the result in the default browser |
| `--depth <n>` | Collapse everything below this depth (Mermaid defaults to 4) |
| `--collapse` | Merge single-child folder chains |
| `--sort <key>` | `name`, `count` or `lastmod` — default `name` |
| `--order <dir>` | `asc` or `desc` |
| `--limit <n>` | Stop after N URLs |
| `--no-follow` | Do not descend into `<sitemapindex>` children |
| `--no-discover` | Do not look a site URL up in `robots.txt` and the usual paths |
| `--offline` | Never touch the network; resolve children to sibling files |
| `--timeout <ms>` | Per-request timeout — default 20000 |
| `--user-agent <ua>` | User-Agent for network reads |
| `--no-color` | Plain text output |
| `-q, --quiet` | Suppress progress on stderr |
| `-h, --help` · `-v, --version` | |

## Library

```ts
import { loadSitemap, buildTree, summarize, renderHtml } from 'sitemap-atlas';

const sitemap = await loadSitemap('https://example.com');
const tree = buildTree(sitemap.entries, { collapse: true, sortBy: 'count' });
const stats = summarize(tree);

console.log(`${stats.urls} URLs across ${stats.maxDepth} levels`);
await fs.writeFile('report.html', renderHtml(tree, stats));
```

Comparing two of them:

```ts
import { diffSitemaps } from 'sitemap-atlas';

const diff = diffSitemaps(before.entries, after.entries);
if (diff.summary.removedShare > 0.05) throw new Error('too many pages disappeared');

const tree = buildTree(diff.entries);
await fs.writeFile('changes.html', renderHtml(tree, summarize(tree), { diff: diff.summary }));
```

### API

| Function | |
| --- | --- |
| `loadSitemap(input, options?)` | Reads a URL, a path, raw XML or a URL list, following nested indexes. Returns `{ entries, sources, refs, errors }` |
| `parseSitemap(xml, source?)` | One document, synchronously. Returns `{ kind, entries, refs }` |
| `parseUrlList(text, source?)` · `looksLikeUrlList(text)` | The same for a plain list of URLs |
| `discover(siteUrl, read)` | The sitemaps a site advertises. Returns `{ found, skipped }`; `skipped` says what was left alone and why |
| `discoverSitemaps(siteUrl, read)` | The same, when only the locations matter |
| `parseRobots(text)` · `looksLikeSitemap(xml)` · `sameSite(a, b)` | The pieces discovery is built from |
| `buildTree(entries, options?)` | Groups by host, branches on path segments |
| `summarize(tree)` | URL and folder counts, depth, hosts, `lastmod` window, media counts |
| `diffSitemaps(before, after, options?)` | Tags every URL `added`, `removed`, `changed` or `unchanged`, plus a summary |
| `renderHtml(tree, stats, options?)` | One self-contained page. Pass `diff` to colour it |
| `renderText(tree, options?)` | The terminal tree, optionally with ANSI colour |
| `renderMermaid(tree, options?)` | Mermaid `graph` source |
| `renderCsv(tree, options?)` | One row per URL, for a spreadsheet |

`TreeNode` is a plain object, so walking it yourself instead of using a renderer is a supported thing to do. Every option is documented on its type.

### How the tree is built

URLs are grouped by origin, then split on path segments. More than one host produces a synthetic root above them. A trailing slash maps onto the folder node, so `/blog/` and `/blog/post` share a parent. Query strings stay attached to the last segment, so `/search?q=a` and `/search?q=b` remain separate pages. A URL listed twice is kept rather than silently merged — the counts stay honest and the viewer marks it.

## VS Code extension

The same tree inside the editor: open a `sitemap.xml` and hit the tree icon in the title bar, or ask for a site by URL. See [vscode-extension/](vscode-extension/README.md).

## How it works

Reading a sitemap does not need a general XML parser, and bringing one in costs a dependency tree. `src/xml.ts` is a single-pass scanner over the subset sitemaps.org defines — namespaces, CDATA, comments, DOCTYPE, entities — which is both smaller and five to seven times faster than a general parser on the same input, at about half the memory, because no document tree is ever built.

Documents are read concurrently but assembled in the order the index lists them, so the output is deterministic. The HTML report stays around 100 bytes per URL because the page drops everything the browser can rebuild — node paths, and the `loc` of any URL that matches its path — and reduces hreflang alternates to a count; a site with full hreflang would otherwise spend a megabyte on hrefs nothing reads. In the viewer, the DOM is capped and children are rendered only when a node is unfolded, so responsiveness depends on how much you have opened rather than how large the sitemap is.

## Requirements

Node 18.17 or newer. No runtime dependencies.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
