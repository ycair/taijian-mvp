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

## Local emulators

`pnpm emulators` runs `pnpm deploy:functions` first and then starts the
Functions emulator from the artifact, so the emulator runs exactly what deploys.
The Firestore/Auth-only suites never load the artifact.

## Rollback

The artifact is generated, never committed (`.deploy/` is gitignored). Re-run
`pnpm deploy:functions` on the previous commit to reproduce an older build.
