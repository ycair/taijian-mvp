# Care Core 2A — Residents, Lineage, Memorial, Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the resident-depth 2A surface: richer animal profiles, species catalog, lineage, memorial, transfer, groups/sort/search, and avatar color/pattern editing on iOS, while keeping LIFF/Bot basic resident flows intact.

**Architecture:** Extend the existing Supabase Postgres schema and command API. All mutations remain server-authoritative via `execute-command`; lineage and transfer reads use security-definer RPCs so inaccessible relatives reveal only a placeholder. iOS reads remain through the existing `ReadStore`/Riverpod providers; new write flows use `AnimalRepository` and small focused repositories. Groups/order are local preferences.

**Tech Stack:** Supabase Postgres/RLS/security-definer RPCs, Deno Edge Functions, Flutter 3.47, Dart 3.13, Riverpod, Drift/outbox, `shared_preferences`, existing Direction B UI.

**Spec:** `docs/superpowers/specs/2026-10-26-care-core-residents-lineage-design.md`

## Global Constraints

- iOS full 2A; LIFF/Bot keep basic resident read/quick-record behavior.
- No photos/media, pixel sprites, map/dens, points cost, push, or Widgets in 2A.
- Owner-only: profile identity fields, lineage edits, memorial, transfer.
- Caretaker: view residents, records, reminders; no lineage/memorial/transfer mutations.
- Lineage edges are preserved across transfers; inaccessible relatives show a neutral placeholder with no names/household/UID.
- Memorial is irreversible; reminders disabled; records read-only; transfer blocked.
- Groups/order are local per user+household; no server sync.
- All writes use `commandId` idempotency, revision checks, and audit logs.
- Existing animals/records/reminders must survive migration.
- No Apple paid-team dependency.

## Review Focus

- Lineage privacy across households after a transfer.
- Transfer atomicity: no half-moved resident/records/reminders.
- Memorial interactions with Today and reminder scheduling.
- Owner-only enforcement and target-household ownership.
- Local list preferences behavior on account/household switch.
- Existing LIFF/Bot resident flows stay compatible.

---

### Task 1: Schema, RLS, RPCs, species seed

**Files:**
- Create: `supabase/migrations/20261026120000_care_core_residents.sql`
- Create: `supabase/tests/care_core_residents.sql`
- Modify: `supabase/seed.sql` only for local species if not in migration

**Interfaces:**
- `species(id, name, kingdom, category, default_color, default_pattern, sort_order, active)`
- `animals.avatar_pattern`, `memorial_at`, `memorial_note`
- `animal_lineage(parent_id, child_id, created_by, created_at)`
- `animal_transfers(...)`
- RPCs: `lineage_for_animal(uuid)`, `list_animal_transfers()`

- [ ] Write SQL assertions for new tables/columns, constraints, RLS, and seeded species.
- [ ] Run `psql "$LOCAL_DB_URL" -f supabase/tests/care_core_residents.sql`; expect missing table/column failures.
- [ ] Add migration:
  - create `species`; seed at least: leopard-gecko, corn-snake, green-horned-frog, bearded-dragon, crested-gecko, other.
  - add animal columns with `avatar_pattern='solid'`, memorial nulls.
  - create lineage/transfer tables/indexes.
  - enable RLS; revoke client access from lineage/transfers; grant authenticated read on species.
  - create `lineage_for_animal` and `list_animal_transfers` security-definer RPCs with explicit `auth.uid()` membership checks.
- [ ] Apply locally with `pnpm exec supabase db reset`; run SQL assertions; expect pass.
- [ ] Run `pnpm exec supabase db advisors --local`; fix new actionable findings.
- [ ] Commit.

### Task 2: Animal/species read models and profile updates

**Files:**
- Modify: `apps/mobile/lib/core/models/models.dart`
- Modify: `apps/mobile/lib/data/supabase/supabase_mappers.dart`
- Modify: `apps/mobile/lib/data/supabase/supabase_read_store.dart`
- Create: `apps/mobile/lib/features/species/species_repository.dart`
- Modify: `apps/mobile/lib/features/animals/animal_repository.dart`
- Modify: `apps/mobile/lib/features/animals/new_animal_screen.dart`
- Modify: `apps/mobile/lib/features/animals/animal_detail_screen.dart`
- Test: `apps/mobile/test/data/supabase_mappers_test.dart`
- Test: `apps/mobile/test/features/animal_profile_test.dart`

