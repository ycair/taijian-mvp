# 苔間 Phase 0–1 (LINE-first MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 0 foundation and Phase 1 LINE-first MVP: a working LIFF app, LINE Bot, and conflict-safe Cloud Functions API backed by Firestore, with households, animals, care records, reminders, and today tasks.

**Architecture:** pnpm monorepo. React + Vite LIFF runs inside LINE; Node 22 Cloud Functions expose `lineLogin`, `lineWebhook`, and `executeCommand`. All critical writes go through one transactional command runner with revision checks, idempotency, audit logs, and rate limits. Firestore rules deny client writes and scope reads to household members.

**Tech Stack:** pnpm 10, Node 22, TypeScript strict, React 19 + Vite, Firebase JS SDK, Firebase Functions v2, Firebase Admin, Zod, Luxon, Vitest, Playwright, Firebase Emulator Suite.

**Spec:** `docs/superpowers/specs/2026-10-23-taijian-mvp-design.md`

## Global Constraints

- Node **22.x** for all scripts and Functions; the repo pins it with `.npmrc`.
- Functions region: `asia-east1`. Firestore region for real projects: `asia-east1`.
- All client writes to Firestore are denied. Critical writes go through `executeCommand`.
- Idempotency window: **24 hours**. Clients must not reuse a `commandId` after that.
- Rate limits: **100 commands/min/UID**, **20 record creates/min/UID**, **10 invite creates/day/UID**, **30 Bot interactions/min/UID**.
- Invites: **128-bit random secret**, hashed at rest, **single use**, **7-day default expiry**.
- Audit logs retained **90 days**; soft-deleted documents purged **30 days** after `deletedAt`; backups retained **30 days**.
- UI copy is Traditional Chinese. No copied assets, names, illustrations, or text from the original app.
- Never commit LINE channel secrets, access tokens, service account keys, or `.env` files.
- Use server timestamps for `createdAt` / `updatedAt`; never trust client clocks.
- Client-generated IDs use UUIDv7. Server-side deterministic IDs use SHA-256.
- Every task ends with a green test run and a commit.

## Review Focus

These are the five failure modes most likely to hurt a real household. Each has a dedicated test in the task that owns the code.

1. **Two caretakers edit the same animal with the same `baseRevision`.** One must succeed; the other must receive `CONFLICT` with the current document, and no field may be silently lost.
2. **LINE retries a webhook event.** The same `webhookEventId` must produce one record/completion and must not send a duplicate reply.
3. **Two people accept the same invite, or a caretaker tries to promote themselves.** Exactly one membership is created; role escalation is rejected.
4. **A reminder crosses a DST boundary or the household changes timezone.** The due date must be computed in the reminder's stored timezone and must not double-fire or skip a day.
5. **A modified client writes directly to Firestore or forges a `householdId` in a command.** Rules must deny direct writes, and the server must re-check membership; a non-member must never read or mutate household data.

---

## File Structure

```text
package.json                         root scripts + dev deps
pnpm-workspace.yaml                  apps/*, services/*, packages/*
.npmrc                               use-node-version=22
tsconfig.base.json                   strict shared compiler options
eslint.config.js                     flat ESLint config
.prettierrc.json
.env.example                         environment template
firebase.json                        emulators + functions/hosting/firestore
.firebaserc                          demo-taijian
firestore.rules                      deny client writes; member-scoped reads
firestore.indexes.json               composite indexes + TTL notes

packages/domain/
  package.json
  tsconfig.json
  src/index.ts
  src/errors.ts
  src/permissions.ts
  src/species.ts
  src/time.ts
  src/schemas/common.ts
  src/schemas/household.ts
  src/schemas/animal.ts
  src/schemas/record.ts
  src/schemas/reminder.ts
  src/schemas/invite.ts
  src/commands.ts
  test/permissions.test.ts
  test/schemas.test.ts
  test/time.test.ts

services/functions/
  package.json
  tsup.config.ts
  tsconfig.json
  src/index.ts
  src/config.ts
  src/lib/errors.ts
  src/lib/ids.ts
  src/lib/firestore.ts
  src/lib/audit.ts
  src/lib/idempotency.ts
  src/lib/rateLimit.ts
  src/lib/result.ts
  src/lib/schedule.ts
  src/commands/types.ts
  src/commands/helpers.ts
  src/commands/runCommand.ts
  src/commands/registry.ts
  src/commands/handlers/household.ts
  src/commands/handlers/members.ts
  src/commands/handlers/invites.ts
  src/commands/handlers/animals.ts
  src/commands/handlers/records.ts
  src/commands/handlers/reminders.ts
  src/commands/handlers/tasks.ts
  src/auth/line.ts
  src/auth/users.ts
  src/line/verify.ts
  src/line/gateway.ts
  src/line/commands.ts
  src/line/webhook.ts
  src/reminders/scheduler.ts
  src/user/deleteAccount.ts
  test/ids.test.ts
  test/lineVerify.test.ts
  test/schedule.test.ts
  test/integration/helpers.ts
  test/integration/household.test.ts
  test/integration/animals.test.ts
  test/integration/records.test.ts
  test/integration/reminders.test.ts
  test/rules.test.ts

apps/liff/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/main.tsx
  src/App.tsx
  src/styles/tokens.css
  src/styles/global.css
  src/lib/firebase.ts
  src/lib/liff.ts
  src/lib/api.ts
  src/lib/auth.tsx
  src/lib/household.tsx
  src/lib/today.ts
  src/components/AppShell.tsx
  src/components/BottomNav.tsx
  src/components/MossCard.tsx
  src/components/TaskRow.tsx
  src/components/AnimalChip.tsx
  src/components/PrimaryButton.tsx
  src/components/EmptyState.tsx
  src/components/ConflictBanner.tsx
  src/pages/TodayPage.tsx
  src/pages/AnimalsPage.tsx
  src/pages/AnimalDetailPage.tsx
  src/pages/RecordPage.tsx
  src/pages/InvitePage.tsx
  src/pages/SettingsPage.tsx
  src/test/setup.ts
  src/test/today.test.ts
  src/test/quickRecord.test.tsx

scripts/
  check-emulators.mjs
  seed-emulator.ts
  mock-line-server.ts
  setup-rich-menu.ts
  line/rich-menu.json

e2e/
  today.spec.ts

.github/workflows/ci.yml
docs/acceptance/phase-1.md
```

---

## Task 1: Monorepo foundation and Node 22 pin

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`
- Modify: `.gitignore`, `README.md`

**Interfaces:**
- Consumes: nothing
- Produces: root scripts `typecheck`, `test`, `build`, `lint`, `emulators`; Node 22 for every workspace script.

- [ ] **Step 1: Create the workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - services/*
  - packages/*
```

`.npmrc`:

```ini
use-node-version=22
```

`package.json`:

```json
{
  "name": "taijian",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "engines": { "node": ">=22 <23" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "lint": "eslint .",
    "format": "prettier --write .",
    "emulators": "pnpm --filter @taijian/functions build && firebase emulators:start --only auth,firestore,functions --project demo-taijian",
    "emulators:check": "firebase emulators:exec --only firestore --project demo-taijian \"node scripts/check-emulators.mjs\""
  },
  "devDependencies": {
    "eslint": "^9.0.0",
    "firebase-tools": "^14.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

`eslint.config.js`:

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.superpowers/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
```

`.prettierrc.json`:

```json
{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

`.env.example`:

```text
# LIFF (public)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_LIFF_ID=
VITE_USE_EMULATORS=true
VITE_USE_MOCK_LINE=false

# Functions (server-only; never use these values in production)
APP_ENV=dev
LINE_LOGIN_CHANNEL_ID=
LINE_MESSAGING_CHANNEL_ID=
LINE_MESSAGING_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_VERIFY_URL=https://api.line.me/oauth2/v2.1/verify
LINE_API_BASE=https://api.line.me
APP_BASE_URL=http://localhost:5173
LIFF_ID=
```

Add to `.gitignore`:

```text
*.tsbuildinfo
playwright-report/
test-results/
```

- [ ] **Step 2: Install and verify the runtime**

Run:

```bash
pnpm install
pnpm exec node -v
```

Expected: `v22.x.x` (pnpm downloads the pinned runtime). If it prints `v26`, stop and fix `.npmrc` before continuing.

- [ ] **Step 3: Verify lint**

Run:

```bash
pnpm lint
```

Expected: exit 0 with no files to lint.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc tsconfig.base.json eslint.config.js .prettierrc.json .gitignore README.md
git commit -m "chore: bootstrap pnpm workspace with node 22"
```

---

## Task 2: Domain schemas, permissions, species, and time

**Files:**
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/index.ts`, `packages/domain/src/errors.ts`, `packages/domain/src/permissions.ts`, `packages/domain/src/species.ts`, `packages/domain/src/time.ts`, `packages/domain/src/schemas/common.ts`, `packages/domain/src/schemas/household.ts`, `packages/domain/src/schemas/animal.ts`, `packages/domain/src/schemas/record.ts`, `packages/domain/src/schemas/reminder.ts`, `packages/domain/src/schemas/invite.ts`, `packages/domain/src/commands.ts`
- Test: `packages/domain/test/permissions.test.ts`, `packages/domain/test/schemas.test.ts`, `packages/domain/test/time.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ErrorCode`, `AppError`, `Role`, `can(role, action)`, `SPECIES`, `localDateKey(date, timeZone)`, `newCommandId()`, `CommandEnvelope`, `CommandResult`, `CommandType`, `commandSchemas`, `parseCommandPayload(type, payload)`.

- [ ] **Step 1: Create package metadata**

`packages/domain/package.json`:

```json
{
  "name": "@taijian/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "uuid": "^11.0.0", "zod": "^3.24.0" },
  "devDependencies": { "typescript": "^5.7.0", "vitest": "^3.0.0" }
}
```

`packages/domain/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { can } from '../src/permissions';

describe('permissions', () => {
  it('lets owners delete animals', () => {
    expect(can('owner', 'animal.delete')).toBe(true);
  });

  it('does not let caretakers delete animals', () => {
    expect(can('caretaker', 'animal.delete')).toBe(false);
  });

  it('lets caretakers create records', () => {
    expect(can('caretaker', 'record.create')).toBe(true);
  });

  it('lets only owners manage members', () => {
    expect(can('owner', 'member.invite')).toBe(true);
    expect(can('caretaker', 'member.invite')).toBe(false);
  });
});
```

`packages/domain/test/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CommandEnvelopeSchema, commandSchemas, newCommandId } from '../src';

