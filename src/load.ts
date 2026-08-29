import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseSitemap } from './parse.js';
import { discover as discover_ } from './discover.js';
import { looksLikeUrlList, parseUrlList } from './urllist.js';
import type { Sitemap, SitemapEntry, SitemapError, SitemapRef } from './types.js';

export interface LoadOptions {
  /** Follow the children of a `<sitemapindex>`. Default `true`. */
  follow?: boolean;
  /** How many levels of nested indexes to descend. Default `3`. */
  maxIndexDepth?: number;
  /** Stop after this many URLs. Default `Infinity`. */
  maxUrls?: number;
  /** Nested sitemaps fetched in parallel. Default `6`. */
  concurrency?: number;
  /** Never touch the network — nested sitemaps resolve to sibling files only. */
  offline?: boolean;
  /** Abort a single network read after this many ms. Default `20000`. */
  timeout?: number;
  /** Sent as `User-Agent` on network reads. */
  userAgent?: string;
  /** Called as each document is read, for progress reporting. */
  onProgress?: (source: string, urls: number) => void;
  /**
   * When the URL given turns out not to be a sitemap, look for the site's real
   * ones via robots.txt and the conventional paths. Default `true`.
   */
  discover?: boolean;
  /** Accept a plain list of URLs where a sitemap was expected. Default `true`. */
  urlLists?: boolean;
  /**
   * Treat `input` as the document itself, never as a place to read from. Set
   * it for anything piped in: a single line of stdin that happens to be a URL
   * is content, and fetching it would be a request the caller never asked for.
   */
  content?: boolean;
  /** Called with the sitemaps discovery turned up, before they are read. */
  onDiscover?: (found: string[]) => void;
}

const DEFAULT_UA = 'sitemap-atlas (+https://github.com/Ilya-Avd/sitemap-atlas)';

// Anchored at both ends: a multi-line list of URLs starts with `https://` too,
// and must not be mistaken for a single address to fetch.
const isUrl = (input: string): boolean => /^https?:\/\/\S+$/i.test(input.trim());
const looksLikeXml = (input: string): boolean => input.trimStart().startsWith('<');

/** Gzip magic number — servers and files both hand us .gz without always saying so. */
function decode(bytes: Uint8Array): string {
  const body = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return new TextDecoder('utf-8').decode(body);
}

async function readUrl(url: string, opts: LoadOptions): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': opts.userAgent ?? DEFAULT_UA, Accept: 'application/xml,text/xml,*/*' },
    signal: AbortSignal.timeout(opts.timeout ?? 20_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return decode(new Uint8Array(await res.arrayBuffer()));
}

async function readPath(path: string): Promise<string> {
  try {
    return decode(new Uint8Array(await readFile(path)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EISDIR') {
      throw new Error('is a directory, not a sitemap file');
    }
    throw err;
  }
}

/**
 * A local index normally lists absolute public URLs for its children. When the
 * whole set has been downloaded into one directory, the sibling file is what
 * the user means — and it keeps `--offline` useful.
 */
