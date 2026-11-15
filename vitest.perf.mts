import { defineConfig } from 'vitest/config';
// Scale/performance checks — slow, so kept out of npm test. Run: npm run perf
export default defineConfig({
  test: { include: ['src/**/*.perf.ts'], testTimeout: 1200000 },
});