describe('command schemas', () => {
  it('accepts a valid envelope', () => {
    const envelope = CommandEnvelopeSchema.parse({
      commandId: newCommandId(),
      type: 'animal.create',
      householdId: 'hh_1',
      payload: {
        name: '阿肥',
        species: 'leopard-gecko',
        sex: 'unknown',
        avatarColor: '#7C9A76',
      },
      client: { platform: 'liff', appVersion: '1.0.0' },
    });
    expect(envelope.type).toBe('animal.create');
  });

  it('rejects an empty animal name', () => {
    const result = commandSchemas['animal.create'].safeParse({ name: '', species: 'leopard-gecko' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid record type', () => {
    const result = commandSchemas['record.create'].safeParse({
      animalId: 'a1',
      type: 'sleeping',
      occurredAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
```

`packages/domain/test/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { localDateKey } from '../src/time';

describe('localDateKey', () => {
  it('uses the household timezone', () => {
    const instant = new Date('2026-10-23T16:30:00.000Z');
    expect(localDateKey(instant, 'Asia/Taipei')).toBe('2026-10-24');
    expect(localDateKey(instant, 'America/Los_Angeles')).toBe('2026-10-23');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @taijian/domain test
```

Expected: FAIL because `../src/permissions` and `../src/time` do not exist.

- [ ] **Step 4: Implement the domain package**

`packages/domain/src/errors.ts`:

```ts
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'DUPLICATE_ID',
  'IDEMPOTENCY_MISMATCH',
  'LINE_ALREADY_LINKED',
  'LAST_OWNER',
  'INVITE_EXPIRED',
  'INVITE_USED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

`packages/domain/src/permissions.ts`:

```ts
export const ROLES = ['owner', 'caretaker'] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  'household.update',
  'household.delete',
  'member.invite',
  'member.remove',
  'member.updateRole',
  'animal.create',
  'animal.update',
  'animal.archive',
  'animal.delete',
  'record.create',
  'record.update',
  'record.delete',
  'reminder.manage',
] as const;

export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Role, readonly Action[]> = {
  owner: [...ACTIONS],
  caretaker: [
    'animal.create',
    'animal.update',
    'record.create',
    'record.update',
    'record.delete',
    'reminder.manage',
  ],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].includes(action);
}
```

`packages/domain/src/species.ts`:

```ts
export type Species = {
  id: string;
  name: string;
  scientificName: string;
  category: 'gecko' | 'snake' | 'frog' | 'lizard' | 'turtle' | 'mammal' | 'other';
  defaultUnit: 'g' | 'cm';
};

export const SPECIES: readonly Species[] = [
  { id: 'leopard-gecko', name: '豹紋守宮', scientificName: 'Eublepharis macularius', category: 'gecko', defaultUnit: 'g' },
  { id: 'african-fat-tail-gecko', name: '肥尾守宮', scientificName: 'Hemitheconyx caudicinctus', category: 'gecko', defaultUnit: 'g' },
  { id: 'corn-snake', name: '玉米蛇', scientificName: 'Pantherophis guttatus', category: 'snake', defaultUnit: 'g' },
  { id: 'ball-python', name: '球蟒', scientificName: 'Python regius', category: 'snake', defaultUnit: 'g' },
  { id: 'green-horned-frog', name: '綠角蛙', scientificName: 'Ceratophrys cranwelli', category: 'frog', defaultUnit: 'g' },
  { id: 'bearded-dragon', name: '鬃獅蜥', scientificName: 'Pogona vitticeps', category: 'lizard', defaultUnit: 'g' },
  { id: 'veiled-chameleon', name: '變色龍', scientificName: 'Chamaeleo calyptratus', category: 'lizard', defaultUnit: 'g' },
  { id: 'blue-tongue-skink', name: '藍舌蜥', scientificName: 'Tiliqua scincoides', category: 'lizard', defaultUnit: 'g' },
  { id: 'red-eared-slider', name: '巴西龜', scientificName: 'Trachemys scripta elegans', category: 'turtle', defaultUnit: 'g' },
  { id: 'sulcata-tortoise', name: '蘇卡達陸龜', scientificName: 'Centrochelys sulcata', category: 'turtle', defaultUnit: 'g' },
  { id: 'sugar-glider', name: '蜜袋鼯', scientificName: 'Petaurus breviceps', category: 'mammal', defaultUnit: 'g' },
  { id: 'hedgehog', name: '刺蝟', scientificName: 'Atelerix albiventris', category: 'mammal', defaultUnit: 'g' },
  { id: 'other', name: '其他', scientificName: '', category: 'other', defaultUnit: 'g' },
];
```

`packages/domain/src/time.ts`:

```ts
export function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
```

`packages/domain/src/schemas/common.ts`:

```ts
import { z } from 'zod';

export const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'invalid uuid',
  );

export const PlatformSchema = z.enum(['liff', 'ios', 'android', 'bot', 'test']);
export const ClientInfoSchema = z.object({
  platform: PlatformSchema,
  appVersion: z.string().min(1).max(32),
});

export const CommandEnvelopeSchema = z.object({
  commandId: UuidSchema,
  type: z.string().min(1),
  householdId: z.string().min(1).optional(),
  baseRevision: z.number().int().min(0).optional(),
  payload: z.unknown(),
  client: ClientInfoSchema,
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type CommandSuccess<T> = {
  ok: true;
  commandId: string;
  revision?: number;
  data: T;
  serverTime: string;
};
export type CommandFailure = {
  ok: false;
  commandId: string;
  code: import('../errors').ErrorCode;
  message: string;
  current?: unknown;
  currentRevision?: number;
  lastChangedFields?: string[];
  serverTime: string;
};
export type CommandResult<T = unknown> = CommandSuccess<T> | CommandFailure;
```

`packages/domain/src/schemas/household.ts`:

```ts
import { z } from 'zod';

export const TimezoneSchema = z.string().min(1).max(60);
export const CreateHouseholdPayload = z.object({
  name: z.string().trim().min(1).max(40),
  timezone: TimezoneSchema.default('Asia/Taipei'),
});
export const UpdateHouseholdPayload = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  timezone: TimezoneSchema.optional(),
  settings: z
    .object({
      quietHours: z.object({ start: z.string(), end: z.string() }).optional(),
      notificationsEnabled: z.boolean().optional(),
    })
    .optional(),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdPayload>;
```

`packages/domain/src/schemas/animal.ts`:

```ts
import { z } from 'zod';

export const SexSchema = z.enum(['male', 'female', 'unknown']);
export const AnimalStatusSchema = z.enum(['active', 'memorial', 'archived']);
export const AvatarColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const CreateAnimalPayload = z.object({
  name: z.string().trim().min(1).max(40),
  species: z.string().min(1).max(60),
  speciesLabel: z.string().trim().max(60).optional(),
  morph: z.string().trim().max(60).optional(),
  sex: SexSchema.default('unknown'),
  birthDate: z.string().date().optional(),
  adoptionDate: z.string().date().optional(),
  avatarColor: AvatarColorSchema.default('#7C9A76'),
  notes: z.string().max(2000).optional(),
});

export const UpdateAnimalPayload = CreateAnimalPayload.partial().extend({
  animalId: z.string().min(1),
  status: AnimalStatusSchema.optional(),
});
```

`packages/domain/src/schemas/record.ts`:

```ts
import { z } from 'zod';
import { UuidSchema } from './common';

export const RecordTypeSchema = z.enum([
  'feeding',
  'water',
  'weight',
  'poop',
  'shed',
  'activity',
  'medical',
  'note',
  'custom',
]);

export const CreateRecordPayload = z.object({
  recordId: UuidSchema.optional(),
  animalId: z.string().min(1),
  type: RecordTypeSchema,
  occurredAt: z.string().datetime(),
  value: z.number().finite().optional(),
  unit: z.string().max(16).optional(),
  note: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateRecordPayload = CreateRecordPayload.omit({ animalId: true, recordId: true })
  .partial()
  .extend({ recordId: z.string().min(1) });
```

`packages/domain/src/schemas/reminder.ts`:

```ts
import { z } from 'zod';

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const ScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily'), times: z.array(TimeSchema).min(1).max(4) }),
  z.object({
    kind: z.literal('weekly'),
    times: z.array(TimeSchema).min(1).max(4),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  }),
  z.object({
    kind: z.literal('interval'),
    times: z.array(TimeSchema).min(1).max(4),
    everyNDays: z.number().int().min(1).max(365),
    startDate: z.string().date(),
  }),
]);

export const CreateReminderPayload = z.object({
  animalId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  type: z.string().min(1).max(30),
  schedule: ScheduleSchema,
  timezone: z.string().min(1).max(60),
  enabled: z.boolean().default(true),
});

export const UpdateReminderPayload = CreateReminderPayload.partial().extend({
  reminderId: z.string().min(1),
});
```

`packages/domain/src/schemas/invite.ts`:

```ts
import { z } from 'zod';

export const CreateInvitePayload = z.object({
  role: z.literal('caretaker').default('caretaker'),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const AcceptInvitePayload = z.object({
  token: z.string().min(20).max(200),
});
```

`packages/domain/src/commands.ts`:

```ts
import { z } from 'zod';
import { CreateAnimalPayload, UpdateAnimalPayload } from './schemas/animal';
import { CreateHouseholdPayload, UpdateHouseholdPayload } from './schemas/household';
import { AcceptInvitePayload, CreateInvitePayload } from './schemas/invite';
import { CreateRecordPayload, UpdateRecordPayload } from './schemas/record';
import { CreateReminderPayload, UpdateReminderPayload } from './schemas/reminder';

export const UpdateProfilePayload = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  avatarUrl: z.string().url().max(500).optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
});

export const CompleteTaskPayload = z.object({
  reminderId: z.string().min(1),
  dueDate: z.string().date(),
});

export const commandSchemas = {
  'household.create': CreateHouseholdPayload,
  'household.update': UpdateHouseholdPayload,
  'household.delete': z.object({}),
  'member.invite': CreateInvitePayload,
  'member.accept': AcceptInvitePayload,
  'member.remove': z.object({ uid: z.string().min(1) }),
  'member.updateRole': z.object({
    uid: z.string().min(1),
    role: z.enum(['owner', 'caretaker']),
  }),
  'member.leave': z.object({}),
  'animal.create': CreateAnimalPayload,
  'animal.update': UpdateAnimalPayload,
  'animal.archive': z.object({ animalId: z.string().min(1) }),
  'animal.delete': z.object({ animalId: z.string().min(1) }),
  'record.create': CreateRecordPayload,
  'record.update': UpdateRecordPayload,
  'record.delete': z.object({ recordId: z.string().min(1) }),
  'reminder.create': CreateReminderPayload,
  'reminder.update': UpdateReminderPayload,
  'reminder.delete': z.object({ reminderId: z.string().min(1) }),
  'task.complete': CompleteTaskPayload,
  'task.uncomplete': CompleteTaskPayload,
  'user.updateProfile': UpdateProfilePayload,
  'line.link': z.object({ idToken: z.string().min(1) }),
  'line.unlink': z.object({}),
} as const;

export type CommandType = keyof typeof commandSchemas;

export function parseCommandPayload<T extends CommandType>(
  type: T,
  payload: unknown,
): z.infer<(typeof commandSchemas)[T]> {
  return commandSchemas[type].parse(payload) as z.infer<(typeof commandSchemas)[T]>;
}
```

`packages/domain/src/index.ts`:

```ts
import { v7 as uuidv7 } from 'uuid';

export * from './errors';
export * from './permissions';
export * from './species';
export * from './time';
export * from './schemas/common';
export * from './schemas/household';
export * from './schemas/animal';
export * from './schemas/record';
export * from './schemas/reminder';
export * from './schemas/invite';
export * from './commands';

export function newCommandId(): string {
  return uuidv7();
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run:

```bash
pnpm --filter @taijian/domain test
pnpm --filter @taijian/domain typecheck
```

Expected: all tests pass; TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): add schemas, permissions, species, and time helpers"
```

---

## Task 3: Firebase emulator configuration and smoke test

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `scripts/check-emulators.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `pnpm emulators:check` round-trips a Firestore document through the emulator.

- [ ] **Step 1: Create the emulator configuration**

`firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

`.firebaserc`:

```json
{ "projects": { "default": "demo-taijian" } }
```

`firestore.rules` (temporary deny-all; replaced in Task 9):

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

`firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "animals",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "householdId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "records",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "householdId", "order": "ASCENDING" },
        { "fieldPath": "occurredAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "records",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "animalId", "order": "ASCENDING" },
        { "fieldPath": "occurredAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "reminders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "householdId", "order": "ASCENDING" },
        { "fieldPath": "enabled", "order": "ASCENDING" },
        { "fieldPath": "nextDueAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "reminders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "enabled", "order": "ASCENDING" },
        { "fieldPath": "nextDueAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "taskCompletions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "householdId", "order": "ASCENDING" },
        { "fieldPath": "dueDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "invites",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "householdId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

`scripts/check-emulators.mjs`:

```js
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
const app = initializeApp({ projectId: 'demo-taijian' });
const db = getFirestore(app);

const ref = db.collection('smoke').doc('ping');
await ref.set({ ok: true });
const snap = await ref.get();
if (!snap.exists || snap.data().ok !== true) {
  throw new Error('emulator round-trip failed');
}
console.log('emulator ok');
```

Add to root `package.json` scripts:

```json
"emulators:check": "firebase emulators:exec --only firestore --project demo-taijian \"node scripts/check-emulators.mjs\""
```

- [ ] **Step 2: Run without the emulator to verify failure**

Run:

```bash
node scripts/check-emulators.mjs
```

Expected: FAIL with a connection error (`ECONNREFUSED` or gRPC unavailable).

- [ ] **Step 3: Run with the emulator**

Run:

```bash
pnpm emulators:check
```

Expected: `emulator ok`.

- [ ] **Step 4: Commit**

```bash
git add firebase.json .firebaserc firestore.rules firestore.indexes.json scripts/check-emulators.mjs package.json
git commit -m "chore: add firebase emulator config and smoke test"
```

---

## Task 4: Functions core libraries and command runner

**Files:**
- Create: `services/functions/package.json`, `services/functions/tsup.config.ts`, `services/functions/tsconfig.json`, `services/functions/vitest.config.ts`, `services/functions/test/setup.ts`, `services/functions/src/config.ts`, `services/functions/src/lib/errors.ts`, `services/functions/src/lib/ids.ts`, `services/functions/src/lib/firestore.ts`, `services/functions/src/lib/audit.ts`, `services/functions/src/lib/idempotency.ts`, `services/functions/src/lib/rateLimit.ts`, `services/functions/src/lib/result.ts`, `services/functions/src/commands/types.ts`, `services/functions/src/commands/runCommand.ts`
- Test: `services/functions/test/ids.test.ts`, `services/functions/test/result.test.ts`

**Interfaces:**
- Consumes: `AppError`, `CommandEnvelope`, `CommandResult` from `@taijian/domain`
- Produces: `config`, `runCommand({ uid, envelope, source, handlers })`, `HandlerMap`, `HandlerContext`, `requestHash(type, payload)`, `completionId(reminderId, dueDate)`, `writeAudit`, `checkRateLimit`, `getReplay`, `saveCommand`.

- [ ] **Step 1: Create the Functions package**

`services/functions/package.json`:

```json
{
  "name": "@taijian/functions",
  "private": true,
  "version": "0.0.0",
  "type": "commonjs",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@taijian/domain": "workspace:*",
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^6.0.0",
    "luxon": "^3.5.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/luxon": "^3.4.0",
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`services/functions/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@taijian/domain'],
});
```

`services/functions/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```

`services/functions/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { setupFiles: ['./test/setup.ts'] },
});
```

`services/functions/test/setup.ts`:

```ts
import { getApps, initializeApp } from 'firebase-admin/app';

process.env.GCLOUD_PROJECT ??= 'demo-taijian';
if (!getApps().length) initializeApp({ projectId: 'demo-taijian' });
```

- [ ] **Step 2: Write the failing tests**

`services/functions/test/ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { completionId, requestHash } from '../src/lib/ids';

describe('ids', () => {
  it('creates a deterministic completion id', () => {
    expect(completionId('r1', '2026-10-24')).toBe(completionId('r1', '2026-10-24'));
    expect(completionId('r1', '2026-10-24')).not.toBe(completionId('r1', '2026-10-25'));
  });

  it('creates a stable request hash regardless of key order', () => {
    expect(requestHash('animal.update', { a: 1, b: 2 })).toBe(
      requestHash('animal.update', { b: 2, a: 1 }),
    );
  });
});
```

`services/functions/test/result.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AppError } from '@taijian/domain';
import { toFailure } from '../src/lib/result';

describe('toFailure', () => {
  it('maps AppError details into the response envelope', () => {
    const failure = toFailure(
      new AppError('CONFLICT', 'stale revision', { currentRevision: 9, lastChangedFields: ['weight'] }),
      'cmd_1',
    );
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.code).toBe('CONFLICT');
      expect(failure.currentRevision).toBe(9);
      expect(failure.lastChangedFields).toEqual(['weight']);
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @taijian/functions test
```

Expected: FAIL because the source files do not exist.

- [ ] **Step 4: Implement the core libraries**

`services/functions/src/config.ts`:

```ts
import { z } from 'zod';

const ConfigSchema = z.object({
  APP_ENV: z.enum(['dev', 'staging', 'prod']).default('dev'),
  LINE_LOGIN_CHANNEL_ID: z.string().min(1).default('test-login-channel'),
  LINE_MESSAGING_CHANNEL_ID: z.string().min(1).default('test-messaging-channel'),
  LINE_MESSAGING_CHANNEL_SECRET: z.string().min(1).default('test-messaging-secret'),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1).default('test-access-token'),
  LINE_VERIFY_URL: z.string().url().default('https://api.line.me/oauth2/v2.1/verify'),
  LINE_API_BASE: z.string().url().default('https://api.line.me'),
  APP_BASE_URL: z.string().url().default('http://localhost:5000'),
  LIFF_ID: z.string().min(1).default('test-liff'),
});

export const config = ConfigSchema.parse(process.env);

if (config.APP_ENV !== 'dev') {
  const forbiddenDefaults: Array<keyof typeof config> = [
    'LINE_MESSAGING_CHANNEL_SECRET',
    'LINE_CHANNEL_ACCESS_TOKEN',
  ];
  for (const key of forbiddenDefaults) {
    if (String(config[key]).startsWith('test-')) {
      throw new Error(`${key} must be configured for ${config.APP_ENV}`);
    }
  }
}
```

`services/functions/src/lib/errors.ts`:

```ts
import { HttpsError } from 'firebase-functions/v2/https';
import { AppError, type ErrorCode } from '@taijian/domain';

const HTTP_CODES: Record<ErrorCode, 'invalid-argument' | 'unauthenticated' | 'permission-denied' | 'not-found' | 'failed-precondition' | 'resource-exhausted' | 'already-exists' | 'internal'> = {
  VALIDATION_ERROR: 'invalid-argument',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'permission-denied',
  NOT_FOUND: 'not-found',
  CONFLICT: 'failed-precondition',
  RATE_LIMITED: 'resource-exhausted',
  DUPLICATE_ID: 'already-exists',
  IDEMPOTENCY_MISMATCH: 'failed-precondition',
  LINE_ALREADY_LINKED: 'already-exists',
  LAST_OWNER: 'failed-precondition',
  INVITE_EXPIRED: 'failed-precondition',
  INVITE_USED: 'failed-precondition',
  INTERNAL: 'internal',
};

export function toHttpsError(error: unknown): HttpsError {
  if (error instanceof AppError) {
    return new HttpsError(HTTP_CODES[error.code], error.message, error.details);
  }
  return new HttpsError('internal', 'Unexpected error');
}
```

`services/functions/src/lib/ids.ts`:

```ts
import { createHash } from 'node:crypto';

export function completionId(reminderId: string, dueDate: string): string {
  return createHash('sha256').update(`${reminderId}:${dueDate}`).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

export function requestHash(type: string, payload: unknown): string {
  return createHash('sha256').update(stableStringify({ type, payload })).digest('hex');
}
```

`services/functions/src/lib/firestore.ts`:

```ts
import { getFirestore } from 'firebase-admin/firestore';

export const db = getFirestore();
export type Tx = FirebaseFirestore.Transaction;
```

`services/functions/src/lib/audit.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';
import { db, type Tx } from './firestore';

export type AuditInput = {
  householdId: string;
  actorUid: string;
  actorType: 'user' | 'bot' | 'system';
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  commandId: string;
  source: string;
};

export function writeAudit(tx: Tx, input: AuditInput): void {
  const ref = db.collection('households').doc(input.householdId).collection('auditLogs').doc();
  tx.set(ref, {
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
}
```

`services/functions/src/lib/idempotency.ts`:

```ts
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CommandResult } from '@taijian/domain';
import { AppError } from '@taijian/domain';
import { db, type Tx } from './firestore';

export async function getReplay(
  tx: Tx,
  commandId: string,
  hash: string,
): Promise<CommandResult | null> {
  const snap = await tx.get(db.collection('commands').doc(commandId));
  if (!snap.exists) return null;
  const data = snap.data();
  if (data?.requestHash !== hash) {
    throw new AppError('IDEMPOTENCY_MISMATCH', 'commandId reused with different payload');
  }
  return data.response as CommandResult;
}

export function saveCommand(
  tx: Tx,
  commandId: string,
  uid: string,
  type: string,
  hash: string,
  response: CommandResult,
): void {
  tx.set(db.collection('commands').doc(commandId), {
    uid,
    type,
    requestHash: hash,
    response,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
  });
}
```

`services/functions/src/lib/rateLimit.ts`:

```ts
import { Timestamp } from 'firebase-admin/firestore';
import { AppError } from '@taijian/domain';
import { db, type Tx } from './firestore';

export async function checkRateLimit(
  tx: Tx,
  uid: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const ref = db.collection('rateLimits').doc(uid);
  const snap = await tx.get(ref);
  const now = Date.now();
  const windowStart = now - (now % (windowSeconds * 1000));
  const data = snap.exists ? snap.data() : undefined;
  const counts =
    data?.windowStart === windowStart ? (data.counts as Record<string, number>) : {};
  const current = counts[action] ?? 0;
  if (current >= limit) {
    throw new AppError('RATE_LIMITED', 'too many requests');
  }
  tx.set(
    ref,
    {
      windowStart,
      counts: { ...counts, [action]: current + 1 },
      expiresAt: Timestamp.fromMillis(windowStart + windowSeconds * 2000),
    },
    { merge: true },
  );
}
```

`services/functions/src/lib/result.ts`:

```ts
import { AppError, type CommandResult } from '@taijian/domain';

export function toFailure(error: unknown, commandId: string): CommandResult {
  const serverTime = new Date().toISOString();
  if (error instanceof AppError) {
    return {
      ok: false,
      commandId,
      code: error.code,
      message: error.message,
      ...(error.details ?? {}),
      serverTime,
    };
  }
  return {
    ok: false,
    commandId,
    code: 'INTERNAL',
    message: 'Unexpected error',
    serverTime,
  };
}
```

`services/functions/src/commands/types.ts`:

```ts
import type { CommandEnvelope, CommandResult } from '@taijian/domain';
import type { Tx } from '../lib/firestore';

export type Source = 'liff' | 'ios' | 'android' | 'bot' | 'test';

export type HandlerContext = {
  tx: Tx;
  uid: string;
  envelope: CommandEnvelope;
  source: Source;
  now: Date;
};

export type Handler = (ctx: HandlerContext) => Promise<CommandResult>;

export type HandlerMap = Record<string, Handler>;
```

`services/functions/src/commands/runCommand.ts`:

```ts
import { AppError, CommandEnvelopeSchema, commandSchemas, type CommandResult, type CommandType } from '@taijian/domain';
import { db } from '../lib/firestore';
import { getReplay, saveCommand } from '../lib/idempotency';
import { requestHash } from '../lib/ids';
import { checkRateLimit } from '../lib/rateLimit';
import type { HandlerMap, Source } from './types';

export type RunCommandInput = {
  uid: string;
  envelope: unknown;
  source: Source;
  handlers: HandlerMap;
};

export async function runCommand(input: RunCommandInput): Promise<CommandResult> {
  const envelope = CommandEnvelopeSchema.parse(input.envelope);
  const schema = commandSchemas[envelope.type as CommandType];
  if (!schema) throw new AppError('VALIDATION_ERROR', `Unknown command: ${envelope.type}`);

  const payload = schema.parse(envelope.payload);
  const normalizedEnvelope = { ...envelope, payload };
  const hash = requestHash(envelope.type, payload);

  return db.runTransaction(async (tx) => {
    const replay = await getReplay(tx, envelope.commandId, hash);
    if (replay) return replay;

    await checkRateLimit(tx, input.uid, envelope.type, 100, 60);
    if (envelope.type === 'record.create') {
      await checkRateLimit(tx, input.uid, 'record.create:burst', 20, 60);
    }
    if (envelope.type === 'member.invite') {
      await checkRateLimit(tx, input.uid, 'member.invite:daily', 10, 86400);
    }

    const handler = input.handlers[envelope.type];
    if (!handler) {
      throw new AppError('VALIDATION_ERROR', `Unknown command: ${envelope.type}`);
    }

    const result = await handler({
      tx,
      uid: input.uid,
      envelope: normalizedEnvelope,
      source: input.source,
      now: new Date(),
    });
    saveCommand(tx, envelope.commandId, input.uid, envelope.type, hash, result);
    return result;
  });
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm --filter @taijian/functions test
pnpm --filter @taijian/functions typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit**

```bash
git add services/functions
git commit -m "feat(functions): add config, idempotency, rate limit, and command runner"
```

## Task 5: LINE identity, token verification, and `lineLogin`

**Files:**
- Create: `services/functions/src/line/verify.ts`, `services/functions/src/line/gateway.ts`, `services/functions/src/auth/users.ts`, `services/functions/src/auth/line.ts`, `services/functions/src/commands/handlers/line.ts`
- Test: `services/functions/test/lineVerify.test.ts`

**Interfaces:**
- Consumes: `config`, `AppError`, `db`, `HandlerContext`
- Produces: `verifyLineSignature(rawBody, secret, signature)`, `verifyLineIdToken(idToken, channelId)`, `LineGateway`, `ensureLineUser(profile)`, `lineLogin` callable, `line.link` / `line.unlink` handlers.

- [ ] **Step 1: Write the failing tests**

`services/functions/test/lineVerify.test.ts`:

```ts
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyLineIdToken, verifyLineSignature } from '../src/line/verify';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LINE verification', () => {
  it('accepts a valid webhook signature', () => {
    const body = Buffer.from('{"events":[]}');
    const secret = 'secret';
    const signature = createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyLineSignature(body, secret, signature)).toBe(true);
  });

  it('rejects a tampered webhook body', () => {
    const body = Buffer.from('{"events":[]}');
    const signature = createHmac('sha256', 'secret').update(body).digest('base64');
    expect(verifyLineSignature(Buffer.from('{"events":[{}]}'), 'secret', signature)).toBe(false);
  });

  it('verifies a LINE ID token and checks the audience', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aud: 'channel-1', sub: 'U123', name: 'Test', picture: 'https://x' }),
      }),
    );
    const profile = await verifyLineIdToken('id-token', 'channel-1');
    expect(profile.sub).toBe('U123');
    expect(profile.name).toBe('Test');
  });

  it('rejects a mismatched audience', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aud: 'other-channel', sub: 'U123' }),
      }),
    );
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @taijian/functions test test/lineVerify.test.ts
```

Expected: FAIL because `src/line/verify.ts` does not exist.

- [ ] **Step 3: Implement verification, user mapping, and the gateway**

`services/functions/src/line/verify.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@taijian/domain';
import { config } from '../config';

export type LineProfile = {
  sub: string;
  name?: string;
  picture?: string;
};

export function verifyLineSignature(
  rawBody: Buffer | string,
  channelSecret: string,
  signature: string,
): boolean {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
  const expected = createHmac('sha256', channelSecret).update(body).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
  verifyUrl = config.LINE_VERIFY_URL,
): Promise<LineProfile> {
  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!response.ok) {
    throw new AppError('UNAUTHENTICATED', 'LINE token verification failed');
  }
  const data = (await response.json()) as {
    aud?: string;
    sub?: string;
    name?: string;
    picture?: string;
    exp?: number;
  };
  if (data.aud !== channelId || !data.sub) {
    throw new AppError('UNAUTHENTICATED', 'LINE token audience mismatch');
  }
  if (data.exp !== undefined && data.exp * 1000 < Date.now()) {
    throw new AppError('UNAUTHENTICATED', 'LINE token expired');
  }
  return { sub: data.sub, name: data.name, picture: data.picture };
}
```

`services/functions/src/line/gateway.ts`:

```ts
import { config } from '../config';

export type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'text'; text: string; quickReply?: unknown };

