# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Getting set up

```bash
npm install          # also generates src/render/assets.generated.ts
npm test
npm run lint
```

The VS Code extension lives in its own workspace:

```bash
npm --prefix vscode-extension install
npm --prefix vscode-extension test
```

Press <kbd>F5</kbd> with the repository root open in VS Code to launch an
Extension Development Host on `test/fixtures`.

## How the pieces fit

- `src/xml.ts` — a single-pass XML scanner, sized for sitemaps. No dependencies
  by design: see the note at the top of the file.
- `src/parse.ts` — one sitemap document to entries. No I/O.
- `src/load.ts` — resolving input, gzip, following indexes, discovery.
- `src/discover.ts` — finding a site's sitemaps via `robots.txt` and probing.
- `src/tree.ts` — entries to a `TreeNode` tree, plus `summarize`.
- `src/render/` — the output formats.
- `src/viewer/` — the browser code for the HTML report, as plain `.css` and
  `.js`. `scripts/build-assets.mjs` inlines both into a generated TypeScript
  module. **Edit the viewer sources, never the generated file.**

The extension bundles the library from `../src` through a tsup alias rather
than depending on the published package, so the two cannot drift apart.

## Before opening a pull request

- `npm run lint && npm test && npm run build` from the root.
- `npm --prefix vscode-extension test` if you touched the extension.
- Add a test. Parser and tree changes are cheap to cover; if you fix a crash,
  a regression test that fails without your change is the ask.
- Keep the package at zero runtime dependencies. That is a feature, not an
  accident: it is what lets the tool run anywhere with no service behind it.

## Reporting a bug

A sitemap that reproduces it is worth more than a description. If it is not
public, a reduced version with the same shape works — the tree only cares about
hosts and path segments.
