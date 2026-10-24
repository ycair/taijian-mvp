#!/usr/bin/env node
/**
 * Verifies the artifact produced by `pnpm deploy:functions` can actually run.
 *
 * The failure this guards against is a package that looks fine locally but
 * cannot install or start on Cloud Build: a leftover `workspace:` dependency,
 * a missing `dist/`, or a bundled require that is not in node_modules.
 *
 * Run after `pnpm deploy:functions` (CI does both).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, '.deploy/functions');
const packagePath = resolve(target, 'package.json');

function fail(message) {
  console.error(`[deploy:functions:check] FAIL: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(packagePath)) {
  fail(`missing ${packagePath}; run \`pnpm deploy:functions\` first`);
  process.exit();
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
  if (String(range).startsWith('workspace:')) {
    fail(`dependency ${name} still uses the workspace protocol`);
  }
}

if (existsSync(resolve(target, 'node_modules/@taijian'))) {
  fail('workspace package node_modules/@taijian must not be in the artifact');
}

const mainPath = resolve(target, pkg.main ?? 'dist/index.js');
if (!existsSync(mainPath)) {
  fail(`main entry ${pkg.main ?? 'dist/index.js'} is missing`);
  process.exit();
}

try {
  // A syntax check is free and catches a broken/minified entry before upload.
  execFileSync(process.execPath, ['--check', mainPath], { stdio: 'pipe' });
} catch (error) {
  fail(`dist entry does not parse: ${error instanceof Error ? error.message : String(error)}`);
}

const entry = readFileSync(mainPath, 'utf8');
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const required = new Set(
  [...entry.matchAll(/require\("([^"]+)"\)/g)]
    .map((match) => match[1])
    .filter((specifier) => !specifier.startsWith('.') && !builtins.has(specifier)),
);

const requireFromArtifact = createRequire(resolve(target, 'package.json'));
for (const specifier of required) {
  try {
    requireFromArtifact.resolve(specifier);
  } catch {
    fail(`dist requires "${specifier}" but it is not installed in the artifact`);
  }
}

if (process.exitCode) {
  process.exit();
}

console.log(
  `[deploy:functions:check] OK: ${required.size} runtime dependencies resolved, no workspace protocols`,
);
