import type { SitemapEntry } from './types.js';

/**
 * A plain list of URLs, one per line.
 *
 * The tree only ever needed URLs; XML was just the container they usually
 * arrive in. Accepting a bare list means a crawler export, a `find` run or a
 * clipboard full of links goes through the same pipeline.
 */

const COMMENT = /^\s*(#|\/\/)/;

const isHttpUrl = (line: string): boolean => {
  try {
    return /^https?:$/.test(new URL(line).protocol);
  } catch {
    return false;
  }
};

/** Lines that carry content, with comments and blanks dropped. */
function contentLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !COMMENT.test(line)) out.push(line);
  }

  return out;
}

/**
 * Whether `text` reads as a URL list rather than something else.
 *
 * A simple majority is enough. This is only consulted after XML parsing has
 * already failed, so the alternative to accepting a slightly untidy list — a
 * header row, a trailing note — is an error message; and prose or an HTML page
 * contains no bare URL lines at all, so they are still rejected outright.
 */
export function looksLikeUrlList(text: string): boolean {
  const lines = contentLines(text);
  if (!lines.length) return false;
  const urls = lines.filter(isHttpUrl).length;

  return urls > 0 && urls / lines.length > 0.5;
}

/**
 * Read a URL list into entries. Lines that are not http(s) URLs are skipped —
 * `looksLikeUrlList` has already established that they are the exception.
 */
export function parseUrlList(text: string, source?: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const line of contentLines(text)) {
    // A pasted list often carries a trailing comma or wrapping quotes.
    const loc = line.replace(/^["'\s]+|["',\s]+$/g, '');
    if (!isHttpUrl(loc)) continue;
    entries.push(source ? { loc, source } : { loc });
  }

  return entries;
}
