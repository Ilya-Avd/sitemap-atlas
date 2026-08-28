import type { SitemapEntry, SitemapError, TreeNode, TreeStats } from '../types.js';
import { VIEWER_CSS, VIEWER_JS } from './assets.generated.js';

export interface HtmlOptions {
  /** Document title. Defaults to the tree root name. */
  title?: string;
  /** Shown in the header — the path or URL the sitemap was read from. */
  source?: string;
  /** Number of sitemap documents that went into the tree. */
  sourceCount?: number;
  /** Documents that could not be read, surfaced as a warning chip. */
  errors?: SitemapError[];
  /** Overridable for reproducible output in tests. */
  now?: Date;
  /** Put on every inline `<script>` and `<style>` — a VS Code webview needs one. */
  nonce?: string;
  /** Emitted as a `Content-Security-Policy` meta tag. */
  csp?: string;
  /** Force the colour scheme instead of following the reader's system setting. */
  theme?: 'light' | 'dark';
}

/** Entry shape written into the page — see the note in viewer.js. */
interface WireEntry extends Omit<SitemapEntry, 'source' | 'alternates' | 'loc'> {
  /** Only when it cannot be rebuilt from the node path. */
  loc?: string;
  /** Set when the URL is the node path plus a trailing slash. */
  slash?: 1;
  /** How many hreflang alternates the entry declared. */
  alts?: number;
}

/** Node shape actually written into the page — see the note in viewer.js. */
interface WireNode {
  name: string;
  count: number;
  path?: string;
  entry?: WireEntry;
  children?: WireNode[];
  truncated?: number;
  dupes?: number;
}

interface NodeWithDuplicates extends TreeNode {
  duplicates?: SitemapEntry[];
}

function toWire(node: TreeNode, parentPath: string | null): WireNode {
  const wire: WireNode = { name: node.name, count: node.count };
  const derived = parentPath === null ? '' : `${parentPath}/${node.name}`;
  if (node.path !== derived) wire.path = node.path;
  if (node.entry) {
    // Three things are dropped here because they dominate the file size on a
    // real sitemap: `source` repeats on every entry, `loc` is nearly always the
    // node path, and the viewer only ever shows how many alternates there are —
    // a site with hreflang can spend a megabyte on hrefs nothing reads.
    const { source: _source, alternates, loc, ...rest } = node.entry;
    const entry: WireEntry = { ...rest };
    if (loc === `${node.path}/`) entry.slash = 1;
    else if (loc !== node.path) entry.loc = loc;
    if (alternates?.length) entry.alts = alternates.length;
    wire.entry = entry;
  }
  const dupes = (node as NodeWithDuplicates).duplicates?.length;
  if (dupes) wire.dupes = dupes;
  if (node.truncated) wire.truncated = node.truncated;
  if (node.children.length) {
    wire.children = node.children.map((child) => toWire(child, node.path));
  }
  return wire;
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );

/** `</script>` inside the payload would end the block early. */
const escapeJson = (value: string): string => value.replace(/</g, '\\u003c');

const num = (value: number): string => value.toLocaleString('en-US');

function chip(label: string, value: string, warn = false): string {
  return `<li class="chip${warn ? ' warn' : ''}"><b>${escapeHtml(value)}</b> ${escapeHtml(label)}</li>`;
}

function chips(stats: TreeStats, options: HtmlOptions): string {
  const out = [chip('URLs', num(stats.urls)), chip('folders', num(stats.folders))];
  out.push(chip('levels deep', String(stats.maxDepth)));
  if (stats.hosts.length > 1) out.push(chip('hosts', String(stats.hosts.length)));
  if ((options.sourceCount ?? 1) > 1)
    out.push(chip('sitemaps', num(options.sourceCount as number)));
  if (stats.withLastmod) {
    const pct = Math.round((stats.withLastmod / Math.max(stats.urls, 1)) * 100);
    out.push(chip('with lastmod', `${pct}%`));
  }
  if (stats.newest) out.push(chip('newest', String(stats.newest).slice(0, 10)));
  if (stats.images) out.push(chip('images', num(stats.images)));
  if (stats.videos) out.push(chip('videos', num(stats.videos)));
  if (options.errors?.length) {
    out.push(
      chip(
        options.errors.length === 1 ? 'failed source' : 'failed sources',
        num(options.errors.length),
        true,
      ),
    );
  }
  return out.join('\n      ');
}

const SEARCH_ICON =
  '<svg class="glass" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' +
  '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14" stroke-linecap="round"/></svg>';

/**
 * Render a tree as one self-contained HTML page: no CDN, no fonts, no network.
 * Open the file straight from disk.
 */
export function renderHtml(root: TreeNode, stats: TreeStats, options: HtmlOptions = {}): string {
  const title = options.title ?? root.name;
  const generated = (options.now ?? new Date()).toISOString().replace('T', ' ').slice(0, 16);
  const payload = escapeJson(JSON.stringify({ root: toWire(root, null) }));
  const failed = options.errors?.length ?? 0;
  const errorList = failed
    ? `<details class="failures"><summary>${failed} ${
        failed === 1 ? 'source' : 'sources'
      } could not be read</summary><ul>${(options.errors as SitemapError[])
        .map((e) => `<li>${escapeHtml(e.source)} — ${escapeHtml(e.message)}</li>`)
        .join('')}</ul></details>`
    : '';

  const nonce = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : '';
  const csp = options.csp
    ? `\n<meta http-equiv="Content-Security-Policy" content="${escapeHtml(options.csp)}">`
    : '';
  const theme = options.theme ? ` data-theme="${options.theme}"` : '';

  return `<!doctype html>
<html lang="en"${theme}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="sitemap-atlas">${csp}
<title>${escapeHtml(title)} — sitemap</title>
<style${nonce}>
${VIEWER_CSS}
</style>
</head>
<body>
<header>
  <div class="title-row">
    <h1>${escapeHtml(title)}</h1>
    <span class="generated">${escapeHtml(options.source ?? '')} · ${generated}</span>
  </div>
  <ul class="chips">
      ${chips(stats, options)}
  </ul>
  <div class="toolbar">
    <div class="search">
      ${SEARCH_ICON}
      <input id="q" type="search" placeholder="Filter paths…  (press /)" autocomplete="off" spellcheck="false">
      <button class="clear" id="clear" title="Clear" aria-label="Clear search">×</button>
    </div>
    <div class="segmented" role="group" aria-label="View">
      <button id="view-outline" aria-pressed="true">Outline</button>
      <button id="view-graph" aria-pressed="false">Graph</button>
    </div>
    <button class="btn" id="fit" hidden>Fit</button>
    <button class="btn" id="expand">Expand all</button>
    <button class="btn" id="collapse">Collapse</button>
    <button class="btn icon" id="theme" title="Theme">◑</button>
  </div>
</header>
<main>
  <div class="view" id="outline"></div>
  <div class="view" id="graph" hidden>
    <div class="hint">drag to pan · scroll to zoom · click a node to fold</div>
  </div>
</main>
${errorList}
<script${nonce}>window.__SITEMAP__=${payload};</script>
<script${nonce}>
${VIEWER_JS}
</script>
</body>
</html>
`;
}
