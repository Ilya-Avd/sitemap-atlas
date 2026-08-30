import * as vscode from 'vscode';
import { buildTree, loadSitemap, renderHtml, summarize } from 'sitemap-atlas';
import type { Sitemap, TreeNode, TreeStats } from 'sitemap-atlas';

/** Where a panel is reading from: a workspace file, or a URL the user typed. */
export type Source = { kind: 'file'; uri: vscode.Uri } | { kind: 'url'; url: string };

const keyOf = (source: Source): string =>
  source.kind === 'file' ? source.uri.toString() : source.url;

const labelOf = (source: Source): string =>
  source.kind === 'file' ? vscode.workspace.asRelativePath(source.uri) : source.url;

function nonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];

  return out;
}

interface Settings {
  allowNetwork: boolean;
  followIndexes: boolean;
  collapseChains: boolean;
  maxDepth: number;
  sortBy: 'name' | 'count' | 'lastmod';
  refreshOnSave: boolean;
}

function settings(): Settings {
  const config = vscode.workspace.getConfiguration('sitemapAtlas');

  return {
    allowNetwork: config.get('allowNetwork', false),
    followIndexes: config.get('followIndexes', true),
    collapseChains: config.get('collapseChains', false),
    maxDepth: config.get('maxDepth', 0),
    sortBy: config.get('sortBy', 'name'),
    refreshOnSave: config.get('refreshOnSave', true),
  };
}

/** Read and shape a sitemap using the user's current settings. */
export async function build(
  source: Source,
): Promise<{ sitemap: Sitemap; tree: TreeNode; stats: TreeStats }> {
  const config = settings();
  // A URL the user typed is consent to fetch it; a local file is not consent to
  // fetch whatever its index happens to point at.
  const offline = source.kind === 'file' && !config.allowNetwork;

  // Hand the loader a real path where there is one: it needs the directory to
  // resolve a <sitemapindex> to the part files sitting next to it.
  const input =
    source.kind === 'url'
      ? source.url
      : source.uri.scheme === 'file'
        ? source.uri.fsPath
        : Buffer.from(await vscode.workspace.fs.readFile(source.uri)).toString('utf8');

  const sitemap = await loadSitemap(input, { offline, follow: config.followIndexes });
  if (!sitemap.entries.length) throw new Error('no <url> entries found in this sitemap');

  const tree = buildTree(sitemap.entries, {
    collapse: config.collapseChains,
    maxDepth: config.maxDepth > 0 ? config.maxDepth : undefined,
    sortBy: config.sortBy,
  });

  return { sitemap, tree, stats: summarize(tree) };
}

type Result = { sitemap: Sitemap; tree: TreeNode; stats: TreeStats };

const isLightTheme = (): boolean =>
  vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
  vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight;

/** A webview needs a nonce on every inline block, and should match the editor theme. */
export function renderForWebview(result: Result, source: Source): string {
  const id = nonce();

  return renderHtml(result.tree, result.stats, {
    source: labelOf(source),
    sourceCount: result.sitemap.sources.length,
    errors: result.sitemap.errors,
    nonce: id,
    csp: `default-src 'none'; style-src 'nonce-${id}'; script-src 'nonce-${id}';`,
    theme: isLightTheme() ? 'light' : 'dark',
  });
}

/** An exported file is read outside the editor, so it follows the reader instead. */
export function renderForFile(result: Result, source: Source): string {
  return renderHtml(result.tree, result.stats, {
    source: labelOf(source),
    sourceCount: result.sitemap.sources.length,
    errors: result.sitemap.errors,
  });
}

export class SitemapPanel {
  private static readonly open = new Map<string, SitemapPanel>();
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly source: Source,
  ) {
    panel.onDidDispose(() => this.dispose(), null, this.disposables);

    if (source.kind === 'file') {
      vscode.workspace.onDidSaveTextDocument(
        (document) => {
          if (
            settings().refreshOnSave &&
            document.uri.toString() === (source as { uri: vscode.Uri }).uri.toString()
          ) {
            void this.refresh();
          }
        },
        null,
        this.disposables,
      );
    }

    // The generated page bakes the palette in, so a theme switch needs a redraw.
    vscode.window.onDidChangeActiveColorTheme(() => void this.refresh(), null, this.disposables);
  }

  static async show(source: Source, column?: vscode.ViewColumn): Promise<void> {
    const existing = SitemapPanel.open.get(keyOf(source));
    if (existing) {
      existing.panel.reveal(column);
      await existing.refresh();

      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'sitemapAtlas.preview',
      `Sitemap · ${labelOf(source)}`,
      column ?? vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    const instance = new SitemapPanel(panel, source);
    SitemapPanel.open.set(keyOf(source), instance);
    await instance.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Reading sitemap' },
        () => build(this.source),
      );
      this.panel.webview.html = renderForWebview(result, this.source);
      if (result.sitemap.errors.length) {
        void vscode.window.showWarningMessage(
          `${result.sitemap.errors.length} nested sitemap(s) could not be read. ${
            this.source.kind === 'file'
              ? 'Enable sitemapAtlas.allowNetwork to fetch remote children.'
              : ''
          }`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.panel.webview.html = errorPage(labelOf(this.source), message);
    }
  }

  private dispose(): void {
    SitemapPanel.open.delete(keyOf(this.source));
    for (const item of this.disposables) item.dispose();
  }
}

function errorPage(label: string, message: string): string {
  const escape = (value: string): string =>
    value.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

  return `<!doctype html><html><body style="font-family:var(--vscode-font-family);padding:24px">
<h3 style="margin:0 0 8px">Could not read ${escape(label)}</h3>
<p style="color:var(--vscode-descriptionForeground)">${escape(message)}</p>
</body></html>`;
}
