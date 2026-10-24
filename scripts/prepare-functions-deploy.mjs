#!/usr/bin/env node
/**
 * Builds a self-contained Functions artifact in `.deploy/functions`.
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
 *
 * Two modes:
 *   (default)   deploy artifact: no env files. They contain local credentials
 *               and must never be uploaded.
 *   --emulator  deploy artifact + the local `.env*` files Firebase's emulator
 *               reads, because `firebase.json` points the Functions emulator at
 *               `.deploy/functions` too. Files are gitignored and local-only.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceDir = resolve(root, 'services/functions');
const target = resolve(root, '.deploy/functions');

const args = process.argv.slice(2);
const emulatorMode = args.includes('--emulator');

function argumentValue(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/** Emulator env file names, in Firebase's load order. */
const EMULATOR_ENV_FILES = ['.env', '.env.local'];

function projectId() {
  const fromArgs = argumentValue('--project');
  if (fromArgs) return fromArgs;
  try {
    const firebaserc = JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8'));
    return firebaserc.projects?.default;
  } catch {
    return undefined;
  }
}

function run(command, commandArgs) {
  execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
}

/** Files that only exist for development and must never ship. */
const DEV_ONLY_FILES = [
  'src',
  'test',
  'tsconfig.json',
  'tsup.config.ts',
  'vitest.config.ts',
  'firestore-debug.log',
  'node_modules/@taijian',
];

/**
 * Removes every env file from the artifact. `.env`, `.env.local`, and
 * `.env.<project>` can all carry secrets; none of them may be uploaded.
 */
function removeEnvFiles(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === '.env.example') continue;
    if (/^\.env(\..+)?$/.test(entry)) rmSync(resolve(directory, entry), { force: true });
  }
}

/**
 * Copies the env files the Functions emulator loads. They stay out of the
 * deploy artifact; this only runs for local emulation.
 */
function copyEmulatorEnv(directory, project) {
  const names = [...EMULATOR_ENV_FILES, ...(project ? [`.env.${project}`] : [])];
  const copied = [];
  for (const name of names) {
    const from = resolve(serviceDir, name);
    if (!existsSync(from)) continue;
    cpSync(from, resolve(directory, name));
    copied.push(name);
  }
  return copied;
}

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
removeEnvFiles(target);

if (emulatorMode) {
  const copied = copyEmulatorEnv(target, projectId());
  console.log(
    copied.length > 0
      ? `[deploy:functions] emulator env: ${copied.join(', ')}`
      : '[deploy:functions] emulator env: no local .env files found',
  );
}

console.log(`[deploy:functions] ready: ${target}${emulatorMode ? ' (emulator)' : ''}`);
