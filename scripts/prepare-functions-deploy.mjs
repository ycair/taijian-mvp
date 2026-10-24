#!/usr/bin/env node
/**
 * Builds a self-contained Functions deployment package in `.deploy/functions`.
 *
 * Why not deploy `services/functions` directly: its package.json depends on
 * `@taijian/domain` through the `workspace:` protocol. Cloud Build (and anyone
 * running `npm install` on the uploaded directory) cannot resolve that, and the
 * workspace link points outside the uploaded tree.
 *
 * `pnpm deploy --legacy` copies the production dependency tree out of the
 * workspace store, `dist/` is copied in explicitly (it is gitignored, so the
 * deploy packer skips it), and the generated package.json drops every workspace
 * dependency. `@taijian/domain` is bundled into dist by tsup (`noExternal`), so
 * nothing at runtime needs it.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceDir = resolve(root, 'services/functions');
const target = resolve(root, '.deploy/functions');

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

/** Files that only exist for development and must never ship. */
const DEV_ONLY_FILES = [
  'src',
  'test',
  'tsconfig.json',
  'tsup.config.ts',
  'vitest.config.ts',
  '.env',
  'firestore-debug.log',
  'node_modules/@taijian',
];

console.log('[deploy:functions] building');
run('pnpm', ['--filter', '@taijian/functions', 'build']);

console.log('[deploy:functions] assembling artifact');
rmSync(target, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
run('pnpm', ['--filter', '@taijian/functions', 'deploy', '--prod', '--legacy', target]);

// dist/ is in .gitignore, and `pnpm deploy` packs only tracked-style files.
cpSync(resolve(serviceDir, 'dist'), resolve(target, 'dist'), { recursive: true });
if (!existsSync(resolve(target, 'dist/index.js'))) {
  throw new Error('build produced no dist/index.js');
}

const packagePath = resolve(target, 'package.json');
const source = JSON.parse(readFileSync(packagePath, 'utf8'));
const dependencies = {};
for (const [name, range] of Object.entries(source.dependencies ?? {})) {
  if (String(range).startsWith('workspace:')) continue;
  dependencies[name] = range;
}

writeFileSync(
  packagePath,
  `${JSON.stringify(
    {
      name: source.name,
      version: source.version,
      private: true,
      type: source.type,
      main: source.main ?? 'dist/index.js',
      engines: source.engines,
      dependencies,
    },
    null,
    2,
  )}\n`,
);

for (const entry of DEV_ONLY_FILES) {
  rmSync(resolve(target, entry), { recursive: true, force: true });
}

console.log(`[deploy:functions] ready: ${target}`);
