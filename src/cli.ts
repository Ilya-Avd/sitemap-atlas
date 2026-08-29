#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadSitemap } from './load.js';
import { buildTree, summarize } from './tree.js';
import { renderHtml } from './render/html.js';
import { renderText } from './render/text.js';
import { renderMermaid } from './render/mermaid.js';
import pkg from '../package.json' with { type: 'json' };

type Format = 'html' | 'text' | 'mermaid' | 'json';

const HELP = `sitemap-atlas — turn a sitemap.xml into a tree you can actually read

Usage
  sitemap-atlas <file|url|-> [options]

Options
  -o, --out <file>       Write here. The extension picks the format.
  -f, --format <fmt>     html | text | mermaid | json  (default: text, or html with -o *.html)
      --open             Open the result in the default browser
      --depth <n>        Collapse everything below this depth (mermaid defaults to 4)
      --collapse         Merge single-child folder chains (2024/01/15)
      --sort <key>       name | count | lastmod          (default: name)
      --order <dir>      asc | desc
      --limit <n>        Stop after N URLs
      --no-follow        Do not descend into <sitemapindex> children
      --no-discover      Do not look up a site URL in robots.txt / common paths
      --offline          Never touch the network; resolve children to sibling files
      --timeout <ms>     Per-request timeout                (default: 20000)
      --user-agent <ua>  User-Agent for network reads
      --no-color         Plain text output
  -q, --quiet            Suppress progress on stderr
  -h, --help             Show this help
  -v, --version          Show the version

Examples
  sitemap-atlas https://example.com                 # finds the sitemap itself
  sitemap-atlas https://example.com/sitemap.xml
  sitemap-atlas ./sitemap.xml -o report.html --open
  sitemap-atlas ./sitemap_index.xml --offline --collapse -o site.html
  sitemap-atlas ./sitemap.xml -f mermaid --depth 3 > structure.mmd
  curl -s https://example.com/sitemap.xml | sitemap-atlas -
`;

const FORMAT_BY_EXT: Record<string, Format> = {
  '.html': 'html',
  '.htm': 'html',
  '.md': 'mermaid',
  '.mmd': 'mermaid',
  '.mermaid': 'mermaid',
  '.json': 'json',
  '.txt': 'text',
};

/**
 * Reported by the top-level handler. Calling `process.exit` here instead would
 * tear the loop down while a keep-alive socket is still closing, which trips a
 * libuv assertion on Windows after the message is already printed.
 */
class CliError extends Error {}

function fail(message: string): never {
  throw new CliError(message);
}

function toInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} expects a non-negative number, got "${value}"`);
  return n;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function openInBrowser(target: string): void {
  const url = pathToFileURL(target).href;
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      format: { type: 'string', short: 'f' },
      open: { type: 'boolean', default: false },
      depth: { type: 'string' },
      collapse: { type: 'boolean', default: false },
      sort: { type: 'string' },
      order: { type: 'string' },
      limit: { type: 'string' },
      follow: { type: 'boolean', default: true },
      discover: { type: 'boolean', default: true },
      offline: { type: 'boolean', default: false },
      timeout: { type: 'string' },
      'user-agent': { type: 'string' },
      color: { type: 'boolean', default: true },
      quiet: { type: 'boolean', short: 'q', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.help) return void process.stdout.write(HELP);
  if (values.version) return void process.stdout.write(`${pkg.version}\n`);

  const input = positionals[0];
  if (!input) {
    process.stderr.write(HELP);
    process.exitCode = 1;
    return;
  }
  if (positionals.length > 1) {
    // Quietly reading the first and dropping the rest is the worst outcome:
    // the user believes both were included.
    fail(`expected one input, got ${positionals.length}: ${positionals.join(', ')}`);
  }

  const out = values.out;
  const format: Format = (values.format ??
    (out ? (FORMAT_BY_EXT[extname(out).toLowerCase()] ?? 'html') : 'text')) as Format;
  if (!['html', 'text', 'mermaid', 'json'].includes(format)) {
    fail(`unknown format "${format}" — expected html, text, mermaid or json`);
  }

  const sortBy = (values.sort ?? 'name') as 'name' | 'count' | 'lastmod';
  if (!['name', 'count', 'lastmod'].includes(sortBy)) {
    fail(`unknown --sort "${sortBy}" — expected name, count or lastmod`);
  }
  const order = values.order as 'asc' | 'desc' | undefined;
  if (order && !['asc', 'desc'].includes(order)) {
    fail(`unknown --order "${order}" — expected asc or desc`);
  }

  const quiet = values.quiet || format !== 'html';
  const source = input === '-' ? await readStdin() : input;

  const sitemap = await loadSitemap(source, {
    follow: values.follow,
    discover: values.discover,
    offline: values.offline,
    maxUrls: toInt(values.limit, 'limit'),
    timeout: toInt(values.timeout, 'timeout'),
    userAgent: values['user-agent'],
    onProgress: quiet
      ? undefined
      : (read, urls) => process.stderr.write(`  read ${read} — ${urls} URLs\n`),
    // Always worth saying: the user asked for a site and got something else.
    onDiscover: values.quiet
      ? undefined
      : (found) =>
          process.stderr.write(
            `  found ${found.length} sitemap${found.length === 1 ? '' : 's'}: ${found.join(', ')}\n`,
          ),
  });

  if (!sitemap.entries.length) {
    fail(`no URLs found in ${input === '-' ? 'stdin' : input}`);
  }

  const tree = buildTree(sitemap.entries, {
    collapse: values.collapse,
    maxDepth: toInt(values.depth, 'depth'),
    sortBy,
    order,
  });
  const stats = summarize(tree);

  let body: string;
  if (format === 'html') {
    body = renderHtml(tree, stats, {
      source: input === '-' ? 'stdin' : input,
      sourceCount: sitemap.sources.length,
      errors: sitemap.errors,
    });
  } else if (format === 'mermaid') {
    body = renderMermaid(tree, { maxDepth: toInt(values.depth, 'depth') });
  } else if (format === 'json') {
    body = JSON.stringify({ stats, tree }, null, 2);
  } else {
    body = renderText(tree, {
      color: values.color && process.stdout.isTTY === true,
      maxDepth: toInt(values.depth, 'depth'),
    });
  }

  // HTML asked for without a destination still needs one when nobody is piping.
  const target = out ?? (format === 'html' && process.stdout.isTTY ? 'sitemap.html' : undefined);

  if (target) {
    const path = resolve(target);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, body, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        fail(`--out ${target} is a directory; give a file name`);
      }
      throw error;
    }
    if (!values.quiet) {
      const size = (Buffer.byteLength(body) / 1024).toFixed(0);
      process.stderr.write(`${path}  (${stats.urls.toLocaleString('en-US')} URLs, ${size} KB)\n`);
    }
    if (values.open) openInBrowser(path);
  } else {
    process.stdout.write(`${body}\n`);
    if (format === 'text' && process.stdout.isTTY && !values.quiet) {
      process.stderr.write(
        `\n  ${stats.urls.toLocaleString('en-US')} URLs · tip: -o report.html for the interactive view\n`,
      );
    }
  }

  for (const error of sitemap.errors) {
    process.stderr.write(`  ! ${error.source}: ${error.message}\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`sitemap-atlas: ${message}\n`);
  process.exitCode = 1;
});
