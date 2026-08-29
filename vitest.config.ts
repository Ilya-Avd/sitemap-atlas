import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Naming the sources explicitly keeps the report complete: the text
      // table hides files that are fully covered, so a missing row is not
      // evidence of a missing measurement.
      include: ['src/**/*.ts'],
      exclude: [
        // Generated from src/viewer by scripts/build-assets.mjs: two string
        // constants, nothing to exercise.
        'src/render/assets.generated.ts',
        // Re-exports only.
        'src/index.ts',
        // Type declarations, no runtime code.
        'src/types.ts',
        // Exercised by test/cli.test.ts, but through a child process — v8 in
        // this process cannot see it, and counting it as 0% would be a lie in
        // the other direction.
        'src/cli.ts',
      ],
      reporter: ['text', 'html'],
    },
  },
});
