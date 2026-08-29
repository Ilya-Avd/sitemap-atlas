import { describe, expect, it } from 'vitest';
import { looksLikeUrlList, parseUrlList } from '../src/urllist.js';

describe('looksLikeUrlList', () => {
  it('accepts a plain list', () => {
    expect(looksLikeUrlList('https://e.com/a\nhttps://e.com/b')).toBe(true);
  });

  it('accepts a list with blanks and comments', () => {
    expect(looksLikeUrlList('# my urls\n\nhttps://e.com/a\n// note\nhttps://e.com/b\n')).toBe(true);
  });

  it('tolerates a stray non-URL line', () => {
    const text = ['https://e.com/1', 'https://e.com/2', 'https://e.com/3', 'trailing note'].join(
      '\n',
    );
    expect(looksLikeUrlList(text)).toBe(true);
  });

  it('rejects an HTML page, a sitemap and prose', () => {
    expect(looksLikeUrlList('<!doctype html><html><body>hi</body></html>')).toBe(false);
    expect(looksLikeUrlList('<urlset><url><loc>https://e.com/a</loc></url></urlset>')).toBe(false);
    expect(looksLikeUrlList('these are some notes\nabout a website\nnothing more')).toBe(false);
  });

  it('rejects empty and comment-only input', () => {
    expect(looksLikeUrlList('')).toBe(false);
    expect(looksLikeUrlList('   \n\n  ')).toBe(false);
    expect(looksLikeUrlList('# nothing here\n# really')).toBe(false);
  });

  it('rejects a list of non-http schemes', () => {
    expect(looksLikeUrlList('ftp://e.com/a\nfile:///tmp/b')).toBe(false);
  });
});

describe('parseUrlList', () => {
  it('reads one URL per line, dropping blanks and comments', () => {
    const entries = parseUrlList('https://e.com/a\n\n# skip\nhttps://e.com/b\n');
    expect(entries).toEqual([{ loc: 'https://e.com/a' }, { loc: 'https://e.com/b' }]);
  });

  it('strips the punctuation a pasted list drags along', () => {
    const entries = parseUrlList(`  "https://e.com/a",\n'https://e.com/b'\n`);
    expect(entries.map((e) => e.loc)).toEqual(['https://e.com/a', 'https://e.com/b']);
  });

  it('skips lines that are not http(s) URLs', () => {
    const entries = parseUrlList('https://e.com/a\nnot a url\nmailto:x@e.com');
    expect(entries.map((e) => e.loc)).toEqual(['https://e.com/a']);
  });

  it('tags entries with the source when given one', () => {
    expect(parseUrlList('https://e.com/a', 'urls.txt')[0]?.source).toBe('urls.txt');
  });
});
