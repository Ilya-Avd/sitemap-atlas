import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const workdir = mkdtempSync(join(tmpdir(), 'sitemap-atlas-'));
afterAll(() => rmSync(workdir, { recursive: true, force: true }));

const run = (args: string[], input = ''): string =>
  execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', input, stdio: 'pipe' });

/** Run expecting a non-zero exit; returns what the CLI wrote to stderr. */
function runFailing(args: string[], input = ''): string {
  try {
    execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', input, stdio: 'pipe' });
  } catch (error) {
    const failure = error as { status: number; stderr: string };
    expect(failure.status).toBe(1);
    return failure.stderr;
  }
  throw new Error('expected the command to fail');
}

describe('cli', () => {
  it('prints its version', () => {
    expect(run(['--version']).trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('defaults to a text tree on stdout', () => {
    const out = run([fixture('basic.xml')]);
    expect(out).toContain('example.com');
    expect(out).toContain('└── ');
    expect(out).not.toContain('<!doctype');
  });

  it('reads a sitemap from stdin', () => {
    const xml = readFileSync(fixture('part-a.xml'), 'utf8');
    expect(run(['-'], xml)).toContain('getting-started');
  });

  it('renders mermaid on request', () => {
    expect(run([fixture('basic.xml'), '-f', 'mermaid']).split('\n')[0]).toBe('graph LR');
  });

  it('renders json on request', () => {
    const data = JSON.parse(run([fixture('basic.xml'), '-f', 'json'])) as {
      stats: { urls: number };
      tree: { name: string };
    };
    expect(data.stats.urls).toBe(6);
    expect(data.tree.name).toBe('example.com');
  });

  it('infers the format from the output extension', () => {
    const target = join(workdir, 'report.html');
    run([fixture('basic.xml'), '-o', target]);
    expect(readFileSync(target, 'utf8')).toMatch(/^<!doctype html>/);

    const mmd = join(workdir, 'graph.mmd');
    run([fixture('basic.xml'), '-o', mmd]);
    expect(readFileSync(mmd, 'utf8')).toMatch(/^graph LR/);
  });

  it('creates the output directory', () => {
    const target = join(workdir, 'deep', 'nested', 'out.html');
    run([fixture('basic.xml'), '-o', target]);
    expect(readFileSync(target, 'utf8')).toContain('window.__SITEMAP__');
  });

  it('honours --depth and --limit', () => {
    expect(run([fixture('basic.xml'), '--depth', '1'])).not.toContain('hello-world');
    const data = JSON.parse(run([fixture('basic.xml'), '-f', 'json', '--limit', '2'])) as {
      stats: { urls: number };
    };
    expect(data.stats.urls).toBe(2);
  });

  it('follows a local index offline', () => {
    const out = run([fixture('index.xml'), '--offline']);
    expect(out).toContain('2 hosts');
    expect(out).toContain('checkout');
  });

  it('rejects an unknown --sort', () => {
    expect(runFailing([fixture('basic.xml'), '--sort', 'bogus'])).toMatch(/unknown --sort/);
  });

  it('rejects an unknown --format', () => {
    expect(runFailing([fixture('basic.xml'), '-f', 'pdf'])).toMatch(/unknown format/);
  });

  it('explains an empty stdin instead of reading the working directory', () => {
    expect(runFailing(['-'])).toMatch(/empty input/);
  });

  it('explains a directory passed as the input', () => {
    expect(runFailing([workdir])).toMatch(/is a directory/);
  });

  it('refuses a second input instead of silently dropping it', () => {
    expect(runFailing([fixture('basic.xml'), fixture('part-a.xml')])).toMatch(
      /expected one input, got 2/,
    );
  });

  it('says so when --out names a directory', () => {
    expect(runFailing([fixture('basic.xml'), '-o', workdir])).toMatch(/is a directory/);
  });

  it('exits with the help text when given no input', () => {
    expect(runFailing([])).toContain('Usage');
  });
});

describe('the README keeps up with the CLI', () => {
  const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');

  it('quotes the current option list verbatim', () => {
    // Drift between the two is invisible in review and misleads readers, so it
    // is checked rather than remembered.
    const help = run(['--help']);
    const options = help.slice(help.indexOf('Options'), help.indexOf('\nExamples')).trimEnd();
    expect(readme).toContain(options);
  });

  it('documents every exported function', async () => {
    const api = await import('../src/index.js');
    const functions = Object.entries(api)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    const undocumented = functions.filter((name) => !readme.includes(`\`${name}(`));
    expect(undocumented).toEqual([]);
  });
});
