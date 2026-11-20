import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import './check.mjs';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const output = resolve('dist'); await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(output, '.stage-'));
const release = `local-blocker-${version}.zip`;
const source = `local-blocker-${version}-source.zip`;
const webstore = `local-blocker-${version}-webstore.zip`;
function zip(cwd, destination) {
  const result = spawnSync('zip', ['-q', '-X', '-r', destination, '.', '-x', '*.DS_Store'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'The zip command is required to package this release.');
}
try {
  const runtime = join(stage, 'runtime'); await cp('extension', runtime, { recursive: true });
  await rm(join(output, webstore), { force: true }); zip(runtime, join(output, webstore));
  for (const file of ['INSTALL.md', 'PRIVACY.md', 'LICENSE']) await cp(file, join(runtime, file));
  await rm(join(output, release), { force: true }); zip(runtime, join(output, release));
  const sourceFolder = join(stage, 'source'); await mkdir(sourceFolder);
  for (const entry of ['extension', 'scripts', 'tests', 'docs', '.github', '.gitignore', 'README.md', 'INSTALL.md', 'PRIVACY.md', 'LICENSE', 'CONTRIBUTING.md', 'CHANGELOG.md', 'package.json', 'package-lock.json', 'playwright.config.js']) await cp(entry, join(sourceFolder, entry), { recursive: true });
  await rm(join(output, source), { force: true }); zip(sourceFolder, join(output, source));
  const checksums = await Promise.all([release, source, webstore].map(async name => `${createHash('sha256').update(await readFile(join(output, name))).digest('hex')}  ${name}`));
  await writeFile(join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
  console.log(`Created ${release}, ${source}, ${webstore}, and SHA256SUMS.txt in dist/.`);
} finally { await rm(stage, { recursive: true, force: true }); }
