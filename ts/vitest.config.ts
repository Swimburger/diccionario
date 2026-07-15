import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    benchmark: {
      // Only source benchmarks; avoids picking up stale compiled copies in dist/.
      include: ['test/**/*.bench.ts']
    }
  }
});
