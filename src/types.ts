/** Values allowed by the sitemaps.org `<changefreq>` element. */
export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

/** One `<url>` entry of a sitemap. */
export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: ChangeFreq;
  /** `<priority>` normalised to a number in the 0..1 range. */
  priority?: number;
  /** Sitemap document this entry came from — the index child, not the index itself. */
  source?: string;
  /** `xhtml:link rel="alternate"` translations declared for this URL. */
  alternates?: Alternate[];
  /** Number of `<image:image>` children. */
  images?: number;
  /** Number of `<video:video>` children. */
  videos?: number;
  /** Whether the entry carries a `<news:news>` block. */
  news?: boolean;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

/** One `<sitemap>` entry of a sitemap index. */
export interface SitemapRef {
  loc: string;
  lastmod?: string;
}

/** A document that could not be read or parsed. Collected instead of thrown. */
export interface SitemapError {
  source: string;
  message: string;
}

/** The result of reading a sitemap, with every nested index already followed. */
export interface Sitemap {
  entries: SitemapEntry[];
  /** Every document actually read, in the order they were read. */
  sources: string[];
  /** Nested sitemaps found in indexes, whether or not they were followed. */
  refs: SitemapRef[];
  errors: SitemapError[];
}

/** A single parsed document: either a `<urlset>` or a `<sitemapindex>`. */
export interface ParsedDocument {
  kind: 'urlset' | 'sitemapindex';
  entries: SitemapEntry[];
  refs: SitemapRef[];
}

/** A node of the URL tree. Folders and pages share this shape. */
export interface TreeNode {
  /** Path segment used as the label, e.g. `blog` — or the host, for the root. */
  name: string;
  /** Absolute URL prefix this node stands for. Unique within a tree. */
  path: string;
  /** Set when a sitemap entry maps exactly onto this node. Folders have none. */
  entry?: SitemapEntry;
  children: TreeNode[];
  /** Sitemap entries in this subtree, including this node's own. */
  count: number;
  /** Distance from the root, which is 0. */
  depth: number;
  /** Entries dropped from this subtree by `maxDepth`, if any. */
  truncated?: number;
}

export interface TreeStats {
  urls: number;
  /** Nodes that only group other nodes and have no URL of their own. */
  folders: number;
  maxDepth: number;
  hosts: string[];
  withLastmod: number;
  oldest?: string;
  newest?: string;
  images: number;
  videos: number;
}
