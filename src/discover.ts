/**
 * Finding the sitemap when all you have is the site address: ask robots.txt
 * first, since that is where a site is supposed to advertise it, then try the
 * handful of conventional paths.
 */

/** Probed in order. The first one that parses as a sitemap wins. */
const CANDIDATES = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemap.xml.gz',
  '/wp-sitemap.xml',
  '/sitemap/sitemap.xml',
];

export interface Discovered {
  loc: string;
  /** Set when probing already downloaded it, so the caller need not refetch. */
  body?: string;
}

export type Reader = (url: string) => Promise<string>;

/** Pull the `Sitemap:` directives out of a robots.txt, in the order listed. */
export function parseRobots(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (match?.[1]) found.push(match[1]);
  }

  return [...new Set(found)];
}

/** Cheap check that avoids paying for a full parse on an HTML error page. */
export function looksLikeSitemap(xml: string): boolean {
  return /<(?:[\w-]+:)?(?:urlset|sitemapindex)\b/i.test(xml.slice(0, 4096));
}

/**
 * Whether a discovered host belongs to the site being inspected. `robots.txt`
 * is content, not instruction: a hostile or compromised one could otherwise
 * point the tool at any address it likes. Sitemaps on a sibling host — a CDN,
 * or the apex against `www` — are the legitimate case this allows.
 */
export function sameSite(origin: string, target: string): boolean {
  let a: string;
  let b: string;
  try {
    a = new URL(origin).hostname.toLowerCase();
    b = new URL(target).hostname.toLowerCase();
  } catch {
    return false;
  }

  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export interface DiscoveryResult {
  found: Discovered[];
  /** Advertised sitemaps that were left alone, and why. */
  skipped: { loc: string; reason: string }[];
}

/**
 * Locate the sitemaps of a site: every sitemap `robots.txt` advertises, or the
 * first conventional path that answers with one.
 */
export async function discover(siteUrl: string, read: Reader): Promise<DiscoveryResult> {
  const skipped: DiscoveryResult['skipped'] = [];
  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return { found: [], skipped };
  }

  try {
    const listed = parseRobots(await read(`${origin}/robots.txt`));
    const found: Discovered[] = [];
    for (const entry of listed) {
      // The spec wants an absolute URL here, but relative ones are common
      // enough that resolving beats failing.
      let loc: string;
      try {
        loc = new URL(entry, origin).href;
      } catch {
        skipped.push({ loc: entry, reason: 'not a URL' });
        continue;
      }
      if (!/^https?:$/.test(new URL(loc).protocol)) {
        skipped.push({ loc, reason: 'not http(s)' });
      } else if (!sameSite(origin, loc)) {
        skipped.push({ loc, reason: 'different site' });
      } else {
        found.push({ loc });
      }
    }
    // Trust the site's own answer without downloading each one to check.
    if (found.length) return { found, skipped };
  } catch {
    // No robots.txt is perfectly normal — fall through to the guesses.
  }

  for (const path of CANDIDATES) {
    const loc = `${origin}${path}`;
    try {
      const body = await read(loc);
      if (looksLikeSitemap(body)) return { found: [{ loc, body }], skipped };
    } catch {
      // 404s are expected while probing; keep going.
    }
  }

  return { found: [], skipped };
}

/** Convenience wrapper for callers that only want the locations. */
export async function discoverSitemaps(siteUrl: string, read: Reader): Promise<Discovered[]> {
  return (await discover(siteUrl, read)).found;
}
