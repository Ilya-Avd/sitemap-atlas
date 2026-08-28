import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

// Read rather than import: import attributes need Node 20.10+, and the CI
// matrix goes back to 18.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
  author: string;
};

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['esm', 'cjs'],
  dts: { entry: { index: 'src/index.ts' } },
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  target: 'node18',
  platform: 'node',
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  // The '!' keeps this through minifiers, so the notice MIT asks for survives
  // even when a consumer bundles the library into their own app.
  banner: {
    js: `/*! ${pkg.name} v${pkg.version} | MIT | (c) ${pkg.author} */`,
  },
});
