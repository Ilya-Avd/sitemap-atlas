import type { SitemapEntry, TreeNode, TreeStats } from './types.js';

export interface TreeOptions {
  /** Merge chains of single-child folders into one node, e.g. `2024/01/15`. */
  collapse?: boolean;
  /** Fold everything below this depth into a `truncated` count. Default unlimited. */
  maxDepth?: number;
  /** Child ordering. Default `name`. */
  sortBy?: 'name' | 'count' | 'lastmod';
  /** Default `asc` for `name`, `desc` for the others. */
  order?: 'asc' | 'desc';
  /** Root label when the entries span more than one host. */
  rootLabel?: string;
}

interface MutableNode extends TreeNode {
  children: MutableNode[];
  duplicates?: SitemapEntry[];
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function makeNode(name: string, path: string, depth: number): MutableNode {
  return { name, path, children: [], count: 0, depth };
}

/**
 * Split a URL into the segments the tree branches on. The query string rides
 * along on the last segment so that `/search?q=a` and `/search?q=b` stay apart
 * without inventing a level for them.
 */
function segmentsOf(url: URL): string[] {
  const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  const tail = url.search + (url.hash === '#' ? '' : url.hash);
  if (!tail) return segments;
  if (segments.length === 0) return [tail];
  segments[segments.length - 1] += tail;

  return segments;
}

function attach(node: MutableNode, entry: SitemapEntry): void {
  if (!node.entry) {
    node.entry = entry;

    return;
  }
  // Two entries landing on one node means the sitemap lists the same page
  // twice — usually `/x` and `/x/`. Keep both so counts stay honest.
  (node.duplicates ??= []).push(entry);
}

/** Build the URL tree. Entries whose `loc` will not parse as a URL are skipped. */
export function buildTree(entries: SitemapEntry[], options: TreeOptions = {}): TreeNode {
  const { collapse = false, maxDepth = Number.POSITIVE_INFINITY, rootLabel } = options;

  const origins = new Map<string, MutableNode>();

  // Scanning `node.children` for each segment turns the build quadratic once a
  // folder holds thousands of pages — a flat product catalogue does exactly
  // that. This side index is dropped as soon as the tree is built.
  const byName = new Map<MutableNode, Map<string, MutableNode>>();

  const childNamed = (node: MutableNode, segment: string): MutableNode => {
    let names = byName.get(node);
    if (!names) {
      names = new Map();
      byName.set(node, names);
    }
    let child = names.get(segment);
    if (!child) {
      child = makeNode(segment, `${node.path}/${segment}`, node.depth + 1);
      node.children.push(child);
      names.set(segment, child);
    }

    return child;
  };

  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry.loc);
    } catch {
      continue;
    }

    let root = origins.get(url.origin);
    if (!root) {
      root = makeNode(url.host, url.origin, 0);
      origins.set(url.origin, root);
    }

    let node = root;
    let truncatedAt: MutableNode | undefined;

    for (const segment of segmentsOf(url)) {
      if (node.depth + 1 > maxDepth) {
        truncatedAt = node;
        break;
      }
      node = childNamed(node, segment);
    }

    if (truncatedAt) {
      truncatedAt.truncated = (truncatedAt.truncated ?? 0) + 1;
    } else {
      attach(node, entry);
    }
  }

  const roots = [...origins.values()];
  let root: MutableNode;
  if (roots.length === 1) {
    root = roots[0] as MutableNode;
  } else {
    root = makeNode(rootLabel ?? `${roots.length} hosts`, '', 0);
    for (const child of roots) reindex(child, 1);
    root.children = roots;
  }

  count(root);
  if (collapse) {
    root = collapseChains(root, true);
    // Collapsing removes levels, so every depth below a merged node is stale.
    reindex(root, 0);
  }
  sort(root, options);

  return root;
}

function reindex(node: MutableNode, depth: number): void {
  node.depth = depth;
  for (const child of node.children) reindex(child, depth + 1);
}

function count(node: MutableNode): number {
  let total = (node.entry ? 1 : 0) + (node.duplicates?.length ?? 0) + (node.truncated ?? 0);
  for (const child of node.children) total += count(child);
  node.count = total;

  return total;
}

function collapseChains(node: MutableNode, isRoot: boolean): MutableNode {
  node.children = node.children.map((child) => collapseChains(child, false));
  const only = node.children.length === 1 ? node.children[0] : undefined;
  if (!isRoot && only && !node.entry && !node.truncated) {
    return { ...only, name: `${node.name}/${only.name}`, depth: node.depth };
  }

  return node;
}

function lastmodTime(node: MutableNode): number {
  const raw = node.entry?.lastmod;
  const time = raw ? Date.parse(raw) : Number.NaN;

  return Number.isNaN(time) ? -Infinity : time;
}

function sort(node: MutableNode, options: TreeOptions): void {
  const { sortBy = 'name' } = options;
  const dir = (options.order ?? (sortBy === 'name' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
  const compare = (a: MutableNode, b: MutableNode): number => {
    if (sortBy === 'count') return (a.count - b.count) * dir;
    if (sortBy === 'lastmod') return (lastmodTime(a) - lastmodTime(b)) * dir;

    return a.name.localeCompare(b.name, undefined, { numeric: true }) * dir;
  };
  node.children.sort(compare);
  for (const child of node.children) sort(child, options);
}

/** Headline numbers for a built tree. */
export function summarize(root: TreeNode): TreeStats {
  const stats: TreeStats = {
    urls: 0,
    folders: 0,
    maxDepth: 0,
    hosts: [],
    withLastmod: 0,
    images: 0,
    videos: 0,
  };
  const hosts = new Set<string>();
  let oldest = Number.POSITIVE_INFINITY;
  let newest = Number.NEGATIVE_INFINITY;

  const visit = (node: TreeNode): void => {
    stats.maxDepth = Math.max(stats.maxDepth, node.depth);
    const own = [node.entry, ...((node as MutableNode).duplicates ?? [])].filter(
      (e): e is SitemapEntry => Boolean(e),
    );
    if (!own.length) {
      if (node.children.length) stats.folders++;
    }
    for (const entry of own) {
      stats.urls++;
      stats.images += entry.images ?? 0;
      stats.videos += entry.videos ?? 0;
      try {
        hosts.add(new URL(entry.loc).host);
      } catch {
        /* loc already validated at build time */
      }
      if (!entry.lastmod) continue;
      stats.withLastmod++;
      const time = Date.parse(entry.lastmod);
      if (Number.isNaN(time)) continue;
      if (time < oldest) {
        oldest = time;
        stats.oldest = entry.lastmod;
      }
      if (time > newest) {
        newest = time;
        stats.newest = entry.lastmod;
      }
    }
    stats.urls += node.truncated ?? 0;
    for (const child of node.children) visit(child);
  };

  visit(root);
  stats.hosts = [...hosts].sort();

  return stats;
}