**Interfaces:**
- `Animal` gains `avatarPattern`, `memorialAt`, `memorialNote`; `copyWith` extends accordingly.
- `Species { id, name, kingdom, category, defaultColor, defaultPattern }`.
- `SpeciesRepository.watchAll()`.
- `AnimalRepository.update` supports species/speciesLabel/sex/birthDate/adoptionDate/notes/avatarColor/avatarPattern.
- `animal.update` server command checks owner role, baseRevision, updates `last_changed_fields` and audit.

- [ ] Write failing mapper tests for `avatar_pattern`, `memorial_at`, `memorial_note`.
- [ ] Write failing repository tests using fake command API for update payload/revision.
- [ ] Implement model/mappers/read store/species repository.
- [ ] Extend `animal.update` in `execute-command` (owner-only; validate dates/species/pattern; revision conflict).
- [ ] Add species picker sheet and editable profile UI using Direction B components.
- [ ] Run `flutter test` and `deno test`; expect pass.
- [ ] Commit.

### Task 3: Lineage backend and RPC

**Files:**
- Create: `supabase/functions/_shared/care_core.ts`
- Modify: `supabase/functions/execute-command/index.ts`
- Test: `supabase/functions/tests/lineage_test.ts`
- Test: `supabase/tests/lineage_rpc.sql`

**Interfaces:**
- `lineage.add {parentId, childId, animalId}` owner-only; both endpoints same household at creation; max 2 parents; no self/cycle/duplicate.
- `lineage.remove {edgeId, animalId}` owner of either accessible endpoint.
- RPC `lineage_for_animal` returns relation/accessibility/safe summary only.
- Audit `lineage.add`, `lineage.remove`.

- [ ] Write failing service tests for max-two-parents, cycle, self, duplicate, caretaker denial, and cross-household placeholder.
- [ ] Implement backend handlers with a locked transaction (`select ... for update`).
- [ ] Add `lineage_for_animal` RPC and SQL privacy assertions.
- [ ] Implement Dart `LineageEdge`/`LineageNode` models and a `LineageRepository` using REST RPC.
- [ ] Add lineage tab UI (accessible cards + unavailable placeholder); no navigation for unavailable nodes.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 4: Memorial

**Files:**
- Modify: `supabase/functions/execute-command/index.ts`
- Modify: `apps/mobile/lib/features/animals/animal_repository.dart`
- Modify: `apps/mobile/lib/features/animals/animal_detail_screen.dart`
- Modify: `apps/mobile/lib/features/animals/animals_screen.dart`
- Test: `supabase/functions/tests/memorial_test.ts`
- Test: `apps/mobile/test/features/memorial_test.dart`

**Interfaces:**
- `animal.memorialize {animalId, note?, baseRevision}` owner-only.
- Sets `status='memorial'`, `memorial_at`, `memorial_note`; disables reminders.
- `record.create`/`reminder.create` reject memorial animals.
- Today/active providers exclude memorial; memorial section lists them.
- Transfer rejects memorial.

- [ ] Write failing backend tests for owner-only, reminder disable, record/reminder rejection, transfer rejection.
- [ ] Implement transaction and UI confirmation/irreversible copy.
- [ ] Write widget tests for memorial section and disabled actions.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 5: Transfer backend

**Files:**
- Modify: `supabase/functions/execute-command/index.ts`
- Modify: `supabase/functions/_shared/care_core.ts`
- Test: `supabase/functions/tests/transfers_test.ts`
- Test: `supabase/tests/transfers_rpc.sql`

**Interfaces:**
- `transfer.create {animalIds, transferType, targetHouseholdId? targetUserId?}` source owner.
- `transfer.accept {transferId, targetHouseholdId}` target user/owner.
- `transfer.decline {transferId}`, `transfer.cancel {transferId}`.
- `list_animal_transfers()` RPC.
- Move `animals/records/reminders/task_completions` household ids atomically; increment animal revisions; preserve lineage; audit source and target.

- [ ] Write failing tests for:
  - own-household immediate transfer
  - other-user create → accept
  - decline/cancel/expiry
  - target must be destination owner
  - memorial/archived block
  - already-pending animal block
  - atomic data move and source/target access
