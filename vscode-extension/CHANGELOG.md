# Changelog

## [0.1.0] — 2026-08-29

First release.

### Added

- **Sitemap: Open Sitemap Tree** — preview the active `.xml` file, or one
  picked in the explorer, as an interactive tree in a panel.
- **Sitemap: Open Sitemap Tree from URL…** — accepts a sitemap address or a
  plain site address, in which case the sitemap is looked up in `robots.txt`.
- **Sitemap: Export Sitemap Tree as HTML…** — writes a self-contained page.
- Outline and graph views, filtering, URL counts, `lastmod`, and links out to
  every page.
- The panel follows the editor theme and re-renders on save.
- Six settings, under `sitemapAtlas.*`.

### Notes

- The extension bundles no third-party code: the library it ships has no
  dependencies of its own.

- Opening a local file never touches the network. Nested sitemaps resolve to
  the part files sitting next to the index unless `sitemapAtlas.allowNetwork`
  is turned on; typing a URL is treated as consent to fetch it.
