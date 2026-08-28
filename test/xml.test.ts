import { describe, expect, it } from 'vitest';
import { decodeEntities, scanXml } from '../src/xml.js';
import type { XmlHandler } from '../src/xml.js';

/** Collect the scanner's callbacks as a readable trace. */
function trace(xml: string): string[] {
  const out: string[] = [];
  const handler: XmlHandler = {
    open: (name, attributes, selfClosing) => {
      const attrs = attributes();
      const shown = Object.keys(attrs).length ? ` ${JSON.stringify(attrs)}` : '';
      out.push(`<${name}${shown}${selfClosing ? '/' : ''}`);
    },
    close: (name) => out.push(`>${name}`),
    text: (value) => out.push(`"${value}"`),
  };
  scanXml(xml, handler);
  return out;
}

describe('decodeEntities', () => {
  it('decodes the five XML defines', () => {
    expect(decodeEntities('&amp;&lt;&gt;&quot;&apos;')).toBe('&<>"\'');
  });

  it('decodes decimal and hexadecimal references', () => {
    expect(decodeEntities('&#1087;&#x443;&#1090;&#1100;')).toBe('путь');
    expect(decodeEntities('&#128169;')).toBe('💩');
  });

  it('leaves unknown and malformed references alone', () => {
    expect(decodeEntities('&nbsp;')).toBe('&nbsp;');
    expect(decodeEntities('&#xZZ;')).toBe('&#xZZ;');
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;');
    expect(decodeEntities('AT&T')).toBe('AT&T');
  });

  it('refuses lone surrogates, which would corrupt the string', () => {
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
  });

  it('returns the input untouched when there is nothing to do', () => {
    const plain = 'https://example.com/a/b';
    expect(decodeEntities(plain)).toBe(plain);
  });
});

describe('scanXml', () => {
  it('reports elements and text in document order', () => {
    expect(trace('<a><b>one</b><c>two</c></a>')).toEqual([
      '<a',
      '<b',
      '"one"',
      '>b',
      '<c',
      '"two"',
      '>c',
      '>a',
    ]);
  });

  it('strips namespace prefixes from elements and attributes', () => {
    expect(trace('<ns:a xhtml:href="x"><ns:b/></ns:a>')).toEqual([
      '<a {"href":"x"}',
      '<b/',
      '>b',
      '>a',
    ]);
  });

  it('pairs open and close for a self-closing element', () => {
    expect(trace('<a><b/></a>')).toEqual(['<a', '<b/', '>b', '>a']);
  });

  it('reads attributes in either quote style', () => {
    expect(trace(`<a one="1" two='2'/>`)[0]).toBe('<a {"one":"1","two":"2"}/');
  });

  it('decodes entities in attribute values', () => {
    expect(trace('<a href="x?a=1&amp;b=2"/>')[0]).toBe('<a {"href":"x?a=1&b=2"}/');
  });

  it('skips comments without losing the text around them', () => {
    expect(trace('<a>one<!-- note -->two</a>')).toEqual(['<a', '"onetwo"', '>a']);
  });

  it('takes CDATA verbatim, without entity decoding', () => {
    expect(trace('<a><![CDATA[x?a=1&b=2 <not-a-tag>]]></a>')).toEqual([
      '<a',
      '"x?a=1&b=2 <not-a-tag>"',
      '>a',
    ]);
  });

  it('joins CDATA with the text beside it', () => {
    expect(trace('<a>one<![CDATA[two]]>three</a>')).toEqual(['<a', '"onetwothree"', '>a']);
  });

  it('skips the XML declaration and processing instructions', () => {
    expect(trace('<?xml version="1.0"?><a/><?php ?>')).toEqual(['<a/', '>a']);
  });

  it('skips a DOCTYPE, internal subset and all', () => {
    expect(trace('<!DOCTYPE a [<!ENTITY x "y">]><a>t</a>')).toEqual(['<a', '"t"', '>a']);
    expect(trace('<!DOCTYPE a SYSTEM "a.dtd"><a/>')).toEqual(['<a/', '>a']);
  });

  it('ignores whitespace-only text', () => {
    expect(trace('<a>\n  <b/>\n</a>')).toEqual(['<a', '<b/', '>b', '>a']);
  });

  it('stops cleanly on a truncated document', () => {
    expect(trace('<a><b>text')).toEqual(['<a', '<b', '"text"']);
    expect(trace('<a><b')).toEqual(['<a']);
    expect(trace('<a><!-- unterminated')).toEqual(['<a']);
  });

  it('handles an empty document', () => {
    expect(trace('')).toEqual([]);
    expect(trace('   ')).toEqual([]);
  });
});

describe('scanXml CDATA and entities together', () => {
  const textOf = (xml: string): string[] => {
    const out: string[] = [];
    scanXml(xml, { open: () => {}, close: () => {}, text: (v) => out.push(v) });
    return out;
  };

  it('leaves entities inside CDATA alone while decoding those outside', () => {
    expect(textOf('<a><![CDATA[&amp;]]></a>')).toEqual(['&amp;']);
    expect(textOf('<a>&amp;</a>')).toEqual(['&']);
    expect(textOf('<a>&amp;<![CDATA[&amp;]]>&amp;</a>')).toEqual(['&&amp;&']);
  });
});
