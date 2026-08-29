# Changelog

All notable changes to `sitemap-atlas` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-08-29

First release.

### Added

- `loadSitemap` reads a sitemap from a URL, a file path, or raw XML, following
  nested `<sitemapindex>` documents up to three levels deep.
- Sitemap discovery: given a bare site address, the sitemaps are looked up in
  `robots.txt` and then at the conventional paths. Every sitemap `robots.txt`
  lists is merged. Relative `Sitemap:` lines are resolved against the site, and
  a sitemap advertised on an unrelated host is reported rather than fetched —
  `robots.txt` is content, not instruction.
- Gzip is detected by content rather than by file name, so a `.xml.gz` and a
  gzipped response both work.
- A downloaded index resolves its children to the sibling files next to it,
  which keeps `--offline` useful.
- `buildTree` groups entries by origin and branches on path segments, with
  options for collapsing single-child chains, depth limits and sorting.
- Comparison: `--against` an earlier sitemap tags every URL added, removed or
  changed, and the same tree renders it — green for new, struck through for
  gone, with a running `+N -M` on every folder. `--fail-if-removed` turns that
  into a CI guard.
- A plain list of URLs is accepted anywhere a sitemap is, so a crawler export
  or a pasted column of links goes through the same pipeline.
- Renderers: a self-contained interactive HTML page, a Mermaid graph, a
  terminal tree, CSV, and JSON.
- The `sitemap-atlas` CLI over all of the above.

### Notes

- No runtime dependencies. The XML scanner in `src/xml.ts` reads the subset of
  XML that sitemaps use, which is both smaller and several times faster than a
  general parser on the same input.
- Output is deterministic: documents are read concurrently but assembled in the
  order the index lists them.
- The HTML page is roughly 100 bytes per URL plus a 25 KB viewer, because the
  payload drops what the browser can rebuild and reduces hreflang alternates to
  a count.

[unreleased]: https://github.com/Ilya-Avd/sitemap-atlas/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Ilya-Avd/sitemap-atlas/releases/tag/v0.1.0
