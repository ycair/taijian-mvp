# Functions deployment artifact

`firebase.json` deploys `.deploy/functions`, not `services/functions`. The
service workspace depends on `@taijian/domain` through pnpm's `workspace:`
protocol, which Cloud Build cannot resolve from an uploaded directory.

## Build the artifact

```bash
pnpm deploy:functions
pnpm deploy:functions:check
```

`pnpm deploy:functions` (`scripts/prepare-functions-deploy.mjs`):

1. builds the bundle with tsup (`@taijian/domain` is bundled in, `noExternal`);
2. runs `pnpm deploy --filter @taijian/functions --prod --legacy .deploy/functions`
   so production dependencies are copied into the artifact;
3. copies `dist/` explicitly (it is gitignored, so the deploy packer skips it);
4. rewrites the artifact `package.json` without `workspace:` dependencies and
   removes sources, tests, `.env`, and the workspace symlink.

`firebase deploy` runs it through the functions `predeploy` hook. CI runs both
commands after `pnpm build`.

## What the check enforces

`pnpm deploy:functions:check` fails when:

- a dependency in the artifact still uses the `workspace:` protocol;
- `node_modules/@taijian` is present;
- `dist/index.js` (the `main` entry) is missing or does not parse;
- a bare `require()` in `dist/index.js` cannot be resolved from the artifact.

## Local emulators and env files

The Functions emulator also loads functions from `.deploy/functions`, so it
needs the local env files there. `pnpm emulators` runs the emulator-prep mode
first:

```bash
pnpm emulators:prep        # node scripts/prepare-functions-deploy.mjs --emulator
pnpm emulators:prep:check  # asserts local env files were copied
pnpm emulators             # prep + firebase emulators:start
```

Emulator-prep copies `services/functions/.env`, `.env.local`, and
`.env.<project>` (default project from `.firebaserc`, or `--project`) into the
artifact **after** it is assembled. All three are gitignored and local-only.

Deploy-prep never copies env files, and strips any that the packer included:

```bash
pnpm deploy:functions
node scripts/check-emulator-env.mjs --mode=deploy   # asserts the artifact has none
pnpm deploy:functions:check
```

`--mode=emulator` (the default for `emulators:prep:check`) fails when a local
env file exists but is missing from the artifact, or when its content differs;
`--mode=deploy` fails when any `.env*` file is present. Both modes pass
trivially when the local files do not exist (CI).

The Firestore/Auth-only suites never load the artifact.

## Rollback

The artifact is generated, never committed (`.deploy/` is gitignored). Re-run
`pnpm deploy:functions` on the previous commit to reproduce an older build.