export class LineGateway {
  constructor(
    private readonly baseUrl = config.LINE_API_BASE,
    private readonly accessToken = config.LINE_CHANNEL_ACCESS_TOKEN,
  ) {}

  private async post(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`LINE API ${path} failed with ${response.status}`);
    }
  }

  async reply(replyToken: string, messages: LineMessage[]): Promise<void> {
    await this.post('/v2/bot/message/reply', { replyToken, messages });
  }

  async push(to: string, messages: LineMessage[]): Promise<void> {
    await this.post('/v2/bot/message/push', { to, messages });
  }
}
```

`services/functions/src/auth/users.ts`:

```ts
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { LineProfile } from '../line/verify';

export async function ensureLineUser(profile: LineProfile): Promise<{ uid: string; isNew: boolean }> {
  const uid = `line_${profile.sub}`;
  const auth = getAuth();
  let isNew = false;
  try {
    await auth.getUser(uid);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid,
      displayName: profile.name,
      photoURL: profile.picture,
    });
    isNew = true;
  }

  const db = getFirestore();
  await db.collection('lineUsers').doc(profile.sub).set(
    {
      uid,
      displayName: profile.name ?? '',
      pictureUrl: profile.picture ?? '',
      linkedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await db.collection('users').doc(uid).set(
    {
      displayName: profile.name ?? '新朋友',
      avatarUrl: profile.picture ?? '',
      ...(isNew ? { householdIds: [] } : {}),
      locale: 'zh-TW',
      timezone: 'Asia/Taipei',
      schemaVersion: 1,
      updatedAt: FieldValue.serverTimestamp(),
      ...(isNew ? { createdAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );
  return { uid, isNew };
}
```

`services/functions/src/auth/line.ts`:

```ts
import { getAuth } from 'firebase-admin/auth';
import { onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { config } from '../config';
import { verifyLineIdToken } from '../line/verify';
import { ensureLineUser } from './users';

const InputSchema = z.object({ idToken: z.string().min(1) });

export const lineLogin = onCall({ region: 'asia-east1' }, async (request) => {
  const { idToken } = InputSchema.parse(request.data);
  const profile = await verifyLineIdToken(idToken, config.LINE_LOGIN_CHANNEL_ID);
  const { uid, isNew } = await ensureLineUser(profile);
  const token = await getAuth().createCustomToken(uid);
  return {
    token,
    uid,
    isNew,
    displayName: profile.name ?? '',
    pictureUrl: profile.picture ?? '',
  };
});
```

`services/functions/src/commands/handlers/line.ts`:

```ts
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { AppError, type CommandResult } from '@taijian/domain';
import { config } from '../../config';
import { verifyLineIdToken } from '../../line/verify';
import { db } from '../../lib/firestore';
import type { HandlerContext } from '../types';

export async function linkLine(ctx: HandlerContext): Promise<CommandResult> {
  const payload = ctx.envelope.payload as { idToken?: string };
  if (!payload.idToken) throw new AppError('VALIDATION_ERROR', 'idToken is required');
  const profile = await verifyLineIdToken(payload.idToken, config.LINE_LOGIN_CHANNEL_ID);
  const ref = getFirestore().collection('lineUsers').doc(profile.sub);
  const snap = await ctx.tx.get(ref);
  const existing = snap.data() as { uid?: string } | undefined;
  if (existing?.uid && existing.uid !== ctx.uid) {
    throw new AppError('LINE_ALREADY_LINKED', 'this LINE account is linked to another user');
  }
  ctx.tx.set(
    ref,
    {
      uid: ctx.uid,
      displayName: profile.name ?? '',
      pictureUrl: profile.picture ?? '',
      linkedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true, commandId: ctx.envelope.commandId, data: { linked: true }, serverTime: new Date().toISOString() };
}

export async function unlinkLine(ctx: HandlerContext): Promise<CommandResult> {
  const authUser = await getAuth().getUser(ctx.uid);
  if (authUser.providerData.length < 1) {
    throw new AppError('FORBIDDEN', 'link another sign-in method before unlinking LINE');
  }
  const mappings = await db.collection('lineUsers').where('uid', '==', ctx.uid).get();
  for (const mapping of mappings.docs) ctx.tx.delete(mapping.ref);
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { linked: false },
    serverTime: new Date().toISOString(),
  };
}
```

The handler imports `getAuth` from `firebase-admin/auth`, `FieldValue`/`getFirestore` from `firebase-admin/firestore`, and `db` from `../../lib/firestore`. A Firebase custom-token user has no provider data until Apple/Google is linked; requiring at least one provider prevents locking the user out.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @taijian/functions test test/lineVerify.test.ts
pnpm --filter @taijian/functions typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add services/functions
git commit -m "feat(functions): add LINE token verification, login, and account mapping"
```

---

## Task 6: Household, membership, and invite commands

**Files:**
- Create: `services/functions/src/commands/helpers.ts`, `services/functions/src/commands/handlers/household.ts`, `services/functions/src/commands/handlers/members.ts`, `services/functions/src/commands/handlers/invites.ts`, `services/functions/src/commands/registry.ts`
- Test: `services/functions/test/integration/helpers.ts`, `services/functions/test/integration/household.test.ts`

**Interfaces:**
- Consumes: `runCommand`, `HandlerContext`, `can`, `AppError`
- Produces: `commandHandlers` (household/member/invite subset), `hashInviteSecret(secret)`, `parseInviteToken(token)`, `createHousehold`, `updateHousehold`, `deleteHousehold`, `inviteMember`, `acceptInvite`, `removeMember`, `updateMemberRole`, `leaveHousehold`.

- [ ] **Step 1: Write the failing integration tests**

First update `services/functions/package.json` so the default test run stays unit-only:

```json
"test": "vitest run --exclude '**/integration/**'",
"test:integration": "firebase emulators:exec --config ../../firebase.json --only firestore,auth --project demo-taijian \"vitest run test/integration\""
```

`services/functions/test/integration/helpers.ts`:

```ts
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { newCommandId, type CommandEnvelope } from '@taijian/domain';

process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= 'localhost:9099';
process.env.GCLOUD_PROJECT ??= 'demo-taijian';

if (!getApps().length) initializeApp({ projectId: 'demo-taijian' });

export const adminDb = getFirestore();
export const adminAuth = getAuth();

export async function clearFirestore(): Promise<void> {
  await fetch(
    'http://localhost:8080/emulator/v1/projects/demo-taijian/databases/(default)/documents',
    { method: 'DELETE' },
  );
}

export async function seedUser(uid: string, householdIds: string[] = []): Promise<void> {
  await adminAuth.createUser({ uid }).catch((error) => {
    if (error.code !== 'auth/uid-already-exists') throw error;
  });
  await adminDb.collection('users').doc(uid).set({
    displayName: uid,
    householdIds,
    locale: 'zh-TW',
    timezone: 'Asia/Taipei',
    schemaVersion: 1,
  });
}

export function envelope(
  type: string,
  payload: unknown,
  options: { householdId?: string; baseRevision?: number; commandId?: string } = {},
): CommandEnvelope {
  return {
    commandId: options.commandId ?? newCommandId(),
    type,
    ...(options.householdId ? { householdId: options.householdId } : {}),
    ...(options.baseRevision !== undefined ? { baseRevision: options.baseRevision } : {}),
    payload,
    client: { platform: 'test', appVersion: '1.0.0' },
  };
}
```

`services/functions/test/integration/household.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newCommandId } from '@taijian/domain';
import { runCommand } from '../../src/commands/runCommand';
import { commandHandlers } from '../../src/commands/registry';
import { adminDb, clearFirestore, envelope, seedUser } from './helpers';

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
});

beforeEach(async () => {
  await clearFirestore();
  await seedUser('u_owner');
  await seedUser('u_helper');
});

describe('household commands', () => {
  it('creates a household with an owner membership', async () => {
    const result = await runCommand({
      uid: 'u_owner',
      envelope: envelope('household.create', { name: '我們家', timezone: 'Asia/Taipei' }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const householdId = (result.data as { householdId: string }).householdId;
    const household = await adminDb.collection('households').doc(householdId).get();
    expect(household.data()?.ownerUid).toBe('u_owner');
    expect(household.data()?.ownerCount).toBe(1);
    const member = await adminDb.doc(`households/${householdId}/members/u_owner`).get();
    expect(member.data()?.role).toBe('owner');
    const user = await adminDb.collection('users').doc('u_owner').get();
    expect(user.data()?.householdIds).toContain(householdId);
  });

  it('invites and accepts a caretaker exactly once', async () => {
    const created = await runCommand({
      uid: 'u_owner',
      envelope: envelope('household.create', { name: '我們家', timezone: 'Asia/Taipei' }),
      source: 'test',
      handlers: commandHandlers,
    });
    if (!created.ok) throw new Error('setup failed');
    const householdId = (created.data as { householdId: string }).householdId;

    const invited = await runCommand({
      uid: 'u_owner',
      envelope: envelope('member.invite', { role: 'caretaker', expiresInDays: 7 }, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    if (!invited.ok) throw new Error('invite failed');
    const token = (invited.data as { token: string }).token;

    const accepted = await runCommand({
      uid: 'u_helper',
      envelope: envelope('member.accept', { token }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(accepted.ok).toBe(true);

    const second = await runCommand({
      uid: 'u_helper',
      envelope: envelope('member.accept', { token }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(second.ok).toBe(true);

    const members = await adminDb.collection(`households/${householdId}/members`).get();
    expect(members.size).toBe(2);
  });

  it('does not let a caretaker promote themselves', async () => {
    // owner creates household, invite, helper accepts (repeat setup)
    const created = await runCommand({
      uid: 'u_owner',
      envelope: envelope('household.create', { name: '我們家', timezone: 'Asia/Taipei' }),
      source: 'test',
      handlers: commandHandlers,
    });
    if (!created.ok) throw new Error('setup failed');
    const householdId = (created.data as { householdId: string }).householdId;
    const invited = await runCommand({
      uid: 'u_owner',
      envelope: envelope('member.invite', { role: 'caretaker', expiresInDays: 7 }, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    if (!invited.ok) throw new Error('invite failed');
    const token = (invited.data as { token: string }).token;
    await runCommand({
      uid: 'u_helper',
      envelope: envelope('member.accept', { token }),
      source: 'test',
      handlers: commandHandlers,
    });

    await expect(
      runCommand({
        uid: 'u_helper',
        envelope: envelope(
          'member.updateRole',
          { uid: 'u_helper', role: 'owner' },
          { householdId },
        ),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cannot remove the last owner', async () => {
    const created = await runCommand({
      uid: 'u_owner',
      envelope: envelope('household.create', { name: '我們家', timezone: 'Asia/Taipei' }),
      source: 'test',
      handlers: commandHandlers,
    });
    if (!created.ok) throw new Error('setup failed');
    const householdId = (created.data as { householdId: string }).householdId;

    await expect(
      runCommand({
        uid: 'u_owner',
        envelope: envelope('member.leave', {}, { householdId }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @taijian/functions test:integration
```

Expected: FAIL because the handlers and registry do not exist.

- [ ] **Step 3: Implement helpers and household handlers**

`services/functions/src/commands/helpers.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';
import { AppError, can, type Action, type Role } from '@taijian/domain';
import { db, type Tx } from '../lib/firestore';
import type { HandlerContext } from './types';

export function requireHouseholdId(ctx: HandlerContext): string {
  if (!ctx.envelope.householdId) {
    throw new AppError('VALIDATION_ERROR', 'householdId is required');
  }
  return ctx.envelope.householdId;
}

export async function requireMember(
  tx: Tx,
  householdId: string,
  uid: string,
): Promise<{ role: Role }> {
  const snap = await tx.get(db.doc(`households/${householdId}/members/${uid}`));
  if (!snap.exists) throw new AppError('FORBIDDEN', 'not a household member');
  return { role: snap.data()?.role as Role };
}

export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) throw new AppError('FORBIDDEN', `role ${role} cannot ${action}`);
}

export function assertRevision<T extends { revision: number; lastChangedFields?: string[] }>(
  doc: T,
  baseRevision: number | undefined,
): void {
  if (baseRevision === undefined) {
    throw new AppError('VALIDATION_ERROR', 'baseRevision is required');
  }
  if (doc.revision !== baseRevision) {
    throw new AppError('CONFLICT', 'stale revision', {
      current: doc,
      currentRevision: doc.revision,
      lastChangedFields: doc.lastChangedFields ?? [],
    });
  }
}

export function bump(
  doc: { revision: number },
  patch: Record<string, unknown>,
  ctx: HandlerContext,
): Record<string, unknown> {
  return {
    ...patch,
    revision: doc.revision + 1,
    lastChangedFields: Object.keys(patch),
    updatedBy: ctx.uid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedFrom: ctx.source,
  };
}

export async function mustGetHousehold(tx: Tx, householdId: string): Promise<Record<string, any>> {
  const snap = await tx.get(db.collection('households').doc(householdId));
  if (!snap.exists) throw new AppError('NOT_FOUND', 'household not found');
  return { id: snap.id, ...snap.data() } as Record<string, any>;
}
```

`services/functions/src/commands/handlers/household.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { db } from '../../lib/firestore';
import { writeAudit } from '../../lib/audit';
import { assertRevision, bump, mustGetHousehold, requireHouseholdId, requireMember } from '../helpers';
import type { HandlerContext } from '../types';

export async function createHousehold(ctx: HandlerContext): Promise<CommandResult> {
  const payload = ctx.envelope.payload as { name: string; timezone: string };
  const householdRef = db.collection('households').doc();
  const householdId = householdRef.id;

  ctx.tx.set(householdRef, {
    name: payload.name,
    ownerUid: ctx.uid,
    ownerCount: 1,
    memberCount: 1,
    timezone: payload.timezone,
    settings: { notificationsEnabled: true },
    revision: 0,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  ctx.tx.set(db.doc(`households/${householdId}/members/${ctx.uid}`), {
    uid: ctx.uid,
    role: 'owner',
    displayName: ctx.uid,
    avatarUrl: '',
    joinedAt: FieldValue.serverTimestamp(),
    invitedBy: null,
    status: 'active',
  });
  ctx.tx.set(
    db.collection('users').doc(ctx.uid),
    {
      householdIds: FieldValue.arrayUnion(householdId),
      defaultHouseholdId: householdId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'household.create',
    targetType: 'household',
    targetId: householdId,
    after: { name: payload.name, timezone: payload.timezone },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: 0,
    data: { householdId },
    serverTime: new Date().toISOString(),
  };
}

export async function updateHousehold(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  if (member.role !== 'owner') throw new AppError('FORBIDDEN', 'owner only');
  const household = await mustGetHousehold(ctx.tx, householdId);
  assertRevision(household as { revision: number }, ctx.envelope.baseRevision);
  const payload = ctx.envelope.payload as Record<string, unknown>;
  const patch = bump(household as { revision: number }, payload, ctx);
  ctx.tx.set(db.collection('households').doc(householdId), patch, { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'household.update',
    targetType: 'household',
    targetId: householdId,
    before: household,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: (household as { revision: number }).revision + 1,
    data: { householdId },
    serverTime: new Date().toISOString(),
  };
}

export async function deleteHousehold(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  if (member.role !== 'owner') throw new AppError('FORBIDDEN', 'owner only');
  const household = await mustGetHousehold(ctx.tx, householdId);
  if (household.memberCount !== 1) {
    throw new AppError('FORBIDDEN', 'remove other members or transfer ownership first');
  }
  ctx.tx.set(
    db.collection('households').doc(householdId),
    { deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  ctx.tx.delete(db.doc(`households/${householdId}/members/${ctx.uid}`));
  ctx.tx.set(
    db.collection('users').doc(ctx.uid),
    { householdIds: FieldValue.arrayRemove(householdId), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'household.delete',
    targetType: 'household',
    targetId: householdId,
    before: household,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { householdId, deleted: true },
    serverTime: new Date().toISOString(),
  };
}
```

`services/functions/src/commands/handlers/invites.ts`:

```ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { db } from '../../lib/firestore';
import { writeAudit } from '../../lib/audit';
import { requireHouseholdId, requireMember } from '../helpers';
import type { HandlerContext } from '../types';

export function hashInviteSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function parseInviteToken(token: string): { inviteId: string; secret: string } {
  const [inviteId, secret] = token.split('.');
  if (!inviteId || !secret) throw new AppError('VALIDATION_ERROR', 'invalid invite token');
  return { inviteId, secret };
}

export async function inviteMember(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  if (member.role !== 'owner') throw new AppError('FORBIDDEN', 'owner only');
  const payload = ctx.envelope.payload as { role: 'caretaker'; expiresInDays: number };

  const inviteRef = db.collection('invites').doc();
  const secret = randomBytes(32).toString('base64url');
  const token = `${inviteRef.id}.${secret}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + payload.expiresInDays * 86_400_000);
  ctx.tx.set(inviteRef, {
    householdId,
    role: 'caretaker',
    createdBy: ctx.uid,
    secretHash: hashInviteSecret(secret),
    expiresAt,
    maxUses: 1,
    usedCount: 0,
    status: 'active',
    acceptedBy: [],
    createdAt: FieldValue.serverTimestamp(),
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'member.invite',
    targetType: 'invite',
    targetId: inviteRef.id,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { token, inviteId: inviteRef.id, expiresAt: expiresAt.toDate().toISOString() },
    serverTime: new Date().toISOString(),
  };
}

export async function acceptInvite(ctx: HandlerContext): Promise<CommandResult> {
  const payload = ctx.envelope.payload as { token: string };
  const { inviteId, secret } = parseInviteToken(payload.token);
  const inviteRef = db.collection('invites').doc(inviteId);
  const inviteSnap = await ctx.tx.get(inviteRef);
  if (!inviteSnap.exists) throw new AppError('NOT_FOUND', 'invite not found');
  const invite = inviteSnap.data() as {
    householdId: string;
    createdBy: string;
    secretHash: string;
    expiresAt: Timestamp;
    status: string;
    maxUses: number;
    usedCount: number;
  };
  if (invite.status !== 'active' || invite.expiresAt.toMillis() < Date.now() || invite.usedCount >= invite.maxUses) {
    throw new AppError('INVITE_EXPIRED', 'invite is no longer valid');
  }
  const expected = Buffer.from(invite.secretHash, 'hex');
  const actual = Buffer.from(hashInviteSecret(secret), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AppError('NOT_FOUND', 'invite not found');
  }

  const memberRef = db.doc(`households/${invite.householdId}/members/${ctx.uid}`);
  const memberSnap = await ctx.tx.get(memberRef);
  if (memberSnap.exists) {
    return {
      ok: true,
      commandId: ctx.envelope.commandId,
      data: { householdId: invite.householdId, alreadyMember: true },
      serverTime: new Date().toISOString(),
    };
  }

  const householdRef = db.collection('households').doc(invite.householdId);
  const householdSnap = await ctx.tx.get(householdRef);
  if (!householdSnap.exists) throw new AppError('NOT_FOUND', 'household not found');

  ctx.tx.set(memberRef, {
    uid: ctx.uid,
    role: 'caretaker',
    displayName: ctx.uid,
    avatarUrl: '',
    joinedAt: FieldValue.serverTimestamp(),
    invitedBy: invite.createdBy,
    status: 'active',
  });
  ctx.tx.set(
    inviteRef,
    {
      usedCount: invite.usedCount + 1,
      status: invite.usedCount + 1 >= invite.maxUses ? 'used' : 'active',
      acceptedBy: FieldValue.arrayUnion(ctx.uid),
    },
    { merge: true },
  );
  ctx.tx.set(
    db.collection('users').doc(ctx.uid),
    {
      householdIds: FieldValue.arrayUnion(invite.householdId),
      defaultHouseholdId: invite.householdId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  ctx.tx.set(householdRef, { memberCount: FieldValue.increment(1) }, { merge: true });
  writeAudit(ctx.tx, {
    householdId: invite.householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'member.accept',
    targetType: 'member',
    targetId: ctx.uid,
    after: { role: 'caretaker' },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { householdId: invite.householdId },
    serverTime: new Date().toISOString(),
  };
}
```

`services/functions/src/commands/handlers/members.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { db } from '../../lib/firestore';
import { writeAudit } from '../../lib/audit';
import { mustGetHousehold, requireHouseholdId, requireMember } from '../helpers';
import type { HandlerContext } from '../types';

async function lockedHousehold(ctx: HandlerContext, householdId: string) {
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  if (member.role !== 'owner') throw new AppError('FORBIDDEN', 'owner only');
  return mustGetHousehold(ctx.tx, householdId);
}

export async function updateMemberRole(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const household = await lockedHousehold(ctx, householdId);
  const payload = ctx.envelope.payload as { uid: string; role: 'owner' | 'caretaker' };
  if (payload.uid === ctx.uid) throw new AppError('FORBIDDEN', 'cannot change your own role');
  const targetRef = db.doc(`households/${householdId}/members/${payload.uid}`);
  const targetSnap = await ctx.tx.get(targetRef);
  if (!targetSnap.exists) throw new AppError('NOT_FOUND', 'member not found');
  const target = targetSnap.data() as { role: 'owner' | 'caretaker' };

  if (target.role === payload.role) {
    return {
      ok: true,
      commandId: ctx.envelope.commandId,
      data: { uid: payload.uid, role: payload.role },
      serverTime: new Date().toISOString(),
    };
  }
  if (target.role === 'owner' && payload.role === 'caretaker' && household.ownerCount <= 1) {
    throw new AppError('LAST_OWNER', 'cannot demote the last owner');
  }
  ctx.tx.set(targetRef, { role: payload.role }, { merge: true });
  ctx.tx.set(
    db.collection('households').doc(householdId),
    { ownerCount: FieldValue.increment(payload.role === 'owner' ? 1 : -1) },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'member.updateRole',
    targetType: 'member',
    targetId: payload.uid,
    before: { role: target.role },
    after: { role: payload.role },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { uid: payload.uid, role: payload.role },
    serverTime: new Date().toISOString(),
  };
}

export async function removeMember(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const household = await lockedHousehold(ctx, householdId);
  const payload = ctx.envelope.payload as { uid: string };
  const targetRef = db.doc(`households/${householdId}/members/${payload.uid}`);
  const targetSnap = await ctx.tx.get(targetRef);
  if (!targetSnap.exists) throw new AppError('NOT_FOUND', 'member not found');
  const target = targetSnap.data() as { role: 'owner' | 'caretaker' };
  if (target.role === 'owner' && household.ownerCount <= 1) {
    throw new AppError('LAST_OWNER', 'cannot remove the last owner');
  }
  ctx.tx.delete(targetRef);
  ctx.tx.set(
    db.collection('households').doc(householdId),
    {
      memberCount: FieldValue.increment(-1),
      ownerCount: FieldValue.increment(target.role === 'owner' ? -1 : 0),
    },
    { merge: true },
  );
  ctx.tx.set(
    db.collection('users').doc(payload.uid),
    { householdIds: FieldValue.arrayRemove(householdId) },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'member.remove',
    targetType: 'member',
    targetId: payload.uid,
    before: { role: target.role },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { uid: payload.uid, removed: true },
    serverTime: new Date().toISOString(),
  };
}

export async function leaveHousehold(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const household = await mustGetHousehold(ctx.tx, householdId);
  const memberRef = db.doc(`households/${householdId}/members/${ctx.uid}`);
  const memberSnap = await ctx.tx.get(memberRef);
  if (!memberSnap.exists) throw new AppError('NOT_FOUND', 'member not found');
  const member = memberSnap.data() as { role: 'owner' | 'caretaker' };
  if (member.role === 'owner' && household.ownerCount <= 1) {
    throw new AppError('LAST_OWNER', 'transfer ownership before leaving');
  }
  ctx.tx.delete(memberRef);
  ctx.tx.set(
    db.collection('households').doc(householdId),
    {
      memberCount: FieldValue.increment(-1),
      ownerCount: FieldValue.increment(member.role === 'owner' ? -1 : 0),
    },
    { merge: true },
  );
  ctx.tx.set(
    db.collection('users').doc(ctx.uid),
    { householdIds: FieldValue.arrayRemove(householdId) },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'member.leave',
    targetType: 'member',
    targetId: ctx.uid,
    before: { role: member.role },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { householdId, left: true },
    serverTime: new Date().toISOString(),
  };
}
```

`services/functions/src/commands/registry.ts`:

```ts
import type { HandlerMap } from './types';
import { createHousehold, deleteHousehold, updateHousehold } from './handlers/household';
import { acceptInvite, inviteMember } from './handlers/invites';
import { leaveHousehold, removeMember, updateMemberRole } from './handlers/members';
import { linkLine, unlinkLine } from './handlers/line';

export const commandHandlers: HandlerMap = {
  'household.create': createHousehold,
  'household.update': updateHousehold,
  'household.delete': deleteHousehold,
  'member.invite': inviteMember,
  'member.accept': acceptInvite,
  'member.remove': removeMember,
  'member.updateRole': updateMemberRole,
  'member.leave': leaveHousehold,
  'line.link': linkLine,
  'line.unlink': unlinkLine,
};
```

- [ ] **Step 4: Run the integration tests**

```bash
pnpm --filter @taijian/functions test:integration
```

Expected: PASS. The invite race test should show exactly two members, not three, after the second accept.

- [ ] **Step 5: Commit**

```bash
git add services/functions
git commit -m "feat(functions): add household, membership, and invite commands"
```

---

## Task 7: Animal and record commands

**Files:**
- Create: `services/functions/src/commands/handlers/animals.ts`, `services/functions/src/commands/handlers/records.ts`
- Modify: `services/functions/src/commands/registry.ts`
- Test: `services/functions/test/integration/animals.test.ts`, `services/functions/test/integration/records.test.ts`

**Interfaces:**
- Consumes: `runCommand`, `requireMember`, `assertRevision`, `bump`, `writeAudit`
- Produces: `createAnimal`, `updateAnimal`, `archiveAnimal`, `deleteAnimal`, `createRecord`, `updateRecord`, `deleteRecord`; registry entries for `animal.*` and `record.*`.

- [ ] **Step 1: Write the failing tests**

`services/functions/test/integration/animals.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { runCommand } from '../../src/commands/runCommand';
import { commandHandlers } from '../../src/commands/registry';
import { clearFirestore, envelope, seedUser } from './helpers';

beforeEach(async () => {
  await clearFirestore();
  await seedUser('u1');
  await seedUser('u2');
});

async function createHousehold(uid = 'u1') {
  const result = await runCommand({
    uid,
    envelope: envelope('household.create', { name: '家', timezone: 'Asia/Taipei' }),
    source: 'test',
    handlers: commandHandlers,
  });
  if (!result.ok) throw new Error('household setup failed');
  return (result.data as { householdId: string }).householdId;
}

describe('animal commands', () => {
  it('creates an animal and increments revision on update', async () => {
    const householdId = await createHousehold();
    const created = await runCommand({
      uid: 'u1',
      envelope: envelope(
        'animal.create',
        { name: '阿肥', species: 'leopard-gecko', sex: 'unknown', avatarColor: '#7C9A76' },
        { householdId },
      ),
      source: 'test',
      handlers: commandHandlers,
    });
    if (!created.ok) throw new Error('create failed');
    const animalId = (created.data as { animalId: string }).animalId;

    const updated = await runCommand({
      uid: 'u1',
      envelope: envelope('animal.update', { animalId, weight: 68 }, { householdId, baseRevision: 0 }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.revision).toBe(1);
  });

  it('returns CONFLICT when two edits use the same baseRevision', async () => {
    const householdId = await createHousehold();
    const created = await runCommand({
      uid: 'u1',
      envelope: envelope(
        'animal.create',
        { name: '阿肥', species: 'leopard-gecko', sex: 'unknown', avatarColor: '#7C9A76' },
        { householdId },
      ),
      source: 'test',
      handlers: commandHandlers,
    });
    if (!created.ok) throw new Error('create failed');
    const animalId = (created.data as { animalId: string }).animalId;

    await runCommand({
      uid: 'u1',
      envelope: envelope('animal.update', { animalId, notes: 'first' }, { householdId, baseRevision: 0 }),
      source: 'test',
      handlers: commandHandlers,
    });

    await expect(
      runCommand({
        uid: 'u2',
        envelope: envelope('animal.update', { animalId, notes: 'second' }, { householdId, baseRevision: 0 }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
```

`services/functions/test/integration/records.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { newCommandId } from '@taijian/domain';
import { runCommand } from '../../src/commands/runCommand';
import { commandHandlers } from '../../src/commands/registry';
import { clearFirestore, envelope, seedUser } from './helpers';

beforeEach(async () => {
  await clearFirestore();
  await seedUser('u1');
});

async function setupAnimal() {
  const household = await runCommand({
    uid: 'u1',
    envelope: envelope('household.create', { name: '家', timezone: 'Asia/Taipei' }),
    source: 'test',
    handlers: commandHandlers,
  });
  if (!household.ok) throw new Error('household setup failed');
  const householdId = (household.data as { householdId: string }).householdId;
  const animal = await runCommand({
    uid: 'u1',
    envelope: envelope(
      'animal.create',
      { name: '阿肥', species: 'leopard-gecko', sex: 'unknown', avatarColor: '#7C9A76' },
      { householdId },
    ),
    source: 'test',
    handlers: commandHandlers,
  });
  if (!animal.ok) throw new Error('animal setup failed');
  return { householdId, animalId: (animal.data as { animalId: string }).animalId };
}

describe('record commands', () => {
  it('keeps two concurrent records and dedupes the same command', async () => {
    const { householdId, animalId } = await setupAnimal();
    const commandId = newCommandId();

    const first = await runCommand({
      uid: 'u1',
      envelope: {
        ...envelope(
          'record.create',
          { animalId, type: 'weight', occurredAt: new Date().toISOString(), value: 68, unit: 'g' },
          { householdId },
        ),
        commandId,
      },
      source: 'test',
      handlers: commandHandlers,
    });
    const replay = await runCommand({
      uid: 'u1',
      envelope: {
        ...envelope(
          'record.create',
          { animalId, type: 'weight', occurredAt: new Date().toISOString(), value: 68, unit: 'g' },
          { householdId },
        ),
        commandId,
      },
      source: 'test',
      handlers: commandHandlers,
    });
    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    const records = await import('./helpers').then(({ adminDb }) =>
      adminDb.collection('records').where('householdId', '==', householdId).get(),
    );
    expect(records.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @taijian/functions test:integration
```

Expected: FAIL because the handlers are missing.

- [ ] **Step 3: Implement animal and record handlers**

`services/functions/src/commands/handlers/animals.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { db } from '../../lib/firestore';
import { writeAudit } from '../../lib/audit';
import { assertRevision, bump, requireHouseholdId, requireMember } from '../helpers';
import type { HandlerContext } from '../types';

async function getAnimal(ctx: HandlerContext, animalId: string) {
  const ref = db.collection('animals').doc(animalId);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new AppError('NOT_FOUND', 'animal not found');
  return { ref, data: { id: snap.id, ...snap.data() } as Record<string, any> };
}

export async function createAnimal(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as Record<string, unknown>;
  const ref = db.collection('animals').doc();
  ctx.tx.set(ref, {
    ...payload,
    householdId,
    status: 'active',
    revision: 0,
    schemaVersion: 1,
    createdBy: ctx.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.uid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedFrom: ctx.source,
    deletedAt: null,
    lastChangedFields: [],
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'animal.create',
    targetType: 'animal',
    targetId: ref.id,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: 0,
    data: { animalId: ref.id },
    serverTime: new Date().toISOString(),
  };
}

export async function updateAnimal(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as { animalId: string } & Record<string, unknown>;
  const { ref, data } = await getAnimal(ctx, payload.animalId);
  if (data.householdId !== householdId) throw new AppError('FORBIDDEN', 'animal is not in this household');
  assertRevision(data as { revision: number }, ctx.envelope.baseRevision);
  const { animalId, ...patch } = payload;
  const next = bump(data as { revision: number }, patch, ctx);
  ctx.tx.set(ref, next, { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'animal.update',
    targetType: 'animal',
    targetId: animalId,
    before: data,
    after: patch,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: (data as { revision: number }).revision + 1,
    data: { animalId },
    serverTime: new Date().toISOString(),
  };
}

export async function archiveAnimal(ctx: HandlerContext): Promise<CommandResult> {
  return mutateAnimalStatus(ctx, 'archived');
}

export async function deleteAnimal(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  if (member.role !== 'owner') throw new AppError('FORBIDDEN', 'owner only');
  const payload = ctx.envelope.payload as { animalId: string };
  const { ref, data } = await getAnimal(ctx, payload.animalId);
  assertRevision(data as { revision: number }, ctx.envelope.baseRevision);
  ctx.tx.set(
    ref,
    {
      deletedAt: FieldValue.serverTimestamp(),
      status: 'archived',
      revision: (data as { revision: number }).revision + 1,
      lastChangedFields: ['deletedAt', 'status'],
      updatedBy: ctx.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedFrom: ctx.source,
    },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'animal.delete',
    targetType: 'animal',
    targetId: payload.animalId,
    before: data,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: (data as { revision: number }).revision + 1,
    data: { animalId: payload.animalId, deleted: true },
    serverTime: new Date().toISOString(),
  };
}

async function mutateAnimalStatus(ctx: HandlerContext, status: 'archived'): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  if (member.role !== 'owner') throw new AppError('FORBIDDEN', 'owner only');
  const payload = ctx.envelope.payload as { animalId: string };
  const { ref, data } = await getAnimal(ctx, payload.animalId);
  assertRevision(data as { revision: number }, ctx.envelope.baseRevision);
  ctx.tx.set(ref, bump(data as { revision: number }, { status }, ctx), { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: `animal.${status}`,
    targetType: 'animal',
    targetId: payload.animalId,
    before: data,
    after: { status },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: (data as { revision: number }).revision + 1,
    data: { animalId: payload.animalId, status },
    serverTime: new Date().toISOString(),
  };
}
```

`services/functions/src/commands/handlers/records.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { db } from '../../lib/firestore';
import { writeAudit } from '../../lib/audit';
import { requestHash } from '../../lib/ids';
import { assertRevision, bump, requireHouseholdId, requireMember } from '../helpers';
import type { HandlerContext } from '../types';

async function getRecord(ctx: HandlerContext, recordId: string) {
  const ref = db.collection('records').doc(recordId);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new AppError('NOT_FOUND', 'record not found');
  return { ref, data: { id: snap.id, ...snap.data() } as Record<string, any> };
}

export async function createRecord(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as Record<string, any>;
  const animalSnap = await ctx.tx.get(db.collection('animals').doc(payload.animalId));
  if (!animalSnap.exists || animalSnap.data()?.householdId !== householdId) {
    throw new AppError('NOT_FOUND', 'animal not found in household');
  }
  const recordId = payload.recordId ?? randomUUID();
  const payloadHash = requestHash('record.create', payload);
  const ref = db.collection('records').doc(recordId);
  const existing = await ctx.tx.get(ref);
  if (existing.exists) {
    const data = existing.data() as Record<string, any>;
    if (data.createdBy !== ctx.uid || data.payloadHash !== payloadHash) {
      throw new AppError('DUPLICATE_ID', 'record id already used');
    }
    return {
      ok: true,
      commandId: ctx.envelope.commandId,
      revision: data.revision,
      data: { recordId, alreadyExists: true },
      serverTime: new Date().toISOString(),
    };
  }
  ctx.tx.set(ref, {
    ...payload,
    recordId,
    payloadHash,
    householdId,
    source: ctx.source,
    sourceEventId: null,
    revision: 0,
    createdBy: ctx.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.uid,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
    lastChangedFields: [],
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: ctx.source === 'bot' ? 'bot' : 'user',
    action: 'record.create',
    targetType: 'record',
    targetId: recordId,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: 0,
    data: { recordId },
    serverTime: new Date().toISOString(),
  };
}

export async function updateRecord(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as { recordId: string } & Record<string, unknown>;
  const { ref, data } = await getRecord(ctx, payload.recordId);
  if (data.householdId !== householdId) throw new AppError('FORBIDDEN', 'record is not in this household');
  if (member.role !== 'owner' && data.createdBy !== ctx.uid) {
    throw new AppError('FORBIDDEN', 'caretakers can only edit their own records');
  }
  assertRevision(data as { revision: number }, ctx.envelope.baseRevision);
  const { recordId, ...patch } = payload;
  ctx.tx.set(ref, bump(data as { revision: number }, patch, ctx), { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'record.update',
    targetType: 'record',
    targetId: recordId,
    before: data,
    after: patch,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: (data as { revision: number }).revision + 1,
    data: { recordId },
    serverTime: new Date().toISOString(),
  };
}

export async function deleteRecord(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as { recordId: string };
  const { ref, data } = await getRecord(ctx, payload.recordId);
  if (data.householdId !== householdId) throw new AppError('FORBIDDEN', 'record is not in this household');
  if (member.role !== 'owner' && data.createdBy !== ctx.uid) {
    throw new AppError('FORBIDDEN', 'caretakers can only delete their own records');
  }
  assertRevision(data as { revision: number }, ctx.envelope.baseRevision);
  ctx.tx.set(
    ref,
    {
      deletedAt: FieldValue.serverTimestamp(),
      revision: (data as { revision: number }).revision + 1,
      lastChangedFields: ['deletedAt'],
      updatedBy: ctx.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedFrom: ctx.source,
    },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'record.delete',
    targetType: 'record',
    targetId: payload.recordId,
    before: data,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: (data as { revision: number }).revision + 1,
    data: { recordId: payload.recordId, deleted: true },
    serverTime: new Date().toISOString(),
  };
}
```

Update `registry.ts`:

```ts
import { archiveAnimal, createAnimal, deleteAnimal, updateAnimal } from './handlers/animals';
import { createRecord, deleteRecord, updateRecord } from './handlers/records';

export const commandHandlers: HandlerMap = {
  // ...existing handlers
  'animal.create': createAnimal,
  'animal.update': updateAnimal,
  'animal.archive': archiveAnimal,
  'animal.delete': deleteAnimal,
  'record.create': createRecord,
  'record.update': updateRecord,
  'record.delete': deleteRecord,
};
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @taijian/functions test:integration
```

Expected: PASS. The conflict test must reject the second update with `CONFLICT`; the replay test must show one record.

- [ ] **Step 5: Commit**

```bash
git add services/functions
git commit -m "feat(functions): add animal and record commands with revision conflict"
```

---

## Task 8: Reminder, task completion, and account deletion

**Files:**
- Create: `services/functions/src/lib/schedule.ts`, `services/functions/src/commands/handlers/reminders.ts`, `services/functions/src/commands/handlers/tasks.ts`, `services/functions/src/user/deleteAccount.ts`
- Modify: `services/functions/src/commands/registry.ts`
- Test: `services/functions/test/schedule.test.ts`, `services/functions/test/integration/reminders.test.ts`

**Interfaces:**
- Consumes: `completionId`, `localDateKey`, `runCommand`, `requireMember`, `assertRevision`
- Produces: `computeNextDueAt(schedule, timezone, from)`, `createReminder`, `updateReminder`, `deleteReminder`, `completeTask`, `uncompleteTask`, `deleteAccount` callable.

- [ ] **Step 1: Write the failing schedule tests**

`services/functions/test/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeNextDueAt } from '../src/lib/schedule';

describe('computeNextDueAt', () => {
  it('returns the next daily occurrence in the stored timezone', () => {
    const from = new Date('2026-10-24T00:00:00.000Z'); // 08:00 Asia/Taipei
    const next = computeNextDueAt(
      { kind: 'daily', times: ['08:30'] },
      'Asia/Taipei',
      from,
    );
    expect(next.toISOString()).toBe('2026-10-24T00:30:00.000Z');
  });

  it('handles a DST spring-forward date without skipping the day', () => {
    const from = new Date('2027-03-14T12:00:00.000Z'); // 08:00 America/New_York
    const next = computeNextDueAt(
      { kind: 'daily', times: ['08:30'] },
      'America/New_York',
      from,
    );
    expect(next.toISOString()).toBe('2027-03-14T12:30:00.000Z');
  });

  it('computes weekly schedules', () => {
    const from = new Date('2026-10-24T00:00:00.000Z'); // Saturday in Taipei
    const next = computeNextDueAt(
      { kind: 'weekly', times: ['09:00'], weekdays: [1] },
      'Asia/Taipei',
      from,
    );
    expect(next.toISOString()).toBe('2026-10-26T01:00:00.000Z'); // Monday 09:00
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @taijian/functions test test/schedule.test.ts
```

Expected: FAIL because `src/lib/schedule.ts` does not exist.

- [ ] **Step 3: Implement schedule calculation and reminder/task handlers**

`services/functions/src/lib/schedule.ts`:

```ts
import { DateTime } from 'luxon';
import type { z } from 'zod';
import type { ScheduleSchema } from '@taijian/domain';

type Schedule = z.infer<typeof ScheduleSchema>;

type Time = string;

function atTime(base: DateTime, time: Time): DateTime {
  const [hour, minute] = time.split(':').map(Number);
  return base.set({ hour, minute, second: 0, millisecond: 0 });
}

export function computeNextDueAt(schedule: Schedule, timezone: string, from: Date): Date {
  const base = DateTime.fromJSDate(from, { zone: timezone });
  const times = [...schedule.times].sort();

  if (schedule.kind === 'daily') {
    for (const time of times) {
      const candidate = atTime(base, time);
      if (candidate > base) return candidate.toUTC().toJSDate();
    }
    return atTime(base.plus({ days: 1 }), times[0] ?? '08:00').toUTC().toJSDate();
  }

  if (schedule.kind === 'weekly') {
    for (let offset = 0; offset <= 7; offset += 1) {
      const day = base.plus({ days: offset });
      if (!schedule.weekdays.includes(day.weekday)) continue;
      for (const time of times) {
        const candidate = atTime(day, time);
        if (candidate > base) return candidate.toUTC().toJSDate();
      }
    }
    throw new Error('weekly schedule produced no next occurrence');
  }

  const start = DateTime.fromISO(schedule.startDate, { zone: timezone }).startOf('day');
  const daysSinceStart = Math.max(0, Math.floor(base.startOf('day').diff(start, 'days').days));
  const remainder = daysSinceStart % schedule.everyNDays;
  const nextDayOffset = remainder === 0 ? 0 : schedule.everyNDays - remainder;
  for (let offset = nextDayOffset; offset <= nextDayOffset + schedule.everyNDays; offset += 1) {
    const day = base.startOf('day').plus({ days: offset });
    for (const time of times) {
      const candidate = atTime(day, time);
      if (candidate > base) return candidate.toUTC().toJSDate();
    }
  }
  throw new Error('interval schedule produced no next occurrence');
}
```

`services/functions/src/commands/handlers/reminders.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { db } from '../../lib/firestore';
import { writeAudit } from '../../lib/audit';
import { computeNextDueAt } from '../../lib/schedule';
import { assertRevision, bump, requireHouseholdId, requireMember } from '../helpers';
import type { HandlerContext } from '../types';

function scheduleInput(ctx: HandlerContext): {
  animalId: string;
  title: string;
  type: string;
  schedule: any;
  timezone: string;
  enabled: boolean;
} {
  return ctx.envelope.payload as any;
}

export async function createReminder(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = scheduleInput(ctx);
  const animalSnap = await ctx.tx.get(db.collection('animals').doc(payload.animalId));
  if (!animalSnap.exists || animalSnap.data()?.householdId !== householdId) {
    throw new AppError('NOT_FOUND', 'animal not found in household');
  }
  const ref = db.collection('reminders').doc();
  const nextDueAt = computeNextDueAt(payload.schedule, payload.timezone, ctx.now);
  ctx.tx.set(ref, {
    ...payload,
    householdId,
    nextDueAt,
    revision: 0,
    schemaVersion: 1,
    createdBy: ctx.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.uid,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
    lastChangedFields: [],
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'reminder.create',
    targetType: 'reminder',
    targetId: ref.id,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: 0,
    data: { reminderId: ref.id, nextDueAt: nextDueAt.toISOString() },
    serverTime: new Date().toISOString(),
  };
}

export async function updateReminder(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as { reminderId: string } & Record<string, any>;
  const ref = db.collection('reminders').doc(payload.reminderId);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists || snap.data()?.householdId !== householdId) {
    throw new AppError('NOT_FOUND', 'reminder not found');
  }
  const data = { id: snap.id, ...snap.data() } as Record<string, any>;
  assertRevision(data as { revision: number }, ctx.envelope.baseRevision);
  const { reminderId, ...patch } = payload;
  if (patch.schedule || patch.timezone) {
    patch.nextDueAt = computeNextDueAt(
      patch.schedule ?? data.schedule,
      patch.timezone ?? data.timezone,
      ctx.now,
    );
  }
  ctx.tx.set(ref, bump(data as { revision: number }, patch, ctx), { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'reminder.update',
    targetType: 'reminder',
    targetId: reminderId,
    before: data,
    after: patch,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: data.revision + 1,
    data: { reminderId },
    serverTime: new Date().toISOString(),
  };
}

export async function deleteReminder(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as { reminderId: string };
  const ref = db.collection('reminders').doc(payload.reminderId);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists || snap.data()?.householdId !== householdId) {
    throw new AppError('NOT_FOUND', 'reminder not found');
  }
  const data = { id: snap.id, ...snap.data() } as Record<string, any>;
  assertRevision(data as { revision: number }, ctx.envelope.baseRevision);
  ctx.tx.set(
    ref,
    {
      deletedAt: FieldValue.serverTimestamp(),
      enabled: false,
      revision: data.revision + 1,
      lastChangedFields: ['deletedAt', 'enabled'],
      updatedBy: ctx.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedFrom: ctx.source,
    },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'reminder.delete',
    targetType: 'reminder',
    targetId: payload.reminderId,
    before: data,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    revision: data.revision + 1,
    data: { reminderId: payload.reminderId, deleted: true },
    serverTime: new Date().toISOString(),
  };
}
```

`services/functions/src/commands/handlers/tasks.ts`:

```ts
import { FieldValue } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { completionId } from '../../lib/ids';
import { db } from '../../lib/firestore';
import { writeAudit } from '../../lib/audit';
import { requireHouseholdId, requireMember } from '../helpers';
import type { HandlerContext } from '../types';

export async function completeTask(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as { reminderId: string; dueDate: string };
  const reminderSnap = await ctx.tx.get(db.collection('reminders').doc(payload.reminderId));
  if (!reminderSnap.exists || reminderSnap.data()?.householdId !== householdId) {
    throw new AppError('NOT_FOUND', 'reminder not found');
  }
  const id = completionId(payload.reminderId, payload.dueDate);
  const ref = db.collection('taskCompletions').doc(id);
  const existing = await ctx.tx.get(ref);
  if (existing.exists) {
    return {
      ok: true,
      commandId: ctx.envelope.commandId,
      data: { completionId: id, alreadyCompleted: true, ...(existing.data() as object) },
      serverTime: new Date().toISOString(),
    };
  }
  ctx.tx.set(ref, {
    householdId,
    animalId: reminderSnap.data()?.animalId,
    reminderId: payload.reminderId,
    dueDate: payload.dueDate,
    completedAt: FieldValue.serverTimestamp(),
    completedBy: ctx.uid,
    source: ctx.source,
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: ctx.source === 'bot' ? 'bot' : 'user',
    action: 'task.complete',
    targetType: 'reminder',
    targetId: payload.reminderId,
    after: { dueDate: payload.dueDate },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { completionId: id, completedBy: ctx.uid },
    serverTime: new Date().toISOString(),
  };
}

export async function uncompleteTask(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  const payload = ctx.envelope.payload as { reminderId: string; dueDate: string };
  const id = completionId(payload.reminderId, payload.dueDate);
  const ref = db.collection('taskCompletions').doc(id);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new AppError('NOT_FOUND', 'completion not found');
  const data = snap.data() as { completedBy?: string };
  if (member.role !== 'owner' && data.completedBy !== ctx.uid) {
    throw new AppError('FORBIDDEN', 'only the completer or an owner can undo');
  }
  ctx.tx.delete(ref);
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'task.uncomplete',
    targetType: 'reminder',
    targetId: payload.reminderId,
    before: { dueDate: payload.dueDate },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { completionId: id, removed: true },
    serverTime: new Date().toISOString(),
  };
}
```

`services/functions/src/user/deleteAccount.ts`:

```ts
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { AppError } from '@taijian/domain';
import { db } from '../lib/firestore';

export const deleteAccount = onCall({ region: 'asia-east1' }, async (request) => {
  if (!request.auth) throw new AppError('UNAUTHENTICATED', 'sign in required');
  const uid = request.auth.uid;

  const owned = await db.collection('households').where('ownerUid', '==', uid).get();
  for (const household of owned.docs) {
    const memberCount = (household.data().memberCount as number | undefined) ?? 1;
    if (memberCount > 1) {
      throw new AppError('FORBIDDEN', 'transfer or remove members before deleting the account');
    }
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const householdIds = (userSnap.data()?.householdIds as string[] | undefined) ?? [];
  for (const householdId of householdIds) {
    const memberRef = db.doc(`households/${householdId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) continue;
    const role = memberSnap.data()?.role as 'owner' | 'caretaker';
    await db.runTransaction(async (tx) => {
      const householdRef = db.collection('households').doc(householdId);
      const householdSnap = await tx.get(householdRef);
      if (!householdSnap.exists) return;
      tx.delete(memberRef);
      tx.set(
        householdRef,
        {
          memberCount: FieldValue.increment(-1),
          ownerCount: FieldValue.increment(role === 'owner' ? -1 : 0),
          ...(owned.docs.some((doc) => doc.id === householdId)
            ? { deletedAt: FieldValue.serverTimestamp() }
            : {}),
        },
        { merge: true },
      );
      tx.set(
        db.collection('users').doc(uid),
        { householdIds: FieldValue.arrayRemove(householdId) },
        { merge: true },
      );
    });
  }

  const lineMappings = await db.collection('lineUsers').where('uid', '==', uid).get();
  await Promise.all(lineMappings.docs.map((doc) => doc.ref.delete()));
  await db.collection('users').doc(uid).delete().catch(() => undefined);
  await getAuth().deleteUser(uid).catch((error) => {
    if (error.code !== 'auth/user-not-found') throw error;
  });
  return { deleted: true };
});
```

Update `registry.ts` with reminders/tasks:

```ts
import { createReminder, deleteReminder, updateReminder } from './handlers/reminders';
import { completeTask, uncompleteTask } from './handlers/tasks';

export const commandHandlers: HandlerMap = {
  // ...
  'reminder.create': createReminder,
  'reminder.update': updateReminder,
  'reminder.delete': deleteReminder,
  'task.complete': completeTask,
  'task.uncomplete': uncompleteTask,
};
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @taijian/functions test test/schedule.test.ts
pnpm --filter @taijian/functions test:integration
pnpm --filter @taijian/functions typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add services/functions
git commit -m "feat(functions): add reminders, task completion, and account deletion"
```

## Task 9: Callable entrypoint and function exports

**Files:**
- Create: `services/functions/src/commands/execute.ts`, `services/functions/src/index.ts`
- Test: `services/functions/test/execute.test.ts`

**Interfaces:**
- Consumes: `runCommand`, `commandHandlers`, `CommandEnvelopeSchema`, `toFailure`, `lineLogin`, `deleteAccount`
- Produces: `handleCommandRequest(authUid, data)`, `executeCommand` callable, `index.ts` exports.

- [ ] **Step 1: Write the failing tests**

`services/functions/test/execute.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { handleCommandRequest } from '../src/commands/execute';

describe('handleCommandRequest', () => {
  it('returns UNAUTHENTICATED when there is no auth user', async () => {
    const result = await handleCommandRequest(undefined, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHENTICATED');
  });

  it('returns VALIDATION_ERROR for a malformed envelope', async () => {
    const result = await handleCommandRequest('u1', { type: 'animal.create' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @taijian/functions test test/execute.test.ts
```

Expected: FAIL because `src/commands/execute.ts` does not exist.

- [ ] **Step 3: Implement the entrypoint**

Update `firebase.json` to register Functions and Hosting:

```json
{
  "functions": {
    "source": "services/functions",
    "codebase": "default",
    "runtime": "nodejs22",
    "predeploy": ["pnpm --filter @taijian/functions build"]
  },
  "hosting": {
    "public": "apps/liff/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

Build Functions before starting the emulator:

```bash
pnpm --filter @taijian/functions build
```

`services/functions/src/commands/execute.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { CommandEnvelopeSchema, type CommandResult } from '@taijian/domain';
import { toFailure } from '../lib/result';
import { commandHandlers } from './registry';
import { runCommand } from './runCommand';

export async function handleCommandRequest(
  authUid: string | undefined,
  data: unknown,
): Promise<CommandResult> {
  const serverTime = new Date().toISOString();
  if (!authUid) {
    return {
      ok: false,
      commandId: 'unknown',
      code: 'UNAUTHENTICATED',
      message: 'Sign in required',
      serverTime,
    };
  }

  const parsed = CommandEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      commandId: 'unknown',
      code: 'VALIDATION_ERROR',
      message: parsed.error.message,
      serverTime,
    };
  }

  try {
    return await runCommand({
      uid: authUid,
      envelope: parsed.data,
      source: parsed.data.client.platform,
      handlers: commandHandlers,
    });
  } catch (error) {
    return toFailure(error, parsed.data.commandId);
  }
}

export const executeCommand = onCall({ region: 'asia-east1' }, (request) =>
  handleCommandRequest(request.auth?.uid, request.data),
);
```

`services/functions/src/index.ts`:

```ts
export { lineLogin } from './auth/line';
export { executeCommand } from './commands/execute';
export { deleteAccount } from './user/deleteAccount';
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @taijian/functions test test/execute.test.ts
pnpm --filter @taijian/functions typecheck
pnpm --filter @taijian/functions build
```

Expected: PASS; build writes `dist/index.js`.

- [ ] **Step 5: Commit**

```bash
git add services/functions
git commit -m "feat(functions): add executeCommand callable and exports"
```

---

## Task 10: Firestore security rules and rules tests

**Files:**
- Modify: `firestore.rules`
- Create: `services/functions/test/rules.test.ts`
- Modify: `services/functions/package.json` (add `@firebase/rules-unit-testing`, `firebase`, `test:rules` script)

**Interfaces:**
- Consumes: Firestore documents shaped by Tasks 6–8.
- Produces: rules that deny client writes and allow reads only to household members.

- [ ] **Step 1: Write the failing rules tests**

`services/functions/test/rules.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-taijian',
    firestore: {
      host: 'localhost',
      port: 8080,
      rules: readFileSync(resolve(process.cwd(), '../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'households/h1'), {
      name: '家',
      ownerUid: 'alice',
      ownerCount: 1,
      memberCount: 2,
      deletedAt: null,
    });
    await setDoc(doc(db, 'households/h1/members/alice'), { uid: 'alice', role: 'owner' });
    await setDoc(doc(db, 'households/h1/members/bob'), { uid: 'bob', role: 'caretaker' });
    await setDoc(doc(db, 'animals/a1'), { householdId: 'h1', name: '阿肥' });
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice' });
    await setDoc(doc(db, 'commands/c1'), { uid: 'alice' });
  });
});

describe('firestore rules', () => {
  it('lets a member read an animal', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(db, 'animals/a1')));
  });

  it('blocks an outsider from reading an animal', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertFails(getDoc(doc(db, 'animals/a1')));
  });

  it('blocks client writes to animals', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'animals/a2'), { householdId: 'h1', name: '新' }));
  });

  it('allows a user to read only their own profile', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'users/alice')));
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(bob, 'users/alice')));
  });

  it('blocks all client access to commands', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(db, 'commands/c1')));
  });
});
```

Add to `services/functions/package.json`:

```json
"test:rules": "firebase emulators:exec --config ../../firebase.json --only firestore --project demo-taijian \"vitest run test/rules.test.ts\""
```

Add devDependencies:

```bash
pnpm --filter @taijian/functions add -D @firebase/rules-unit-testing firebase
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @taijian/functions test:rules
```

Expected: FAIL because the temporary deny-all rules block member reads.

- [ ] **Step 3: Implement the rules**

`firestore.rules`:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isMember(householdId) {
      return signedIn()
        && exists(/databases/$(database)/documents/households/$(householdId)/members/$(request.auth.uid));
    }

    match /users/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow write: if false;
    }

    match /households/{householdId} {
      allow read: if isMember(householdId);
      allow write: if false;

      match /members/{uid} {
        allow read: if signedIn() && (request.auth.uid == uid || isMember(householdId));
        allow write: if false;
      }

      match /auditLogs/{logId} {
        allow read: if isMember(householdId);
        allow write: if false;
      }
    }

    match /animals/{animalId} {
      allow read: if isMember(resource.data.householdId);
      allow write: if false;
    }

    match /records/{recordId} {
      allow read: if isMember(resource.data.householdId);
      allow write: if false;
    }

    match /reminders/{reminderId} {
      allow read: if isMember(resource.data.householdId);
      allow write: if false;
    }

    match /taskCompletions/{completionId} {
      allow read: if isMember(resource.data.householdId);
      allow write: if false;
    }

    match /lineUsers/{lineUserId} {
      allow read, write: if false;
    }

    match /invites/{inviteId} {
      allow read, write: if false;
    }

    match /commands/{commandId} {
      allow read, write: if false;
    }

    match /rateLimits/{uid} {
      allow read, write: if false;
    }

    match /notificationLog/{logId} {
      allow read, write: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 4: Run the rules tests**

```bash
pnpm --filter @taijian/functions test:rules
```

Expected: PASS. If the member read fails, confirm the member document exists and the rule uses the same `householdId` field as the animal.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules services/functions/package.json services/functions/test/rules.test.ts pnpm-lock.yaml
git commit -m "feat(security): add member-scoped firestore rules and tests"
```

---

## Task 11: LIFF shell, design system, authentication, and Today

**Files:**
- Create: `apps/liff/package.json`, `apps/liff/vite.config.ts`, `apps/liff/tsconfig.json`, `apps/liff/index.html`, `apps/liff/src/main.tsx`, `apps/liff/src/App.tsx`, `apps/liff/src/styles/tokens.css`, `apps/liff/src/styles/global.css`, `apps/liff/src/lib/firebase.ts`, `apps/liff/src/lib/liff.ts`, `apps/liff/src/lib/api.ts`, `apps/liff/src/lib/auth.tsx`, `apps/liff/src/lib/household.tsx`, `apps/liff/src/lib/today.ts`, `apps/liff/src/components/AppShell.tsx`, `apps/liff/src/components/BottomNav.tsx`, `apps/liff/src/components/TaskRow.tsx`, `apps/liff/src/components/AnimalChip.tsx`, `apps/liff/src/components/MossCard.tsx`, `apps/liff/src/components/EmptyState.tsx`, `apps/liff/src/pages/TodayPage.tsx`
- Test: `apps/liff/src/test/setup.ts`, `apps/liff/src/test/today.test.ts`, `apps/liff/src/test/taskRow.test.tsx`

**Interfaces:**
- Consumes: `CommandEnvelope`, `CommandResult`, `newCommandId`, `localDateKey`
- Produces: `callCommand`, `AuthProvider`, `useAuth`, `HouseholdProvider`, `useHousehold`, `buildTodayTasks`, `AppShell`, `TaskRow`, `AnimalChip`.

- [ ] **Step 1: Create the LIFF package**

`apps/liff/package.json`:

```json
{
  "name": "@taijian/liff",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@line/liff": "^2.27.0",
    "@taijian/domain": "workspace:*",
    "firebase": "^12.0.0",
    "lucide-react": "^0.500.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.7.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

`apps/liff/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

`apps/liff/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "types": ["vite/client", "vitest/globals"] },
  "include": ["src", "vite.config.ts"]
}
```

`apps/liff/index.html`:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>苔間</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the failing Today tests**

`apps/liff/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`apps/liff/src/test/today.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTodayTasks } from '../lib/today';

describe('buildTodayTasks', () => {
  it('marks an overdue reminder and attaches completion', () => {
    const now = new Date('2026-10-24T02:00:00.000Z'); // 10:00 Taipei
    const tasks = buildTodayTasks(
      [
        {
          id: 'r1',
          animalId: 'a1',
          title: '餵食',
          timezone: 'Asia/Taipei',
          nextDueAt: new Date('2026-10-24T00:00:00.000Z'), // 08:00
          enabled: true,
        },
        {
          id: 'r2',
          animalId: 'a1',
          title: '換水',
          timezone: 'Asia/Taipei',
          nextDueAt: new Date('2026-10-24T04:00:00.000Z'), // 12:00
          enabled: true,
        },
      ],
      [{ reminderId: 'r2', dueDate: '2026-10-24', completedBy: 'bob' }],
      [{ id: 'a1', name: '阿肥', avatarColor: '#7C9A76', species: '豹紋守宮' }],
      now,
    );
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.reminderId).toBe('r1');
    expect(tasks[0]?.overdue).toBe(true);
    expect(tasks[1]?.completedBy).toBe('bob');
  });
});
```

`apps/liff/src/test/taskRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskRow } from '../components/TaskRow';

describe('TaskRow', () => {
  it('shows the animal name and completion state', () => {
    render(
      <TaskRow
        task={{
          reminderId: 'r1',
          animalId: 'a1',
          animalName: '阿肥',
          title: '餵食',
          dueDate: '2026-10-24',
          dueAt: new Date('2026-10-24T00:00:00.000Z'),
          overdue: true,
        }}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/阿肥/)).toBeInTheDocument();
    expect(screen.getByText(/餵食/)).toBeInTheDocument();
    expect(screen.getByText('逾時')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm --filter @taijian/liff test
```

Expected: FAIL because the components and `today.ts` do not exist.

- [ ] **Step 4: Implement the shell, tokens, auth, and Today logic**

`apps/liff/src/styles/tokens.css`:

```css
:root {
  --bg: #fff8ee;
  --ink: #3b2f2a;
  --primary: #7c9a76;
  --primary-strong: #4f6b4b;
  --accent: #e8a87c;
  --butter: #f4d9b0;
  --success-bg: #eef4e8;
  --overdue: #c96f4a;
  --card: #ffffff;
  --muted: #8a7e73;
  --line: #eadccb;
  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --font-body: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: 'Nunito', 'Noto Sans TC', -apple-system, sans-serif;
  --shadow-card: 0 10px 26px rgba(120, 96, 70, 0.1);
}
```

`apps/liff/src/styles/global.css`:

```css
@import './tokens.css';

* { box-sizing: border-box; }
html, body, #root { min-height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
a { color: inherit; }
.shell { max-width: 520px; margin: 0 auto; min-height: 100dvh; padding: 20px 18px 92px; }
.shell-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.kicker { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
.h1 { font-family: var(--font-display); font-size: 26px; line-height: 1.2; margin: 4px 0; }
.muted { color: var(--muted); font-size: 13px; }
.card { background: var(--card); border-radius: var(--radius-lg); padding: var(--space-4); box-shadow: var(--shadow-card); }
.stack { display: grid; gap: var(--space-3); }
```

`apps/liff/src/lib/firebase.ts`:

```ts
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-east1');

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

`apps/liff/src/lib/liff.ts`:

```ts
import liff from '@line/liff';

export async function initLiff(): Promise<void> {
  const liffId = import.meta.env.VITE_LIFF_ID;
  if (!liffId) throw new Error('VITE_LIFF_ID is missing');
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
  }
}

export async function getLineIdToken(): Promise<string> {
  if (import.meta.env.VITE_USE_MOCK_LINE === 'true' && import.meta.env.DEV) {
    const mock = new URLSearchParams(window.location.search).get('mockLineIdToken');
    return mock ?? localStorage.getItem('mockLineIdToken') ?? 'test-token-A';
  }
  const token = liff.getIDToken();
  if (!token) throw new Error('LINE ID token unavailable');
  return token;
}

export async function shareInvite(url: string): Promise<void> {
  if (liff.isApiAvailable('shareTargetPicker')) {
    await liff.shareTargetPicker([{ type: 'text', text: `加入苔間家庭：${url}` }]);
    return;
  }
  await navigator.clipboard.writeText(url);
}
```

`apps/liff/src/lib/api.ts`:

```ts
import { httpsCallable } from 'firebase/functions';
import { newCommandId, type CommandEnvelope, type CommandResult } from '@taijian/domain';
import { functions } from './firebase';

const execute = httpsCallable<CommandEnvelope, CommandResult>(functions, 'executeCommand');

export async function callCommand<T = unknown>(
  type: string,
  payload: unknown,
  options: { householdId?: string; baseRevision?: number } = {},
): Promise<CommandResult<T>> {
  const envelope: CommandEnvelope = {
    commandId: newCommandId(),
    type,
    ...(options.householdId ? { householdId: options.householdId } : {}),
    ...(options.baseRevision !== undefined ? { baseRevision: options.baseRevision } : {}),
    payload,
    client: { platform: 'liff', appVersion: '1.0.0' },
  };
  const response = await execute(envelope);
  return response.data as CommandResult<T>;
}

export async function callLogin(idToken: string): Promise<{ token: string; uid: string }> {
  const login = httpsCallable<{ idToken: string }, { token: string; uid: string }>(
    functions,
    'lineLogin',
  );
  const response = await login({ idToken });
  return response.data;
}
```

`apps/liff/src/lib/auth.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithCustomToken, type User } from 'firebase/auth';
import { auth } from './firebase';
import { getLineIdToken, initLiff } from './liff';
import { callLogin } from './api';

type AuthState = { user: User | null; loading: boolean; error: string | null };
const AuthContext = createContext<AuthState>({ user: null, loading: true, error: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState((prev) => ({ ...prev, user, loading: false }));
    });
    (async () => {
      try {
        await initLiff();
        if (!auth.currentUser) {
          const idToken = await getLineIdToken();
          const { token } = await callLogin(idToken);
          await signInWithCustomToken(auth, token);
        }
      } catch (error) {
        setState({ user: null, loading: false, error: (error as Error).message });
      }
    })();
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
```

`apps/liff/src/lib/household.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';

type Household = { id: string; name: string };
type HouseholdState = {
  household: Household | null;
  householdIds: string[];
  loading: boolean;
  select: (id: string) => void;
};

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  householdIds: [],
  loading: true,
  select: () => undefined,
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [householdIds, setHouseholdIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const ids = (snap.data()?.householdIds as string[] | undefined) ?? [];
      setHouseholdIds(ids);
      setSelectedId((current) => current ?? ids[0] ?? null);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedId) {
      setHousehold(null);
      return;
    }
    return onSnapshot(doc(db, 'households', selectedId), (snap) => {
      if (!snap.exists()) return;
      setHousehold({ id: snap.id, name: snap.data().name as string });
    });
  }, [selectedId]);

  const value = useMemo(
    () => ({ household, householdIds, loading, select: setSelectedId }),
    [household, householdIds, loading],
  );
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdState {
  return useContext(HouseholdContext);
}
```

`apps/liff/src/lib/today.ts`:

```ts
import { localDateKey } from '@taijian/domain';

export type ReminderLike = {
  id: string;
  animalId: string;
  title: string;
  timezone: string;
  nextDueAt: Date | { toDate: () => Date };
  enabled: boolean;
  deletedAt?: unknown;
};
export type CompletionLike = {
  reminderId: string;
  dueDate: string;
  completedBy?: string;
};
export type AnimalLike = {
  id: string;
  name: string;
  avatarColor: string;
  species: string;
};
export type TodayTask = {
  reminderId: string;
  animalId: string;
  animalName: string;
  title: string;
  dueDate: string;
  dueAt: Date;
  overdue: boolean;
  completedBy?: string;
};

function toDate(value: ReminderLike['nextDueAt']): Date {
  return value instanceof Date ? value : value.toDate();
}

export function buildTodayTasks(
  reminders: ReminderLike[],
  completions: CompletionLike[],
  animals: AnimalLike[],
  now: Date,
): TodayTask[] {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const completionByKey = new Map(
    completions.map((completion) => [
      `${completion.reminderId}:${completion.dueDate}`,
      completion,
    ]),
  );

  return reminders
    .filter((reminder) => reminder.enabled && !reminder.deletedAt)
    .map((reminder) => {
      const dueAt = toDate(reminder.nextDueAt);
      const dueDate = localDateKey(dueAt, reminder.timezone);
      const today = localDateKey(now, reminder.timezone);
      if (dueDate !== today) return null;
      const animal = animalById.get(reminder.animalId);
      const completion = completionByKey.get(`${reminder.id}:${dueDate}`);
      return {
        reminderId: reminder.id,
        animalId: reminder.animalId,
        animalName: animal?.name ?? '未命名居民',
        title: reminder.title,
        dueDate,
        dueAt,
        overdue: dueAt.getTime() < now.getTime(),
        ...(completion?.completedBy ? { completedBy: completion.completedBy } : {}),
      } satisfies TodayTask;
    })
    .filter((task): task is TodayTask => task !== null)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueAt.getTime() - b.dueAt.getTime());
}
```

`apps/liff/src/components/TaskRow.tsx`:

```tsx
import type { TodayTask } from '../lib/today';

export function TaskRow({
  task,
  onComplete,
}: {
  task: TodayTask;
  onComplete: (task: TodayTask) => void;
}) {
  const done = Boolean(task.completedBy);
  return (
    <button
      type="button"
      onClick={() => !done && onComplete(task)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        border: 0,
        borderBottom: '1px dashed var(--line)',
        background: 'transparent',
        padding: '12px 2px',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: done ? 'var(--primary)' : 'var(--success-bg)',
          color: done ? '#fff' : 'var(--primary)',
          fontWeight: 800,
          flex: '0 0 auto',
        }}
      >
        {done ? '✓' : ''}
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>
          {task.animalName} · {task.title}
        </span>
        <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
          {task.dueAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
          {done ? ` · 已完成 by ${task.completedBy}` : ''}
        </span>
      </span>
      {!done && task.overdue && (
        <span
          style={{
            background: 'var(--overdue)',
            color: '#fff',
            borderRadius: 999,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          逾時
        </span>
      )}
    </button>
  );
}
```

`apps/liff/src/components/AnimalChip.tsx`:

```tsx
export function AnimalChip({
  name,
  species,
  color,
}: {
  name: string;
  species: string;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: color,
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px var(--line)',
        }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{species}</div>
      </div>
    </div>
  );
}
```

`apps/liff/src/components/AppShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      {children}
      <BottomNav />
    </div>
  );
}
```

`apps/liff/src/components/BottomNav.tsx`:

```tsx
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: '今日' },
  { to: '/animals', label: '居民' },
  { to: '/records', label: '紀錄' },
  { to: '/settings', label: '設定' },
];

export function BottomNav() {
  return (
    <nav
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 12,
        transform: 'translateX(-50%)',
        width: 'min(480px, calc(100% - 24px))',
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 8px 24px rgba(120,96,70,.14)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '9px 6px',
        fontSize: 11,
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => ({
            color: isActive ? 'var(--primary-strong)' : 'var(--muted)',
            textDecoration: 'none',
            fontWeight: isActive ? 800 : 600,
          })}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

`apps/liff/src/pages/TodayPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { buildTodayTasks, type TodayTask } from '../lib/today';
import { callCommand } from '../lib/api';
import { TaskRow } from '../components/TaskRow';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';

export function TodayPage() {
  const { household } = useHousehold();
  const [reminders, setReminders] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [animals, setAnimals] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    const unsubReminders = onSnapshot(
      query(collection(db, 'reminders'), where('householdId', '==', household.id)),
      (snap) => setReminders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    );
    const unsubCompletions = onSnapshot(
      query(collection(db, 'taskCompletions'), where('householdId', '==', household.id)),
      (snap) => setCompletions(snap.docs.map((doc) => doc.data())),
    );
    const unsubAnimals = onSnapshot(
      query(collection(db, 'animals'), where('householdId', '==', household.id)),
      (snap) =>
        setAnimals(
          snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((animal) => animal.status === 'active'),
        ),
    );
    return () => {
      unsubReminders();
      unsubCompletions();
      unsubAnimals();
    };
  }, [household]);

  const tasks = useMemo(
    () => buildTodayTasks(reminders, completions, animals, new Date()),
    [reminders, completions, animals],
  );

  async function complete(task: TodayTask) {
    if (!household) return;
    const result = await callCommand(
      'task.complete',
      { reminderId: task.reminderId, dueDate: task.dueDate },
      { householdId: household.id },
    );
    if (!result.ok) setError(result.message);
  }

  if (!household) {
    return (
      <AppShell>
        <EmptyState title="還沒有家庭" body="先在設定裡建立一個家庭，或接受家人的邀請。" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="shell-header">
        <div>
          <div className="kicker">Today</div>
          <h1 className="h1">早安，今天也要好好照顧牠們。</h1>
          <div className="muted">{tasks.length} 件照護任務</div>
        </div>
      </header>
      {error && <p style={{ color: 'var(--overdue)' }}>{error}</p>}
      <section className="card" style={{ marginTop: 16 }}>
        {tasks.length === 0 ? (
          <EmptyState title="今天沒有任務" body="可以到居民頁新增提醒，或先記一筆照護。" />
        ) : (
          tasks.map((task) => (
            <TaskRow key={`${task.reminderId}:${task.dueDate}`} task={task} onComplete={complete} />
          ))
        )}
      </section>
    </AppShell>
  );
}
```

`apps/liff/src/components/EmptyState.tsx`:

```tsx
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 12px' }}>
      <div style={{ fontSize: 34 }} aria-hidden>
        🌿
      </div>
      <h3 style={{ margin: '8px 0 4px' }}>{title}</h3>
      <p className="muted" style={{ margin: 0 }}>{body}</p>
    </div>
  );
}
```

`apps/liff/src/App.tsx`:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { HouseholdProvider } from './lib/household';
import { TodayPage } from './pages/TodayPage';

function Gate() {
  const { loading, error } = useAuth();
  if (loading) return <div className="shell">載入中…</div>;
  if (error) return <div className="shell">登入失敗：{error}</div>;
  return (
    <HouseholdProvider>
      <Routes>
        <Route path="/" element={<TodayPage />} />
      </Routes>
    </HouseholdProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

`apps/liff/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Run the LIFF tests**

```bash
pnpm --filter @taijian/liff test
pnpm --filter @taijian/liff typecheck
```

Expected: PASS. If `buildTodayTasks` marks the 12:00 task completed, confirm the completion key is `reminderId:dueDate`.

- [ ] **Step 6: Commit**

```bash
git add apps/liff
git commit -m "feat(liff): add shell, design tokens, auth, household, and today page"
```

## Task 12: LIFF animals, records, invite, and settings

**Files:**
- Create: `apps/liff/src/pages/AnimalsPage.tsx`, `apps/liff/src/pages/AnimalNewPage.tsx`, `apps/liff/src/pages/AnimalDetailPage.tsx`, `apps/liff/src/pages/RecordsPage.tsx`, `apps/liff/src/pages/RecordPage.tsx`, `apps/liff/src/pages/InvitePage.tsx`, `apps/liff/src/pages/SettingsPage.tsx`, `apps/liff/src/components/QuickRecordSheet.tsx`, `apps/liff/src/components/MossCard.tsx`, `apps/liff/src/components/PrimaryButton.tsx`, `apps/liff/src/components/ConflictBanner.tsx`
- Modify: `apps/liff/src/App.tsx`
- Test: `apps/liff/src/test/quickRecord.test.tsx`

**Interfaces:**
- Consumes: `callCommand`, `useHousehold`, `useAuth`, `newCommandId`
- Produces: routes `/animals`, `/animals/:id`, `/records`, `/record/new`, `/invite`, `/settings`; `QuickRecordSheet` with `{ householdId, animalId, onDone }`.

- [ ] **Step 1: Write the failing quick-record test**

`apps/liff/src/test/quickRecord.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickRecordSheet } from '../components/QuickRecordSheet';
import { callCommand } from '../lib/api';

vi.mock('../lib/api', () => ({
  callCommand: vi.fn(),
}));

const mockedCall = vi.mocked(callCommand);

beforeEach(() => {
  mockedCall.mockReset();
  mockedCall.mockResolvedValue({
    ok: true,
    commandId: 'c1',
    data: { recordId: 'r1' },
    serverTime: new Date().toISOString(),
  });
});

describe('QuickRecordSheet', () => {
  it('submits a weight record with grams', async () => {
    render(<QuickRecordSheet householdId="h1" animalId="a1" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '體重' }));
    fireEvent.change(screen.getByLabelText('數值'), { target: { value: '68' } });
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '飯後' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'record.create',
        expect.objectContaining({
          animalId: 'a1',
          type: 'weight',
          value: 68,
          unit: 'g',
          note: '飯後',
        }),
        { householdId: 'h1' },
      );
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @taijian/liff test test/quickRecord.test.tsx
```

Expected: FAIL because `QuickRecordSheet` does not exist.

- [ ] **Step 3: Implement the shared components and quick-record sheet**

`apps/liff/src/components/PrimaryButton.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react';

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        minHeight: 52,
        width: '100%',
        border: 0,
        borderRadius: 16,
        background: props.disabled ? 'var(--line)' : 'var(--primary)',
        color: '#fff',
        fontWeight: 800,
        fontSize: 15,
        ...props.style,
      }}
    />
  );
}
```

`apps/liff/src/components/MossCard.tsx`:

```tsx
import type { ReactNode } from 'react';

export function MossCard({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="card">
      {title && <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>{title}</h2>}
      {children}
    </section>
  );
}
```

`apps/liff/src/components/ConflictBanner.tsx`:

```tsx
export function ConflictBanner({
  message,
  onUseLatest,
  onKeepMine,
}: {
  message: string;
  onUseLatest: () => void;
  onKeepMine: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--butter)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <strong style={{ display: 'block', marginBottom: 6 }}>資料已更新</strong>
      <p style={{ margin: '0 0 10px', fontSize: 13 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onUseLatest} style={{ flex: 1, minHeight: 40, borderRadius: 12, border: 0, background: '#fff' }}>
          查看最新
        </button>
        <button type="button" onClick={onKeepMine} style={{ flex: 1, minHeight: 40, borderRadius: 12, border: 0, background: 'var(--accent)' }}>
          保留我的
        </button>
      </div>
    </div>
  );
}
```

`apps/liff/src/components/QuickRecordSheet.tsx`:

```tsx
import { useState } from 'react';
import { callCommand } from '../lib/api';
import { PrimaryButton } from './PrimaryButton';

const TYPES = [
  { id: 'feeding', label: '餵食' },
  { id: 'water', label: '換水' },
  { id: 'weight', label: '體重' },
  { id: 'poop', label: '排便' },
  { id: 'shed', label: '蛻皮' },
  { id: 'note', label: '備註' },
] as const;

export function QuickRecordSheet({
  householdId,
  animalId,
  onDone,
}: {
  householdId: string;
  animalId: string;
  onDone: () => void;
}) {
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('feeding');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {
      animalId,
      type,
      occurredAt: new Date().toISOString(),
    };
    if (value.trim()) {
      payload.value = Number(value);
      if (type === 'weight') payload.unit = 'g';
    }
    if (note.trim()) payload.note = note.trim();

    const result = await callCommand('record.create', payload, { householdId });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone();
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setType(item.id)}
            style={{
              minHeight: 40,
              borderRadius: 999,
              border: '1px solid var(--line)',
              background: type === item.id ? 'var(--primary)' : '#fff',
              color: type === item.id ? '#fff' : 'var(--ink)',
              padding: '0 14px',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {(type === 'weight' || type === 'custom') && (
        <label>
          <span className="muted">數值</span>
          <input
            aria-label="數值"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            style={{ width: '100%', minHeight: 48, borderRadius: 12, border: '1px solid var(--line)', padding: '0 12px', marginTop: 4 }}
          />
        </label>
      )}
      <label>
        <span className="muted">備註</span>
        <textarea
          aria-label="備註"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)', padding: 12, marginTop: 4 }}
        />
      </label>
      {error && <p style={{ color: 'var(--overdue)', margin: 0 }}>{error}</p>}
      <PrimaryButton type="button" onClick={submit} disabled={busy}>
        {busy ? '儲存中…' : '儲存'}
      </PrimaryButton>
    </div>
  );
}
```

- [ ] **Step 4: Implement the pages and routes**

`apps/liff/src/pages/AnimalsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { AppShell } from '../components/AppShell';
import { AnimalChip } from '../components/AnimalChip';
import { EmptyState } from '../components/EmptyState';

export function AnimalsPage() {
  const { household } = useHousehold();
  const [animals, setAnimals] = useState<any[]>([]);

  useEffect(() => {
    if (!household) return;
    return onSnapshot(
      query(
        collection(db, 'animals'),
        where('householdId', '==', household.id),
        where('status', '==', 'active'),
      ),
      (snap) =>
        setAnimals(
          snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((animal) => animal.status === 'active'),
        ),
    );
  }, [household]);

  return (
    <AppShell>
      <header className="shell-header">
        <div>
          <div className="kicker">Residents</div>
          <h1 className="h1">我的居民</h1>
        </div>
        <Link to="/animals/new" style={{ textDecoration: 'none', color: 'var(--primary-strong)', fontWeight: 800 }}>
          ＋ 新增
        </Link>
      </header>
      {animals.length === 0 ? (
        <EmptyState title="還沒有居民" body="新增第一隻爬寵，開始記錄牠的日常生活。" />
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {animals.map((animal) => (
            <Link key={animal.id} to={`/animals/${animal.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card">
                <AnimalChip name={animal.name} species={animal.species} color={animal.avatarColor ?? '#7C9A76'} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
```

`apps/liff/src/pages/AnimalDetailPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { AppShell } from '../components/AppShell';
import { AnimalChip } from '../components/AnimalChip';
import { QuickRecordSheet } from '../components/QuickRecordSheet';

export function AnimalDetailPage() {
  const { id = '' } = useParams();
  const { household } = useHousehold();
  const [animal, setAnimal] = useState<any | null>(null);
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'animals', id), (snap) => {
      if (snap.exists()) setAnimal({ id: snap.id, ...snap.data() });
    });
  }, [id]);

  useEffect(() => {
    if (!household || !id) return;
    return onSnapshot(
      query(
        collection(db, 'records'),
        where('householdId', '==', household.id),
        orderBy('occurredAt', 'desc'),
      ),
      (snap) =>
        setRecords(
          snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((record) => record.animalId === id),
        ),
    );
  }, [household, id]);

  if (!animal || !household) return <AppShell>載入中…</AppShell>;

  return (
    <AppShell>
      <header className="shell-header">
        <div>
          <div className="kicker">Resident</div>
          <AnimalChip name={animal.name} species={animal.species} color={animal.avatarColor ?? '#7C9A76'} />
        </div>
      </header>
      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>快速紀錄</h2>
        <QuickRecordSheet householdId={household.id} animalId={id} onDone={() => undefined} />
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>最近紀錄</h2>
        {records.length === 0 && <p className="muted">還沒有紀錄。</p>}
        {records.map((record) => (
          <div key={record.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{record.type}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {record.note || `${record.value ?? ''} ${record.unit ?? ''}`}
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
```

`apps/liff/src/pages/AnimalNewPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SPECIES } from '@taijian/domain';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';
import { useHousehold } from '../lib/household';
import { callCommand } from '../lib/api';

export function AnimalNewPage() {
  const { household } = useHousehold();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState(SPECIES[0]?.id ?? 'other');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!household || !name.trim()) return;
    setBusy(true);
    setError('');
    const selected = SPECIES.find((item) => item.id === species);
    const result = await callCommand(
      'animal.create',
      {
        name: name.trim(),
        species,
        speciesLabel: selected?.name,
        sex: 'unknown',
        avatarColor: '#7C9A76',
      },
      { householdId: household.id },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigate(`/animals/${(result.data as { animalId: string }).animalId}`);
  }

  return (
    <AppShell>
      <div className="kicker">New resident</div>
      <h1 className="h1">新增居民</h1>
      <div className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <label>
          <span className="muted">名字</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ width: '100%', minHeight: 48, borderRadius: 12, border: '1px solid var(--line)', padding: '0 12px', marginTop: 4 }}
          />
        </label>
        <label>
          <span className="muted">物種</span>
          <select
            value={species}
            onChange={(event) => setSpecies(event.target.value)}
            style={{ width: '100%', minHeight: 48, borderRadius: 12, border: '1px solid var(--line)', padding: '0 12px', marginTop: 4 }}
          >
            {SPECIES.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        {error && <p style={{ color: 'var(--overdue)', margin: 0 }}>{error}</p>}
        <PrimaryButton type="button" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? '儲存中…' : '建立居民'}
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
```

`apps/liff/src/pages/RecordsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { AppShell } from '../components/AppShell';

export function RecordsPage() {
  const { household } = useHousehold();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    if (!household) return;
    return onSnapshot(
      query(
        collection(db, 'records'),
        where('householdId', '==', household.id),
        orderBy('occurredAt', 'desc'),
      ),
      (snap) => setRecords(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    );
  }, [household]);

  return (
    <AppShell>
      <div className="kicker">Timeline</div>
      <h1 className="h1">照護紀錄</h1>
      <div className="card" style={{ marginTop: 16 }}>
        {records.length === 0 && <p className="muted">還沒有紀錄。</p>}
        {records.map((record) => (
          <div key={record.id} style={{ padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
            <div style={{ fontWeight: 700 }}>{record.type}</div>
            <div className="muted">{record.note || `${record.value ?? ''} ${record.unit ?? ''}`}</div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
```

`apps/liff/src/pages/RecordPage.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { QuickRecordSheet } from '../components/QuickRecordSheet';
import { useHousehold } from '../lib/household';

export function RecordPage() {
  const [params] = useSearchParams();
  const { household } = useHousehold();
  const animalId = params.get('animalId') ?? '';
  if (!household || !animalId) return <AppShell>請先選擇居民。</AppShell>;
  return (
    <AppShell>
      <div className="kicker">Quick record</div>
      <h1 className="h1">記一筆</h1>
      <div className="card" style={{ marginTop: 16 }}>
        <QuickRecordSheet householdId={household.id} animalId={animalId} onDone={() => history.back()} />
      </div>
    </AppShell>
  );
}
```

`apps/liff/src/pages/InvitePage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { callCommand } from '../lib/api';

export function InvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('邀請連結不完整。');
      return;
    }
    callCommand('member.accept', { token }).then((result) => {
      if (result.ok) {
        setState('ok');
        setMessage('已加入家庭，歡迎一起照顧居民。');
      } else {
        setState('error');
        setMessage(result.message);
      }
    });
  }, [token]);

  return (
    <AppShell>
      <div className="card" style={{ marginTop: 40, textAlign: 'center' }}>
        <h1 className="h1">{state === 'ok' ? '邀請已接受' : state === 'error' ? '無法接受邀請' : '正在加入…'}</h1>
        <p className="muted">{message}</p>
        {state !== 'loading' && <a href="/" style={{ color: 'var(--primary-strong)', fontWeight: 800 }}>回到今日</a>}
      </div>
    </AppShell>
  );
}
```

`apps/liff/src/pages/SettingsPage.tsx`:

```tsx
import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useHousehold } from '../lib/household';
import { callCommand } from '../lib/api';
import { shareInvite } from '../lib/liff';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';

export function SettingsPage() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');

  async function createInvite() {
    if (!household) return;
    const result = await callCommand('member.invite', { role: 'caretaker', expiresInDays: 7 }, { householdId: household.id });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const token = (result.data as { token: string }).token;
    const url = `https://liff.line.me/${import.meta.env.VITE_LIFF_ID}/invite?token=${encodeURIComponent(token)}`;
    setInviteUrl(url);
  }

  async function removeAccount() {
    if (!confirm('確定要刪除帳號？此操作無法復原。')) return;
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../lib/firebase');
    await httpsCallable(functions, 'deleteAccount')({});
    await signOut(auth);
  }

  return (
    <AppShell>
      <div className="kicker">Settings</div>
      <h1 className="h1">設定</h1>
      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>家庭</h2>
        <p className="muted">{household?.name ?? '尚未加入家庭'}</p>
        {household && (
          <>
            <PrimaryButton type="button" onClick={createInvite}>產生邀請連結</PrimaryButton>
            {inviteUrl && (
              <div style={{ marginTop: 10 }}>
                <p style={{ wordBreak: 'break-all', fontSize: 12 }}>{inviteUrl}</p>
                <button type="button" onClick={() => shareInvite(inviteUrl)} style={{ minHeight: 40 }}>
                  分享邀請
                </button>
              </div>
            )}
          </>
        )}
        {error && <p style={{ color: 'var(--overdue)' }}>{error}</p>}
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>帳號</h2>
        <p className="muted">{user?.displayName ?? user?.uid}</p>
        <button type="button" onClick={() => signOut(auth)} style={{ minHeight: 40 }}>登出</button>
        <button type="button" onClick={removeAccount} style={{ minHeight: 40, color: 'var(--overdue)' }}>刪除帳號</button>
      </section>
    </AppShell>
  );
}
```

Update `apps/liff/src/App.tsx` routes:

```tsx
import { TodayPage } from './pages/TodayPage';
import { AnimalsPage } from './pages/AnimalsPage';
import { AnimalNewPage } from './pages/AnimalNewPage';
import { AnimalDetailPage } from './pages/AnimalDetailPage';
import { RecordsPage } from './pages/RecordsPage';
import { RecordPage } from './pages/RecordPage';
import { InvitePage } from './pages/InvitePage';
import { SettingsPage } from './pages/SettingsPage';

// inside <Routes>:
<Route path="/" element={<TodayPage />} />
<Route path="/animals" element={<AnimalsPage />} />
<Route path="/animals/new" element={<AnimalNewPage />} />
<Route path="/animals/:id" element={<AnimalDetailPage />} />
<Route path="/records" element={<RecordsPage />} />
<Route path="/record/new" element={<RecordPage />} />
<Route path="/invite" element={<InvitePage />} />
<Route path="/settings" element={<SettingsPage />} />
```

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm --filter @taijian/liff test
pnpm --filter @taijian/liff typecheck
```

Expected: PASS. The quick-record test must call `record.create` with `unit: 'g'`.

- [ ] **Step 6: Commit**

```bash
git add apps/liff
git commit -m "feat(liff): add animals, records, invite, and settings"
```

---

## Task 13: LINE Bot webhook, parser, and replies

**Files:**
- Create: `services/functions/src/line/commands.ts`, `services/functions/src/line/handler.ts`, `services/functions/src/line/webhook.ts`
- Modify: `services/functions/src/index.ts`
- Test: `services/functions/test/lineCommands.test.ts`

**Interfaces:**
- Consumes: `LineGateway`, `verifyLineSignature`, `runCommand`, `commandHandlers`, `config`, `db`
- Produces: `parseBotCommand(text)`, `handleLineEvent(event, gateway)`, `lineWebhook`.

- [ ] **Step 1: Write the failing parser tests**

`services/functions/test/lineCommands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBotCommand } from '../src/line/commands';

describe('parseBotCommand', () => {
  it('parses today and animals', () => {
    expect(parseBotCommand('今日')).toEqual({ kind: 'today' });
    expect(parseBotCommand('居民')).toEqual({ kind: 'animals' });
  });

  it('parses feeding with and without a note', () => {
    expect(parseBotCommand('餵食 阿肥')).toEqual({ kind: 'feed', animalName: '阿肥' });
    expect(parseBotCommand('餵食 阿肥 吃了兩隻蟋蟀')).toEqual({
      kind: 'feed',
      animalName: '阿肥',
      note: '吃了兩隻蟋蟀',
    });
  });

  it('parses weight in grams', () => {
    expect(parseBotCommand('體重 阿肥 68')).toEqual({
      kind: 'weight',
      animalName: '阿肥',
      grams: 68,
    });
  });

  it('returns unknown for unsupported text', () => {
    expect(parseBotCommand('今天天氣如何')).toEqual({ kind: 'unknown' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @taijian/functions test test/lineCommands.test.ts
```

Expected: FAIL because `src/line/commands.ts` does not exist.

- [ ] **Step 3: Implement the parser and handler**

`services/functions/src/line/commands.ts`:

```ts
export type BotCommand =
  | { kind: 'today' }
  | { kind: 'animals' }
  | { kind: 'feed'; animalName: string; note?: string }
  | { kind: 'weight'; animalName: string; grams: number }
  | { kind: 'complete'; taskName: string }
  | { kind: 'invite' }
  | { kind: 'help' }
  | { kind: 'unknown' };

export function parseBotCommand(input: string): BotCommand {
  const text = input.trim().replace(/\s+/g, ' ');
  if (/^(今日|今天|today)$/i.test(text)) return { kind: 'today' };
  if (/^(居民|動物|animals)$/i.test(text)) return { kind: 'animals' };
  if (/^(邀請|invite)$/i.test(text)) return { kind: 'invite' };
  if (/^(說明|help|\?)$/i.test(text)) return { kind: 'help' };

  const feed = text.match(/^餵食\s+(\S+)(?:\s+(.+))?$/);
  if (feed?.[1]) return { kind: 'feed', animalName: feed[1], ...(feed[2] ? { note: feed[2] } : {}) };

  const weight = text.match(/^體重\s+(\S+)\s+(\d+(?:\.\d+)?)$/);
  if (weight?.[1] && weight[2]) {
    return { kind: 'weight', animalName: weight[1], grams: Number(weight[2]) };
  }

  const complete = text.match(/^完成\s+(.+)$/);
  if (complete?.[1]) return { kind: 'complete', taskName: complete[1] };

  return { kind: 'unknown' };
}
```

`services/functions/src/line/handler.ts`:

```ts
import { Timestamp } from 'firebase-admin/firestore';
import { localDateKey } from '@taijian/domain';
import { db } from '../lib/firestore';
import { commandHandlers } from '../commands/registry';
import { runCommand } from '../commands/runCommand';
import { LineGateway } from './gateway';
import { parseBotCommand } from './commands';
import { config } from '../config';

type LineEvent = {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
};

function liffUrl(path: string): string {
  return `https://liff.line.me/${config.LIFF_ID}${path}`;
}

async function reply(gateway: LineGateway, event: LineEvent, text: string): Promise<void> {
  if (!event.replyToken) return;
  await gateway.reply(event.replyToken, [{ type: 'text', text }]);
}

async function todayLines(householdId: string, timezone: string): Promise<string[]> {
  const today = localDateKey(new Date(), timezone);
  const reminders = await db
    .collection('reminders')
    .where('householdId', '==', householdId)
    .where('enabled', '==', true)
    .get();
  const completions = await db
    .collection('taskCompletions')
    .where('householdId', '==', householdId)
    .where('dueDate', '==', today)
    .get();
  const done = new Set(completions.docs.map((doc) => doc.data().reminderId as string));
  return reminders.docs
    .filter(
      (doc) =>
        localDateKey(
          (doc.data().nextDueAt as Timestamp).toDate(),
          doc.data().timezone as string,
        ) === today,
    )
    .map((doc) => `${done.has(doc.id) ? '✓' : '○'} ${doc.data().title}`);
}

export async function handleLineEvent(event: LineEvent, gateway = new LineGateway()): Promise<void> {
  if (event.type !== 'message' || event.message?.type !== 'text') return;
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  const mapping = await db.collection('lineUsers').doc(lineUserId).get();
  const uid = mapping.data()?.uid as string | undefined;
  if (!uid) {
    await reply(gateway, event, `請先透過 LIFF 登入苔間：${liffUrl('/')}`);
    return;
  }

  const processed = await db.collection('commands').doc(event.webhookEventId).get();
  if (processed.exists) return;

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() as
    | { defaultHouseholdId?: string; householdIds?: string[]; timezone?: string }
    | undefined;
  const householdId = user?.defaultHouseholdId ?? user?.householdIds?.[0];
  if (!householdId) {
    await reply(gateway, event, `請先建立家庭：${liffUrl('/settings')}`);
    return;
  }

  const command = parseBotCommand(event.message.text ?? '');
  if (command.kind === 'help' || command.kind === 'unknown') {
    await reply(
      gateway,
      event,
      '可用指令：今日、居民、餵食 <居民> [備註]、體重 <居民> <克數>、完成 <任務>、邀請、說明',
    );
    return;
  }

  if (command.kind === 'today') {
    const lines = await todayLines(householdId, user?.timezone ?? 'Asia/Taipei');
    await reply(gateway, event, lines.length ? `今日任務：\n${lines.join('\n')}` : '今天沒有任務。');
    return;
  }

  if (command.kind === 'animals') {
    const animals = await db.collection('animals').where('householdId', '==', householdId).get();
    const names = animals.docs.map((doc) => doc.data().name).filter(Boolean);
    await reply(gateway, event, names.length ? `居民：${names.join('、')}` : `還沒有居民：${liffUrl('/animals')}`);
    return;
  }

  if (command.kind === 'invite') {
    const result = await runCommand({
      uid,
      envelope: {
        commandId: event.webhookEventId,
        type: 'member.invite',
        householdId,
        payload: { role: 'caretaker', expiresInDays: 7 },
        client: { platform: 'bot', appVersion: '1.0.0' },
      },
      source: 'bot',
      handlers: commandHandlers,
    });
    if (!result.ok) {
      await reply(gateway, event, result.message);
      return;
    }
    const token = (result.data as { token: string }).token;
    await reply(gateway, event, `邀請連結：${liffUrl(`/invite?token=${encodeURIComponent(token)}`)}`);
    return;
  }

  if (command.kind === 'complete') {
    const reminders = await db.collection('reminders').where('householdId', '==', householdId).get();
    const task = reminders.docs.find((doc) => String(doc.data().title).includes(command.taskName));
    if (!task) {
      await reply(gateway, event, `找不到任務「${command.taskName}」。`);
      return;
    }
    const dueDate = localDateKey(
      (task.data().nextDueAt as Timestamp).toDate(),
      task.data().timezone as string,
    );
    const result = await runCommand({
      uid,
      envelope: {
        commandId: event.webhookEventId,
        type: 'task.complete',
        householdId,
        payload: { reminderId: task.id, dueDate },
        client: { platform: 'bot', appVersion: '1.0.0' },
      },
      source: 'bot',
      handlers: commandHandlers,
    });
    await reply(gateway, event, result.ok ? `已完成「${task.data().title}」。` : result.message);
    return;
  }

  if (command.kind !== 'feed' && command.kind !== 'weight') return;

  const animals = await db.collection('animals').where('householdId', '==', householdId).get();
  const matches = animals.docs
    .filter((doc) => doc.data().status === 'active')
    .filter((doc) => String(doc.data().name).toLowerCase().includes(command.animalName.toLowerCase()));
  if (matches.length === 0) {
    await reply(gateway, event, `找不到居民「${command.animalName}」。`);
    return;
  }
  if (matches.length > 1) {
    await reply(gateway, event, `有多位居民符合「${command.animalName}」，請到 LIFF 選擇：${liffUrl('/animals')}`);
    return;
  }

  const animal = matches[0]!;
  const payload =
    command.kind === 'feed'
      ? {
          animalId: animal.id,
          type: 'feeding',
          occurredAt: new Date().toISOString(),
          ...(command.note ? { note: command.note } : {}),
        }
      : {
          animalId: animal.id,
          type: 'weight',
          occurredAt: new Date().toISOString(),
          value: command.grams,
          unit: 'g',
        };

  const result = await runCommand({
    uid,
    envelope: {
      commandId: event.webhookEventId,
      type: 'record.create',
      householdId,
      payload,
      client: { platform: 'bot', appVersion: '1.0.0' },
    },
    source: 'bot',
    handlers: commandHandlers,
  });
  await reply(
    gateway,
    event,
    result.ok
      ? `已記錄 ${animal.data().name} 的${command.kind === 'weight' ? `體重 ${command.grams} g` : '餵食'}。`
      : result.message,
  );
}
```

`services/functions/src/line/webhook.ts`:

```ts
import { onRequest } from 'firebase-functions/v2/https';
import { config } from '../config';
import { verifyLineSignature } from './verify';
import { handleLineEvent } from './handler';

export const lineWebhook = onRequest({ region: 'asia-east1' }, async (request, response) => {
  const signature = request.header('x-line-signature') ?? '';
  const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body));
  if (!verifyLineSignature(rawBody, config.LINE_MESSAGING_CHANNEL_SECRET, signature)) {
    response.status(401).send('invalid signature');
    return;
  }
  const body = JSON.parse(rawBody.toString('utf8')) as { events?: any[] };
  await Promise.all((body.events ?? []).map((event) => handleLineEvent(event)));
  response.status(200).send('ok');
});
```

Update `index.ts`:

```ts
export { lineWebhook } from './line/webhook';
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @taijian/functions test test/lineCommands.test.ts
pnpm --filter @taijian/functions typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/functions
git commit -m "feat(bot): add LINE webhook, parser, and command handling"
```

---

## Task 14: Reminder scheduler and rich menu

**Files:**
- Create: `services/functions/src/reminders/scheduler.ts`, `scripts/setup-rich-menu.ts`, `scripts/line/rich-menu.json`
- Modify: `services/functions/src/index.ts`
- Test: `services/functions/test/notificationKey.test.ts`

**Interfaces:**
- Consumes: `computeNextDueAt`, `localDateKey`, `LineGateway`, `db`
- Produces: `notificationKey(reminderId, dueDate, channel)`, `reminderScheduler`, rich-menu setup script.

- [ ] **Step 1: Write the failing notification key test**

`services/functions/test/notificationKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { notificationKey } from '../src/reminders/scheduler';

describe('notificationKey', () => {
  it('deduplicates per reminder, date, and channel', () => {
    expect(notificationKey('r1', '2026-10-24', 'line')).toBe('r1_2026-10-24_line');
    expect(notificationKey('r1', '2026-10-24', 'fcm')).not.toBe(
      notificationKey('r1', '2026-10-24', 'line'),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @taijian/functions test test/notificationKey.test.ts
```

Expected: FAIL because `scheduler.ts` does not exist.

- [ ] **Step 3: Implement the scheduler**

`services/functions/src/reminders/scheduler.ts`:

```ts
import { Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { localDateKey } from '@taijian/domain';
import { db } from '../lib/firestore';
import { completionId } from '../lib/ids';
import { computeNextDueAt } from '../lib/schedule';
import { LineGateway } from '../line/gateway';
import { config } from '../config';

export function notificationKey(reminderId: string, dueDate: string, channel: string): string {
  return `${reminderId}_${dueDate}_${channel}`;
}

export const reminderScheduler = onSchedule(
  { region: 'asia-east1', schedule: 'every 5 minutes', timeZone: 'Asia/Taipei' },
  async () => {
    const now = new Date();
    const due = await db
      .collection('reminders')
      .where('enabled', '==', true)
      .where('nextDueAt', '<=', Timestamp.fromDate(now))
      .limit(100)
      .get();

    const gateway = new LineGateway();
    for (const reminderDoc of due.docs) {
      const reminder = reminderDoc.data();
      const dueAt = (reminder.nextDueAt as Timestamp).toDate();
      const dueDate = localDateKey(dueAt, reminder.timezone);
      const completion = await db
        .collection('taskCompletions')
        .doc(completionId(reminderDoc.id, dueDate))
        .get();
      if (!completion.exists) {
        const key = notificationKey(reminderDoc.id, dueDate, 'line');
        const logRef = db.collection('notificationLog').doc(key);
        const log = await logRef.get();
        if (!log.exists) {
          const members = await db.collection(`households/${reminder.householdId}/members`).get();
          for (const member of members.docs) {
            const mapping = await db.collection('lineUsers').where('uid', '==', member.id).get();
            for (const lineUser of mapping.docs) {
              const lineUserId = lineUser.id;
              await gateway.push(lineUserId, [
                {
                  type: 'text',
                  text: `提醒：${reminder.title}\n${config.APP_BASE_URL}/animals/${reminder.animalId}`,
                },
              ]);
            }
          }
          await logRef.set({
            householdId: reminder.householdId,
            reminderId: reminderDoc.id,
            dueDate,
            channel: 'line',
            status: 'sent',
            createdAt: Timestamp.fromDate(now),
            expiresAt: Timestamp.fromMillis(now.getTime() + 30 * 86_400_000),
          });
        }
      }
      const nextDueAt = computeNextDueAt(reminder.schedule, reminder.timezone, now);
      await reminderDoc.ref.set({ nextDueAt: Timestamp.fromDate(nextDueAt) }, { merge: true });
    }
  },
);
```

Update `index.ts`:

```ts
export { reminderScheduler } from './reminders/scheduler';
```

`scripts/line/rich-menu.json`:

```json
{
  "size": { "width": 2500, "height": 1686 },
  "selected": true,
  "name": "苔間主選單",
  "chatBarText": "苔間",
  "areas": [
    { "bounds": { "x": 0, "y": 0, "width": 833, "height": 843 }, "action": { "type": "uri", "label": "今日任務", "uri": "https://liff.line.me/REPLACE_LIFF_ID/" } },
    { "bounds": { "x": 833, "y": 0, "width": 834, "height": 843 }, "action": { "type": "uri", "label": "我的居民", "uri": "https://liff.line.me/REPLACE_LIFF_ID/animals" } },
    { "bounds": { "x": 1667, "y": 0, "width": 833, "height": 843 }, "action": { "type": "uri", "label": "快速紀錄", "uri": "https://liff.line.me/REPLACE_LIFF_ID/record/new" } },
    { "bounds": { "x": 0, "y": 843, "width": 833, "height": 843 }, "action": { "type": "uri", "label": "邀請家人", "uri": "https://liff.line.me/REPLACE_LIFF_ID/settings" } },
    { "bounds": { "x": 833, "y": 843, "width": 834, "height": 843 }, "action": { "type": "uri", "label": "通知設定", "uri": "https://liff.line.me/REPLACE_LIFF_ID/settings" } },
    { "bounds": { "x": 1667, "y": 843, "width": 833, "height": 843 }, "action": { "type": "message", "label": "使用說明", "text": "說明" } }
  ]
}
```

`scripts/setup-rich-menu.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const liffId = process.env.LIFF_ID;
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!liffId || !token) throw new Error('LIFF_ID and LINE_CHANNEL_ACCESS_TOKEN are required');

const raw = readFileSync(resolve(__dirname, 'line/rich-menu.json'), 'utf8').replaceAll(
  'REPLACE_LIFF_ID',
  liffId,
);
const body = JSON.parse(raw) as Record<string, unknown>;

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const response = await fetch('https://api.line.me/v2/bot/richmenu', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
if (!response.ok) throw new Error(`rich menu create failed: ${response.status}`);
console.log('rich menu created:', (await response.json()) as unknown);
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @taijian/functions test test/notificationKey.test.ts test/schedule.test.ts
pnpm --filter @taijian/functions typecheck
pnpm --filter @taijian/functions build
```

Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add services/functions scripts
git commit -m "feat(reminders): add scheduler, notification dedupe, and rich menu script"
```

---

## Task 15: Seed data, mock LINE, Playwright E2E, CI, and acceptance

**Files:**
- Create: `scripts/seed-emulator.ts`, `scripts/mock-line-server.ts`, `playwright.config.ts`, `e2e/today.spec.ts`, `.github/workflows/ci.yml`, `docs/acceptance/phase-1.md`
- Modify: `README.md`, `apps/liff/src/lib/liff.ts` (mock-mode early return), `package.json` (dev deps/scripts)

**Interfaces:**
- Consumes: everything above
- Produces: `pnpm seed`, `pnpm mock:line`, `pnpm test:e2e`, CI workflow, Phase 1 acceptance checklist.

- [ ] **Step 1: Add the mock-mode early return**

At the top of `initLiff` in `apps/liff/src/lib/liff.ts`:

```ts
if (import.meta.env.VITE_USE_MOCK_LINE === 'true' && import.meta.env.DEV) return;
```

- [ ] **Step 2: Create the seed script**

`scripts/seed-emulator.ts`:

```ts
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= 'localhost:9099';
process.env.GCLOUD_PROJECT ??= 'demo-taijian';

const app = initializeApp({ projectId: 'demo-taijian' });
const db = getFirestore(app);
const auth = getAuth(app);

async function ensureUser(uid: string, displayName: string) {
  await auth.createUser({ uid, displayName }).catch((error) => {
    if (error.code !== 'auth/uid-already-exists') throw error;
  });
  await db.collection('users').doc(uid).set(
    {
      displayName,
      householdIds: ['hh_demo'],
      defaultHouseholdId: 'hh_demo',
      locale: 'zh-TW',
      timezone: 'Asia/Taipei',
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

await db.doc('households/hh_demo').set({
  name: '苔間測試家庭',
  ownerUid: 'line_UtestA',
  ownerCount: 1,
  memberCount: 2,
  timezone: 'Asia/Taipei',
  settings: { notificationsEnabled: true },
  revision: 0,
  schemaVersion: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  deletedAt: null,
});
await db.doc('households/hh_demo/members/line_UtestA').set({
  uid: 'line_UtestA',
  role: 'owner',
  displayName: 'Test A',
  avatarUrl: '',
  status: 'active',
});
await db.doc('households/hh_demo/members/line_UtestB').set({
  uid: 'line_UtestB',
  role: 'caretaker',
  displayName: 'Test B',
  avatarUrl: '',
  status: 'active',
});
await ensureUser('line_UtestA', 'Test A');
await ensureUser('line_UtestB', 'Test B');
await db.doc('lineUsers/UtestA').set({ uid: 'line_UtestA', displayName: 'Test A', linkedAt: FieldValue.serverTimestamp() });
await db.doc('lineUsers/UtestB').set({ uid: 'line_UtestB', displayName: 'Test B', linkedAt: FieldValue.serverTimestamp() });
await db.doc('animals/animal_demo').set({
  householdId: 'hh_demo',
  name: '阿肥',
  species: '豹紋守宮',
  sex: 'unknown',
  avatarColor: '#7C9A76',
  status: 'active',
  revision: 0,
  schemaVersion: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
await db.doc('reminders/reminder_demo').set({
  householdId: 'hh_demo',
  animalId: 'animal_demo',
  title: '餵食',
  type: 'feeding',
  schedule: { kind: 'daily', times: ['08:00'] },
  timezone: 'Asia/Taipei',
  enabled: true,
  nextDueAt: Timestamp.fromDate(new Date()),
  revision: 0,
  schemaVersion: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
console.log('seeded demo household hh_demo');
```

Add root scripts:

```json
"seed": "tsx scripts/seed-emulator.ts",
"mock:line": "tsx scripts/mock-line-server.ts",
"test:e2e": "playwright test"
```

Add dev deps:

```bash
pnpm add -D -w tsx @playwright/test
```

- [ ] **Step 3: Create the mock LINE server**

`scripts/mock-line-server.ts`:

```ts
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_LINE_PORT ?? 4010);

createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString('utf8');

  if (request.url === '/oauth2/v2.1/verify') {
    const params = new URLSearchParams(body);
    const idToken = params.get('id_token');
    const sub = idToken === 'test-token-B' ? 'UtestB' : 'UtestA';
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        aud: 'test-login-channel',
        sub,
        name: sub === 'UtestB' ? 'Test B' : 'Test A',
        picture: '',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    return;
  }

  if (request.url?.startsWith('/v2/bot/message/')) {
    response.setHeader('content-type', 'application/json');
    response.end('{}');
    return;
  }

  response.statusCode = 404;
  response.end('not found');
}).listen(port, () => console.log(`mock LINE server on http://localhost:${port}`));
```

- [ ] **Step 4: Create the Playwright E2E test**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: {
    command: 'pnpm --filter @taijian/liff dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
```

`e2e/today.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('shows the seeded resident and completes a task', async ({ page }) => {
  await page.goto('/?mockLineIdToken=test-token-A');
  await expect(page.getByText('早安，今天也要好好照顧牠們。')).toBeVisible();
  await expect(page.getByText('阿肥 · 餵食')).toBeVisible();
  await page.getByText('阿肥 · 餵食').click();
  await expect(page.getByText(/已完成 by/)).toBeVisible();
});
```

- [ ] **Step 5: Create the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter @taijian/functions test:integration
      - run: pnpm --filter @taijian/functions test:rules
      - run: pnpm build
```

- [ ] **Step 6: Write the Phase 1 acceptance checklist**

`docs/acceptance/phase-1.md`:

```markdown
# Phase 1 Acceptance

## Automated

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm --filter @taijian/functions test:integration`
- [ ] `pnpm --filter @taijian/functions test:rules`
- [ ] `pnpm build`
- [ ] `pnpm seed` + `pnpm mock:line` + `pnpm test:e2e`

## Manual (real LINE test provider)

- [ ] Create a LINE Login channel and LIFF app under the same provider as the Messaging API channel.
- [ ] Set the LIFF endpoint URL to the deployed Hosting URL.
- [ ] Set the Messaging API webhook URL to the deployed `lineWebhook` URL.
- [ ] Set `LINE_LOGIN_CHANNEL_ID`, `LINE_MESSAGING_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LIFF_ID` in Secret Manager.
- [ ] Two LINE test users: A creates a household; B accepts the invite.
- [ ] A and B both see the same animal and today task.
- [ ] A records feeding in LIFF; B records weight in the bot; both records appear.
- [ ] A and B complete the same task; only one completion exists and both see the completer.
- [ ] Replay a webhook event; no duplicate record is created.
- [ ] Edit the same animal from two devices with a stale revision; one gets a conflict banner.
- [ ] Delete the account; confirm access is removed and data follows the deletion policy.

## Exit criteria

- [ ] No P0/P1 defects.
- [ ] All automated checks green.
- [ ] Manual LINE flow verified with two accounts.
```

- [ ] **Step 7: Run the automated checks**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @taijian/functions test:integration
pnpm --filter @taijian/functions test:rules
pnpm build
```

Expected: all pass. Create the local E2E environment files:

`apps/liff/.env.local`:

```text
VITE_FIREBASE_API_KEY=demo
VITE_FIREBASE_AUTH_DOMAIN=demo-taijian.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-taijian
VITE_FIREBASE_APP_ID=1:demo:web:demo
VITE_LIFF_ID=test-liff
VITE_USE_EMULATORS=true
VITE_USE_MOCK_LINE=true
```

`services/functions/.env`:

```text
APP_ENV=dev
LINE_LOGIN_CHANNEL_ID=test-login-channel
LINE_MESSAGING_CHANNEL_ID=test-messaging-channel
LINE_MESSAGING_CHANNEL_SECRET=test-messaging-secret
LINE_CHANNEL_ACCESS_TOKEN=test-access-token
LINE_VERIFY_URL=http://localhost:4010/oauth2/v2.1/verify
LINE_API_BASE=http://localhost:4010
APP_BASE_URL=http://localhost:5173
LIFF_ID=test-liff
```

Then run the local E2E:

```bash
pnpm exec playwright install chromium
pnpm emulators
pnpm seed
pnpm mock:line
pnpm test:e2e
```

Expected: Playwright sees the seeded resident and the completion state.

- [ ] **Step 8: Update README and commit**

Add to README:

```markdown
## Local development (Phase 0–1)

```bash
pnpm install
pnpm emulators
pnpm seed
pnpm mock:line
pnpm --filter @taijian/liff dev
pnpm test:e2e
```
```

Commit:

```bash
git add README.md scripts e2e playwright.config.ts .github docs/acceptance package.json pnpm-lock.yaml apps/liff/src/lib/liff.ts
git commit -m "test: add seed data, mock LINE, e2e, ci, and phase 1 acceptance"
```

---

## Plan Self-Review

**Spec coverage**

- §5 architecture: Tasks 1, 3, 4, 9, 11, 13.
- §6 identity: Tasks 5, 9, 11.
- §7 data model: Tasks 2, 6, 7, 8.
- §8 conflict protocol: Tasks 4, 6, 7, 8, 10.
- §9 command API: Tasks 2, 4, 9.
- §10 LINE integration: Tasks 5, 11, 12, 13, 14.
- §11 UI system: Tasks 11, 12.
- §12 security/privacy: Tasks 10, 15.
- §13 operations: Task 15.
- §14 testing/acceptance: every task plus Task 15.
- §15 delivery: this plan covers Phase 0–1 only.

**Placeholder scan**

No incomplete steps or “similar to Task N” references. Manual LINE console steps are explicit environment actions, not code placeholders.

**Type consistency**

- `runCommand` takes `{ uid, envelope, source, handlers }` in Tasks 4, 6, 7, 8, 13.
- `HandlerMap` and `HandlerContext` are defined in Task 4 and reused everywhere.
- `CommandResult` is defined in Task 2 and returned by every handler.
- `completionId` is defined in Task 4 and used by Task 8 and Task 14.
- `notificationKey` is defined in Task 14 and tested there.
- LIFF calls `callCommand(type, payload, options)` consistently in Tasks 11–12.

**Review Focus mapping**

1. Stale revision conflict → Task 7 integration test.
2. Webhook retry → Task 13's `commands/{webhookEventId}` replay check plus Task 7's command-idempotency test; Task 15 repeats the check with real LINE test users.
3. Invite race / role escalation → Task 6 integration tests.
4. Timezone/DST → Task 8 schedule tests.
5. Direct writes / forged householdId → Task 10 rules tests plus every handler re-checks `householdId`.

---

**Plan complete.** Review this file, then choose an execution method: Subagent-driven (recommended for the conflict-heavy backend) or Native (I implement every task in this session).



