import * as vscode from 'vscode';
import { SitemapPanel, build, renderForFile } from './panel.js';
import type { Source } from './panel.js';

/** The .xml the command should act on: the argument, the active editor, or nothing. */
function targetUri(argument?: vscode.Uri): vscode.Uri | undefined {
  if (argument instanceof vscode.Uri) return argument;
  const active = vscode.window.activeTextEditor?.document.uri;

  return active?.path.toLowerCase().endsWith('.xml') ? active : undefined;
}

async function askForUrl(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Open sitemap from a site or sitemap URL',
    prompt: 'A site address works too — the sitemap is looked up in robots.txt.',
    placeHolder: 'https://example.com  or  https://example.com/sitemap.xml',
    validateInput: (value) =>
      /^https?:\/\/\S+$/i.test(value.trim()) ? undefined : 'Enter an http(s) URL',
  });
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sitemapAtlas.preview', async (argument?: vscode.Uri) => {
      const uri = targetUri(argument);
      if (!uri) {
        void vscode.window.showInformationMessage('Open a sitemap .xml file first.');

        return;
      }
      await SitemapPanel.show({ kind: 'file', uri });
    }),

    vscode.commands.registerCommand('sitemapAtlas.previewFromUrl', async () => {
      const url = await askForUrl();
      if (url) await SitemapPanel.show({ kind: 'url', url: url.trim() });
    }),

    vscode.commands.registerCommand('sitemapAtlas.export', async (argument?: vscode.Uri) => {
      const uri = targetUri(argument);
      if (!uri) {
        void vscode.window.showInformationMessage('Open a sitemap .xml file first.');

        return;
      }
      const source: Source = { kind: 'file', uri };

      const destination = await vscode.window.showSaveDialog({
        title: 'Export sitemap tree',
        defaultUri: uri.with({ path: `${uri.path.replace(/\.xml$/i, '')}-tree.html` }),
        filters: { 'HTML page': ['html'] },
      });
      if (!destination) return;

      try {
        const result = await build(source);
        const html = renderForFile(result, source);
        await vscode.workspace.fs.writeFile(destination, Buffer.from(html, 'utf8'));
        const open = await vscode.window.showInformationMessage(
          `Exported ${result.stats.urls.toLocaleString('en-US')} URLs.`,
          'Open',
        );
        if (open === 'Open') await vscode.env.openExternal(destination);
      } catch (error) {
        void vscode.window.showErrorMessage(
          `Sitemap export failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
}

export function deactivate(): void {
  /* panels dispose themselves through the subscriptions above */
}