- [ ] Implement transfer transaction with row locks and validation.
- [ ] Implement RPC list; no names for unrelated users.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 6: Transfer UI and inbox

**Files:**
- Create: `apps/mobile/lib/features/animals/transfer_screen.dart`
- Create: `apps/mobile/lib/features/animals/transfer_inbox.dart`
- Modify: `apps/mobile/lib/features/animals/animal_detail_screen.dart`
- Modify: `apps/mobile/lib/features/animals/animal_repository.dart`
- Modify: `apps/mobile/lib/features/settings/settings_screen.dart`
- Test: `apps/mobile/test/features/transfer_ui_test.dart`

**Interfaces:**
- Transfer action sheet: own household vs target UID.
- Target inbox: choose owned household, accept/decline.
- Source pending transfer: cancel.
- Display expiry/status; no push.

- [ ] Write failing widget tests for owner transfer form, target accept, decline/cancel, expired state.
- [ ] Implement UI with existing components; owner-only.
- [ ] Add pending badge/inbox entry.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 7: Local groups, ordering, search, color/pattern

**Files:**
- Modify: `apps/mobile/pubspec.yaml` (`shared_preferences`)
- Create: `apps/mobile/lib/features/animals/animal_list_prefs.dart`
- Modify: `apps/mobile/lib/features/animals/animals_screen.dart`
- Modify: `apps/mobile/lib/features/animals/new_animal_screen.dart`
- Modify: `apps/mobile/lib/features/animals/animal_detail_screen.dart`
- Test: `apps/mobile/test/features/animal_list_prefs_test.dart`
- Test: `apps/mobile/test/features/animals_list_ui_test.dart`

**Interfaces:**
- `AnimalListPrefsStore` keyed by `uid:householdId`, storing groups, animal→group, order.
- Search local by name/species.
- Group tabs + edit sheet + drag reorder.
- Avatar patterns `solid|spots|stripes|gradient`; owner editor; free.

- [ ] Write failing tests for prefs persistence, account/household isolation, search, reorder.
- [ ] Implement prefs store and UI.
- [ ] Add pattern palette UI; no pixel assets.
- [ ] Run tests; expect pass.
- [ ] Commit.

### Task 8: LIFF compatibility and memorial read-only

**Files:**
- Modify: `apps/liff-sb/src/lib/types.ts`
- Modify: `apps/liff-sb/src/pages/AnimalsPage.tsx`
- Modify: `apps/liff-sb/src/pages/AnimalDetailPage.tsx`
- Test: `apps/liff-sb/src/lib/residents.test.ts`

**Interfaces:**
- LIFF animal summary shows memorial/status.
- Memorial animals cannot quick-record or create reminders.
- No lineage/transfer/memorial management in LIFF.

- [ ] Write failing tests for memorial action gating/read-only.
- [ ] Implement minimal type/UI changes.
- [ ] Run LIFF tests/typecheck/build.
- [ ] Commit.

### Task 9: Integration and device verification

- [ ] Reset local Supabase; apply all migrations; seed species.
- [ ] Run Deno lineage/memorial/transfer tests and SQL RPC tests.
- [ ] Run `flutter analyze`, full Flutter tests, LIFF tests, root lint/typecheck/build.
- [ ] Build iOS Profile with current cloud defines; install on paired iPhone.
- [ ] On device:
  - create resident; change species/morph/sex/dates/color/pattern
  - add two parents, verify max/cycle errors
  - memorialize; verify Today/record/reminder/transfer behavior
  - transfer between own households
  - create transfer to a second account; accept with a destination household; verify source/target access and lineage placeholder
  - group/search/reorder
- [ ] Run cloud advisors; check no new security findings.
- [ ] Open PR; CI green; present screenshots/return values.

## Out of scope / deferred

- Photos/media, journal, map/dens, points cost, push, Widgets, Share Extension.
- Public transfer links and account merge.
- Admin species moderation UI.
- Apple/TestFlight/App Store.

## Execution recommendation

Use **native execution**: lineage privacy, transfer atomicity, and UI state share a single schema/command contract; splitting across agents risks inconsistent access rules. Add one fresh whole-branch reviewer after device verification.
