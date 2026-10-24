import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Playwright global setup for the local acceptance suite.
 *
 * Seeds the emulator immediately before the tests so `reminder_demo.nextDueAt`
 * is always "today" (a suite started just after midnight must not depend on a
 * seed run from the previous evening) and so no completion document survives
 * from an earlier run.
 *
 * The emulators and the mock LINE server are long-running processes the
 * developer starts manually; this setup only verifies they are reachable and
 * fails with an actionable message if they are not.
 */

const root = resolve(__dirname, '..');

const dependencies = [
  {
    name: 'Firestore emulator',
    url: 'http://127.0.0.1:8080/',
    hint: 'Start it with `pnpm emulators` in another terminal.',
  },
  {
    name: 'Auth emulator',
    url: 'http://127.0.0.1:9099/',
    hint: 'Start it with `pnpm emulators` in another terminal.',
  },
  {
    name: 'Functions emulator',
    url: 'http://127.0.0.1:5001/',
    hint: 'Start it with `pnpm emulators` in another terminal.',
  },
  {
    name: 'mock LINE server',
    url: 'http://127.0.0.1:4010/',
    hint: 'Start it with `pnpm mock:line` in another terminal.',
  },
] as const;

async function assertReachable(name: string, url: string, hint: string): Promise<void> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch {
    throw new Error(
      `[e2e] ${name} is not reachable at ${url}. ${hint}\n` +
        'The E2E suite needs the Firebase emulators, the seedable demo project, and the mock LINE server.',
    );
  }
}

export default async function globalSetup(): Promise<void> {
  for (const dependency of dependencies) {
    await assertReachable(dependency.name, dependency.url, dependency.hint);
  }

  try {
    execSync('pnpm seed', { cwd: root, stdio: 'inherit' });
  } catch (error) {
    throw new Error(
      `[e2e] \`pnpm seed\` failed. Check that the Firestore and Auth emulators are running.\n${String(error)}`,
    );
  }
}