function siblingOf(parent: string, loc: string): string | undefined {
  if (isUrl(parent)) return undefined;
  let name: string;
  try {
    name = basename(new URL(loc).pathname);
  } catch {
    name = basename(loc);
  }
  if (!name) return undefined;
  const candidate = resolve(dirname(resolve(parent)), name);
  return existsSync(candidate) ? candidate : undefined;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Read a sitemap from a URL, a file path, or a raw XML string, following any
 * nested indexes. Failures below the root are collected into `errors` so one
 * broken child cannot lose the rest of the site.
 */
export async function loadSitemap(input: string, options: LoadOptions = {}): Promise<Sitemap> {
  const {
    follow = true,
    maxIndexDepth = 3,
    maxUrls = Number.POSITIVE_INFINITY,
    concurrency = 6,
    offline = false,
    discover = true,
    urlLists = true,
    content = false,
  } = options;

  // Without this, an empty string falls through to the path branch and resolves
  // to the working directory, which fails with a baffling EISDIR.
  if (!input.trim()) throw new Error('empty input: expected a file path, a URL, or sitemap XML');

  const seen = new Set<string>();
  const errorsFromDiscovery: SitemapError[] = [];
  let fetched = 0;

  const read = async (source: string): Promise<string> => {
    if (isUrl(source)) {
      if (offline) throw new Error('offline mode: refusing to fetch over the network');
      return readUrl(source, options);
    }
    return readPath(source);
  };

  /**
   * One document and everything below it. Documents are read concurrently but
   * kept in a tree so the flattened result follows the order the index lists
   * them in, whatever order the reads happen to finish in.
   */
  interface Node {
    source: string;
    entries: SitemapEntry[];
    refs: SitemapRef[];
    error?: SitemapError;
    children: Node[];
  }

  const walk = async (source: string, xml: string | undefined, depth: number): Promise<Node> => {
    const node: Node = { source, entries: [], refs: [], children: [] };
    seen.add(source);

    let body: string;
    try {
      body = xml ?? (await read(source));
    } catch (err) {
      node.error = { source, message: err instanceof Error ? err.message : String(err) };
      return node;
    }

    let doc;
    try {
      doc = parseSitemap(body, source);
    } catch (err) {
      // Not XML — a plain list of URLs is just as good a source of a tree.
      if (urlLists && looksLikeUrlList(body)) {
        node.entries = parseUrlList(body, source);
        fetched += node.entries.length;
        options.onProgress?.(source, node.entries.length);
        return node;
      }
      node.error = { source, message: err instanceof Error ? err.message : String(err) };
      return node;
    }

    node.entries = doc.entries;
    node.refs = doc.refs;
    fetched += doc.entries.length;
    options.onProgress?.(source, doc.entries.length);

    if (doc.kind !== 'sitemapindex' || !follow || depth >= maxIndexDepth) return node;

    const targets: string[] = [];
    for (const ref of doc.refs) {
      const target = siblingOf(source, ref.loc) ?? ref.loc;
      if (seen.has(target)) continue;
      seen.add(target);
      targets.push(target);
    }

    node.children = await mapLimit(targets, concurrency, async (target) => {
      if (offline && isUrl(target)) {
        return {
          source: target,
          entries: [],
          refs: [],
          error: { source: target, message: 'offline mode: no sibling file found' },
          children: [],
        };
      }
      // Enough URLs already: stop reading, but keep the slot so nothing shifts.
      if (fetched >= maxUrls) return { source: target, entries: [], refs: [], children: [] };
      return walk(target, undefined, depth + 1);
    });

    return node;
  };

  // Content handed in directly, rather than a place to read it from.
  const inline =
    content || looksLikeXml(input) || (urlLists && looksLikeUrlList(input) && !isUrl(input));
  const rootSource = inline ? '<inline>' : isUrl(input) ? input : resolve(input);
  let roots: Node[] = [await walk(rootSource, inline ? input : undefined, 0)];

  // A bare site address is the common case here: the homepage came back and it
  // is not a sitemap, so go and find the real ones.
  let searched = false;
  let advertised = 0;
  if (discover && !offline && isUrl(rootSource) && roots[0]?.error) {
    searched = true;
    const result = await discover_(rootSource, (url) => readUrl(url, options));
    advertised = result.found.length;
    for (const { loc, reason } of result.skipped) {
      errorsFromDiscovery.push({
        source: loc,
        message: `advertised in robots.txt but skipped: ${reason}`,
      });
    }
    if (result.found.length) {
      options.onDiscover?.(result.found.map((item) => item.loc));
      roots = await mapLimit(result.found, concurrency, async (item) => {
        if (seen.has(item.loc)) return { source: item.loc, entries: [], refs: [], children: [] };
        return walk(item.loc, item.body, 1);
      });
    }
  }

  const entries: SitemapEntry[] = [];
  const sources: string[] = [];
  const refs: SitemapRef[] = [];
  const errors: SitemapError[] = [];
  const flatten = (node: Node): void => {
    if (node.error) errors.push(node.error);
    else sources.push(node.source);
    // Not `push(...node.entries)`: spreading passes one argument per element,
    // and a sitemap with more than ~125k URLs would overflow the call stack.
    for (const entry of node.entries) entries.push(entry);
    for (const ref of node.refs) refs.push(ref);
    for (const child of node.children) flatten(child);
  };
  for (const root of roots) flatten(root);
  for (const error of errorsFromDiscovery) errors.push(error);

  // The root failing is fatal: there is nothing to show and nothing to salvage.
  if (!sources.length && errors.length) {
    const first = errors[0] as SitemapError;
    if (searched) {
      throw new Error(
        advertised
          ? `robots.txt at ${rootSource} advertises ${advertised} sitemap(s), but none could be read — ${first.source}: ${first.message}`
          : `no sitemap found for ${rootSource} — not in robots.txt, and none of the usual paths answered`,
      );
    }
    throw new Error(`cannot read ${first.source}: ${first.message}`);
  }

  return {
    entries: entries.length > maxUrls ? entries.slice(0, maxUrls) : entries,
    sources,
    refs,
    errors,
  };
}
