import { defineConfig } from 'tsup';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Read rather than import: import attributes need Node 20.10+, and the CI
// matrix goes back to 18.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
};

// The extension bundles the library from source rather than depending on the
// published package, so the two always ship in step.
const core = fileURLToPath(new URL('../src/index.ts', import.meta.url));

export default defineConfig({
  entry: { extension: 'src/extension.ts' },
  format: ['cjs'],
  target: 'node18',
  platform: 'node',
  external: ['vscode'],
  clean: true,
  sourcemap: true,
  minify: true,
  // Survives minification, so the bundled build still carries its notice.
  banner: {
    js: `/*! ${pkg.name} v${pkg.version} | MIT | (c) Ilya (@Ilya-Avd) | bundles fast-xml-parser, strnum (MIT) — see THIRD-PARTY-NOTICES.md */`,
  },
  esbuildOptions: (options) => {
    options.alias = { ...options.alias, 'sitemap-atlas': core };
  },
});
