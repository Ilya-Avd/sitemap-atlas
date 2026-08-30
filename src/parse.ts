import { scanXml } from './xml.js';
import type { Alternate, ChangeFreq, ParsedDocument, SitemapEntry, SitemapRef } from './types.js';

const CHANGEFREQS: ReadonlySet<string> = new Set([
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
]);

function parsePriority(raw: string): number | undefined {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return undefined;

  return Math.min(1, Math.max(0, n));
}

function parseChangeFreq(raw: string): ChangeFreq | undefined {
  const value = raw.toLowerCase();

  return CHANGEFREQS.has(value) ? (value as ChangeFreq) : undefined;
}

interface Draft extends SitemapEntry {
  alternates?: Alternate[];
}

/**
 * Parse one sitemap document. Handles both `<urlset>` and `<sitemapindex>`;
 * the caller decides whether to follow the refs an index yields.
 *
 * @param source label used for `entry.source` — a path or URL, not read from.
 */
export function parseSitemap(xml: string, source?: string): ParsedDocument {
  const entries: SitemapEntry[] = [];
  const refs: SitemapRef[] = [];

  let kind: ParsedDocument['kind'] | undefined;
  /** Depth of the element currently being entered. Open and close are paired. */
  let depth = 0;
  /** Depth of the open `<url>` or `<sitemap>`, or -1 when outside one. */
  let recordDepth = -1;
  let entry: Draft | undefined;
  let ref: SitemapRef | undefined;
  /** The leaf element whose text belongs to the record, while it is open. */
  let field: string | undefined;

  scanXml(xml, {
    open(name, attributes) {
      const at = depth++;

      if (kind === undefined) {
        if (name === 'urlset') kind = 'urlset';
        else if (name === 'sitemapindex') kind = 'sitemapindex';

        return;
      }

      if (recordDepth < 0) {
        if (kind === 'urlset' && name === 'url') {
          entry = { loc: '' };
          recordDepth = at;
        } else if (kind === 'sitemapindex' && name === 'sitemap') {
          ref = { loc: '' };
          recordDepth = at;
        }

        return;
      }

      // Only a direct child of the record carries a field. Anything deeper
      // belongs to a media block, whose own <loc> must not win over the page's.
      if (at !== recordDepth + 1) return;

      if (entry) {
        if (name === 'image') {
          entry.images = (entry.images ?? 0) + 1;

          return;
        }
        if (name === 'video') {
          entry.videos = (entry.videos ?? 0) + 1;

          return;
        }
        if (name === 'news') {
          entry.news = true;

          return;
        }
        if (name === 'link') {
          const attrs = attributes();
          const rel = attrs['rel'];
          const hreflang = attrs['hreflang'];
          const href = attrs['href'];
          if ((rel === undefined || rel === 'alternate') && hreflang && href) {
            (entry.alternates ??= []).push({ hreflang, href });
          }

          return;
        }
      }

      field = name;
    },

    text(value) {
      if (!field) return;
      const record = entry ?? ref;
      if (!record) return;
      if (field === 'loc') record.loc += value;
      else if (field === 'lastmod') record.lastmod = (record.lastmod ?? '') + value;
      else if (entry && field === 'changefreq') entry.changefreq = parseChangeFreq(value);
      else if (entry && field === 'priority') entry.priority = parsePriority(value);
    },

    close() {
      const at = --depth;
      field = undefined;
      if (recordDepth < 0 || at !== recordDepth) return;

      if (entry) {
        if (entry.loc) {
          if (source) entry.source = source;
          entries.push(entry);
        }
        entry = undefined;
      } else if (ref) {
        if (ref.loc) refs.push(ref);
        ref = undefined;
      }
      recordDepth = -1;
    },
  });

  if (kind === undefined) {
    throw new Error('not a sitemap: expected a <urlset> or <sitemapindex> root element');
  }

  return { kind, entries, refs };
}
