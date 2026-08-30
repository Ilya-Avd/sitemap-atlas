// Loads the built extension against a stub `vscode` module and drives its
// commands, so the wiring is checked without an Extension Host.
import { createRequire } from 'node:module';
import Module from 'node:module';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../../test/fixtures');

class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
    this.scheme = 'file';
    this.path = fsPath.replace(/\\/g, '/');
  }
  toString() {
    return `file://${this.path}`;
  }
  with({ path }) {
    return new Uri(path.replace(/\//g, '\\'));
  }
  static file(p) {
    return new Uri(p);
  }
}

const panels = [];
const messages = { info: [], warn: [], error: [] };
const commands = new Map();
let settings = {};

const vscode = {
  Uri,
  ViewColumn: { Beside: -2 },
  ProgressLocation: { Window: 10, Notification: 15 },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  commands: {
    registerCommand: (id, handler) => {
      commands.set(id, handler);

      return { dispose() {} };
    },
  },
  window: {
    activeTextEditor: undefined,
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: () => ({ dispose() {} }),
    createWebviewPanel: (type, title) => {
      const panel = {
        type,
        title,
        webview: { html: '' },
        reveal() {},
        onDidDispose() {
          return { dispose() {} };
        },
      };
      panels.push(panel);

      return panel;
    },
    withProgress: (_options, task) => task(),
    showInputBox: async () => undefined,
    showInformationMessage: async (m) => {
      messages.info.push(m);

      return undefined;
    },
    showWarningMessage: async (m) => {
      messages.warn.push(m);

      return undefined;
    },
    showErrorMessage: async (m) => {
      messages.error.push(m);

      return undefined;
    },
    showSaveDialog: async () => undefined,
  },
  workspace: {
    getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
    asRelativePath: (uri) => uri.fsPath,
    onDidSaveTextDocument: () => ({ dispose() {} }),
    fs: { readFile: async () => new Uint8Array(), writeFile: async () => {} },
  },
  env: { openExternal: async () => true },
};

const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return vscode;

  return load.apply(this, [request, ...rest]);
};

const require_ = createRequire(import.meta.url);
const extension = require_(resolve(here, '../dist/extension.js'));

/* --- activate registers every contributed command --- */
const subscriptions = [];
extension.activate({ subscriptions });
assert.deepEqual(
  [...commands.keys()].sort(),
  ['sitemapAtlas.export', 'sitemapAtlas.preview', 'sitemapAtlas.previewFromUrl'],
  'all three commands are registered',
);
assert.equal(subscriptions.length, 3, 'each command is disposable');

/* --- preview renders a webview for a real sitemap --- */
await commands.get('sitemapAtlas.preview')(Uri.file(join(fixtures, 'basic.xml')));
assert.equal(panels.length, 1, 'a panel was created');
const html = panels[0].webview.html;
assert.match(html, /^<!doctype html>/, 'a full document');
assert.match(html, /window\.__SITEMAP__=/, 'the tree payload is inlined');
assert.match(html, /<script nonce="[A-Za-z0-9]{32}">/, 'inline scripts carry a nonce');
assert.match(html, /<style nonce="[A-Za-z0-9]{32}">/, 'the stylesheet carries the same nonce');
assert.match(html, /Content-Security-Policy/, 'a CSP is set');
assert.match(html, /<html lang="en" data-theme="dark">/, 'the editor theme is applied');
assert.match(html, /<b>6<\/b> URLs/, 'the six valid URLs of the fixture are counted');

/* --- opening the same file again reuses the panel instead of stacking them --- */
await commands.get('sitemapAtlas.preview')(Uri.file(join(fixtures, 'basic.xml')));
assert.equal(panels.length, 1, 'the existing panel is revealed, not duplicated');

/* --- a local index resolves its parts from disk without the network --- */
await commands.get('sitemapAtlas.preview')(Uri.file(join(fixtures, 'index.xml')));
const indexPanel = panels.find((p) => p.title.includes('index.xml'));
const indexHtml = indexPanel.webview.html;
assert.match(indexHtml, /<b>4<\/b> URLs/, 'sibling part files were followed offline');
assert.equal(messages.warn.length, 1, 'the unreachable third part is reported');
assert.match(messages.warn[0], /allowNetwork/, 'and points at the setting that would fix it');

/* --- a non-sitemap file fails without throwing at the user --- */
await commands.get('sitemapAtlas.preview')(Uri.file(join(here, 'smoke.mjs')));
const badPanel = panels.find((p) => p.title.includes('smoke.mjs'));
assert.match(badPanel.webview.html, /Could not read/, 'an error page is shown instead');

/* --- settings reach the tree builder on refresh --- */
settings = { collapseChains: true, maxDepth: 1 };
await commands.get('sitemapAtlas.preview')(Uri.file(join(fixtures, 'basic.xml')));
const basicPanel = panels.find((p) => p.title.includes('basic.xml'));
assert.match(basicPanel.webview.html, /<b>1<\/b> levels deep/, 'maxDepth is honoured');
assert.match(basicPanel.webview.html, /<b>6<\/b> URLs/, 'and folded URLs are still counted');

console.log('extension smoke test: all assertions passed');
