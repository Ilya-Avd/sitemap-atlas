/**
 * A single-pass XML scanner, sized for sitemaps rather than for XML at large.
 *
 * The format sitemaps.org defines is flat and small: a root, one repeated
 * child element, and a handful of leaf elements holding text. That does not
 * need a general parser, a document tree, or the dependency tree one brings —
 * it needs elements and text in document order, which is what this emits.
 *
 * Handled: namespace prefixes, attributes in either quote style, self-closing
 * elements, CDATA, comments, processing instructions, DOCTYPE (including an
 * internal subset), and the five predefined entities plus numeric references.
 * Not handled: custom entity definitions, and validation of any kind — a
 * sitemap that needs either is not a sitemap this tool can help with.
 */

export interface XmlHandler {
  /** `name` has any namespace prefix stripped. Attributes are parsed lazily. */
  open(name: string, attributes: () => Record<string, string>, selfClosing: boolean): void;
  close(name: string): void;
  /** Only called for non-empty text, already entity-decoded. */
  text(value: string): void;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decode the entity references XML defines without a DTD. */
export function decodeEntities(input: string): string {
  if (input.indexOf('&') < 0) return input;

  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      // Lone surrogates and out-of-range values would corrupt the string.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;

      return String.fromCodePoint(code);
    }

    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** `image:loc` and `loc` are the same element as far as a sitemap reader cares. */
const stripPrefix = (name: string): string => {
  const colon = name.indexOf(':');

  return colon < 0 ? name : name.slice(colon + 1);
};

const isSpace = (code: number): boolean => code === 32 || code === 9 || code === 10 || code === 13;

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attributes[stripPrefix(match[1] as string)] = decodeEntities(
      (match[3] ?? match[4] ?? '') as string,
    );
  }

  return attributes;
}

/** Walk `xml`, calling `handler` for each element and text run, in order. */
export function scanXml(xml: string, handler: XmlHandler): void {
  const length = xml.length;
  let cursor = 0;
  let textStart = 0;
  let pending = '';

  /**
   * Text is decoded as it is collected, not at the end: a CDATA section joins
   * the same run but must survive verbatim, so the two cannot share one pass.
   */
  const take = (until: number): void => {
    if (until > textStart) pending += decodeEntities(xml.slice(textStart, until));
  };

  const flushText = (until: number): void => {
    take(until);
    if (!pending) return;
    const value = pending.trim();
    pending = '';
    if (value) handler.text(value);
  };

  while (cursor < length) {
    const open = xml.indexOf('<', cursor);
    if (open < 0) break;

    if (xml.startsWith('<!--', open)) {
      // A comment interrupts the markup, not the text: keep the run contiguous.
      take(open);
      const end = xml.indexOf('-->', open + 4);
      cursor = end < 0 ? length : end + 3;
      textStart = cursor;
      continue;
    }

    if (xml.startsWith('<![CDATA[', open)) {
      // CDATA is text, verbatim: no entity decoding, no trimming until flush.
      take(open);
      const end = xml.indexOf(']]>', open + 9);
      pending += xml.slice(open + 9, end < 0 ? length : end);
      cursor = end < 0 ? length : end + 3;
      textStart = cursor;
      continue;
    }

    if (xml.startsWith('<?', open)) {
      flushText(open);
      const end = xml.indexOf('?>', open + 2);
      cursor = end < 0 ? length : end + 2;
      textStart = cursor;
      continue;
    }

    if (xml.startsWith('<!', open)) {
      flushText(open);
      // A DOCTYPE may carry an internal subset in brackets, which can itself
      // contain '>'; skip past the subset before looking for the real end.
      const bracket = xml.indexOf('[', open);
      const firstEnd = xml.indexOf('>', open);
      if (bracket >= 0 && (firstEnd < 0 || bracket < firstEnd)) {
        const subsetEnd = xml.indexOf(']', bracket);
        const end = subsetEnd < 0 ? -1 : xml.indexOf('>', subsetEnd);
        cursor = end < 0 ? length : end + 1;
      } else {
        cursor = firstEnd < 0 ? length : firstEnd + 1;
      }
      textStart = cursor;
      continue;
    }

    const end = xml.indexOf('>', open);
    if (end < 0) {
      // An unterminated tag is not text; stop rather than emit '<b' as content.
      flushText(open);

      return;
    }
    flushText(open);

    if (xml.charCodeAt(open + 1) === 47 /* / */) {
      handler.close(stripPrefix(xml.slice(open + 2, end).trim()));
    } else {
      const selfClosing = xml.charCodeAt(end - 1) === 47; /* / */
      const inner = xml.slice(open + 1, selfClosing ? end - 1 : end);
      let nameEnd = 0;
      while (nameEnd < inner.length && !isSpace(inner.charCodeAt(nameEnd))) nameEnd++;
      const name = stripPrefix(inner.slice(0, nameEnd));
      if (name) {
        const rest = nameEnd < inner.length ? inner.slice(nameEnd) : '';
        handler.open(name, () => (rest ? parseAttributes(rest) : {}), selfClosing);
        if (selfClosing) handler.close(name);
      }
    }

    cursor = end + 1;
    textStart = cursor;
  }

  flushText(length);
}
