#!/usr/bin/env node
/**
 * Checks the env-file contract of the Functions artifact.
 *
 * `firebase.json` points both `firebase deploy` and the Functions emulator at
 * `.deploy/functions`. Deploys must never include env files; emulation must
 * include exactly the local ones Firebase loads, otherwise `pnpm emulators`
 * silently loses `LINE_VERIFY_URL` and cannot reach the mock LINE server.
 *
 * Usage (run after the matching prep):
 *   node scripts/check-emulator-env.mjs --mode=emulator
 *   node scripts/check-emulator-env.mjs --mode=deploy
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceDir = resolve(root, 'services/functions');
const target = resolve(root, '.deploy/functions');

const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith('--mode='));
const mode = modeArg ? modeArg.slice('--mode='.length) : 'emulator';
if (mode !== 'emulator' && mode !== 'deploy') {
  console.error(`[emulator-env:check] FAIL: unknown mode "${mode}"`);
  process.exit(1);
}

function argumentValue(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function projectId() {
  const fromArgs = argumentValue('--project');
  if (fromArgs) return fromArgs;
  try {
    return JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8')).projects?.default;
  } catch {
    return undefined;
  }
}

function fail(message) {
  console.error(`[emulator-env:check] FAIL: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(target)) {
  fail(`missing ${target}; run \`pnpm deploy:functions\` or \`pnpm emulators:prep\` first`);
  process.exit();
}

const project = projectId();
const expected = ['.env', '.env.local', ...(project ? [`.env.${project}`] : [])];
const local = expected.filter((name) => existsSync(resolve(serviceDir, name)));

if (mode === 'emulator') {
  for (const name of local) {
    const copy = resolve(target, name);
    if (!existsSync(copy)) {
      fail(`emulator artifact is missing ${name} (local ${name} exists)`);
      continue;
    }
    if (!readFileSync(copy).equals(readFileSync(resolve(serviceDir, name)))) {
      fail(`${name} in the artifact does not match services/functions/${name}`);
    }
  }
  // If a local file exists, the artifact must carry it: that is the regression.
  if (local.length > 0 && !existsSync(resolve(target, '.env'))) {
    fail('emulator artifact has no .env; local LINE config will be lost');
  }
  console.log(
    local.length > 0
      ? `[emulator-env:check] OK: ${local.join(', ')} copied into the emulator artifact`
      : '[emulator-env:check] OK: no local env files to copy',
  );
} else {
  const envFiles = readdirSync(target).filter(
    (entry) => entry !== '.env.example' && /^\.env(\..+)?$/.test(entry),
  );
  if (envFiles.length > 0) {
    fail(`deploy artifact must not contain env files: ${envFiles.join(', ')}`);
  } else {
    console.log('[emulator-env:check] OK: deploy artifact has no env files');
  }
}
