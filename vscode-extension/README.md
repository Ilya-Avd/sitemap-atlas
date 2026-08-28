# Sitemap Atlas for VS Code

Open any `sitemap.xml` as an interactive tree, without leaving the editor and without uploading it
anywhere.

Open a sitemap, then hit the tree icon in the editor title bar — or run **Sitemap: Open Sitemap
Tree** from the command palette. The panel gives you:

- an **outline** view with URL counts, `lastmod`, and a link out to every page;
- a **graph** view you can pan, zoom and fold;
- instant filtering across the whole tree;
- headline numbers: URLs, folders, depth, `lastmod` coverage, images and video.

The panel follows your editor theme and re-renders when you save the file.

## Commands

| Command | What it does |
| --- | --- |
| `Sitemap: Open Sitemap Tree` | Preview the active `.xml` file, or one picked in the explorer. |
| `Sitemap: Open Sitemap Tree from URL…` | Fetch a sitemap over the network. A plain site address works — the sitemap is looked up in robots.txt. |
| `Sitemap: Export Sitemap Tree as HTML…` | Write the tree to a self-contained HTML file you can share. |

## Sitemap indexes

A `<sitemapindex>` is followed automatically. For a local index the children are resolved to the
part files **sitting next to it**, so a downloaded folder of sitemap parts works offline.

Remote children are only fetched if you turn on `sitemapAtlas.allowNetwork`. Opening a local file is
not treated as permission to fetch whatever URLs that file happens to list; **Open from URL** is,
because you typed the URL.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `sitemapAtlas.allowNetwork` | `false` | Fetch remote `<sitemapindex>` children. |
| `sitemapAtlas.followIndexes` | `true` | Descend into index children at all. |
| `sitemapAtlas.collapseChains` | `false` | Merge single-child folder chains (`2024/01/15`). |
| `sitemapAtlas.maxDepth` | `0` | Fold below this depth. `0` is unlimited. |
| `sitemapAtlas.sortBy` | `name` | `name`, `count` or `lastmod`. |
| `sitemapAtlas.refreshOnSave` | `true` | Re-render when the file is saved. |

## Development

```bash
npm install
npm run build     # bundles the extension with the sitemap-atlas core
npm test          # builds, then drives the commands against a stub vscode module
```

Press <kbd>F5</kbd> in this folder to launch an Extension Development Host.

The tree, the parser and the viewer all come from the [`sitemap-atlas`](../README.md) package in the
parent folder; the extension bundles it from source, so the two never drift apart.

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).

The extension bundles no third-party code — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md),
which the build regenerates from the bundle itself.
