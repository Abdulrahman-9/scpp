import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@masaar/working-days': path.resolve(__dirname, 'packages/working-days/src/index.ts'),
      '@masaar/scpp-rules': path.resolve(__dirname, 'packages/scpp-rules/src/index.ts'),
      '@masaar/tokens': path.resolve(__dirname, 'packages/tokens/src/index.ts'),
      '@masaar/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
      '@masaar/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
    },
  },
  // NestJS services use class decorators — enable them for esbuild (jsx kept for web tests)
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        jsx: 'react-jsx',
      },
    },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.{ts,tsx}',
      'apps/*/test/**/*.{test,spec}.{ts,tsx}',
    ],
    /**
     * د17-4 — the suite floor, raised from vitest's 5000ms default.
     *
     * THE ROOT, named: a handful of web tests mount the whole admin or operator shell and then
     * flip the language, so React re-renders every registry, chart and derivation twice over. That
     * work is genuinely seconds long, and it runs while ~55 other files hold the pool's threads —
     * so its wall clock is a function of MACHINE LOAD, not of the assertion being made. Under load
     * it crossed 5000ms and the run failed with no defect behind it (the د5 sighting, and the
     * named debt this batch closes).
     *
     * WHY A FLOOR AND NOT LESS PARALLELISM: capping `maxThreads` or passing `--no-file-parallelism`
     * would also stop the crossing — by making the whole suite take multiples of its current 80s,
     * every run, forever, to protect a handful of tests. The timeout is the smallest general
     * intervention: it changes no test's meaning (a 200ms test still passes in 200ms and a genuine
     * hang still fails, three seconds later than before) and it costs nothing on a green run.
     *
     * WHY 15000 AND NOT MORE: it is three times the observed ceiling of the slow tests and still
     * well under the 20000ms the د5 patch measured for the three language-flip cases — which STAY
     * as explicit per-test timeouts. A test that has measured its own need keeps saying so; this
     * value is only the floor for everything that has not.
     */
    testTimeout: 15000,
  },
});
