import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, TZ: 'America/Chicago', PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || resolve('.cache/ms-playwright') } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
