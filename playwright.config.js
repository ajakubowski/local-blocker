import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', workers: 1, fullyParallel: false, timeout: 45000, expect: { timeout: 10000 }, reporter: 'list', use: { trace: 'retain-on-failure' } });
