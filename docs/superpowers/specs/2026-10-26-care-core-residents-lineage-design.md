# Care Core 2A — Residents, Lineage, Memorial, Transfer

**Status:** Draft for review  
**Date:** 2026-10-26  
**Program:** iOS full parity; LIFF/Bot core  
**Depends on:** Foundation Identity (merged in PR #14)

## 1. Goal

Bring the resident model and resident-management flows closer to the original
app without copying its pixel art, sprites, or copy:

- species catalog and richer resident profile
- parent/offspring lineage
- memorial state
- transfer between the user's own households and to another user
- local groups, sorting, search, and a free avatar color/pattern editor

This spec does not implement records analytics, reminders/notifications, photos,
map/dens, points, or Widgets.

## 2. Decisions

- iOS gets the full 2A UI. LIFF/Bot keep the existing basic resident list and
  quick-record core; no lineage, memorial, or transfer administration there.
- Lineage edges are preserved across transfers. A user sees details only for
  residents they can access; an inaccessible relative is rendered as
  **「已轉讓／不可存取」** with no name, household, or profile data.
- Memorial is irreversible. It removes the resident from Today/reminders and makes
  records read-only; it cannot be transferred.
- Transfer to the user's own household is immediate. Transfer to another user is
  a pending request that the target must accept in-app.
- The target must be an **owner** of the destination household.
- The existing warm, hand-drawn 苔間 visual language is used for every new screen.
  No original sprites, pixel maps, names, or artwork are copied.
- Groups and sort order are local per-device preferences, matching the original
  `UserListPrefs` behavior. They are not synced across devices.
- Avatar color/pattern editing is free in 2A. A points cost can be added later
  with the shop/points subsystem.

## 3. Non-goals

- Photos, photo albums, journal, media upload.
- Pixel sprite editor or copied species sprites.
- Map, dens, zones, movable residents.
- Push notifications, Widgets, Share Extension.
- Points cost for color edits.
- Global species submission/moderation UI.
- Animal transfer by public link; UID targets only in 2A.

## 4. Data model

### 4.1 Species catalog

Global read-only catalog:

```sql
create table public.species (
  id text primary key,
  name text not null,
  kingdom text not null,
  category text not null,
  default_color text not null default '#7C9A76',
  default_pattern text not null default 'solid',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

Seed common species and preserve existing `animals.species` values such as
`leopard-gecko` and `other`. `animals.species` remains the catalog id; no FK is
added in 2A because existing/free-text data must survive.

### 4.2 Animal fields

Add:

```sql
alter table public.animals
  add column avatar_pattern text not null default 'solid',
  add column memorial_at timestamptz,
  add column memorial_note text;
```

Existing `status` already supports `memorial`; `memorial_at` records when the
transition happened. No photo columns in 2A.

### 4.3 Lineage

```sql
create table public.animal_lineage (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.animals(id) on delete cascade,
  child_id uuid not null references public.animals(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);
create index animal_lineage_parent_idx on public.animal_lineage(parent_id);
create index animal_lineage_child_idx on public.animal_lineage(child_id);
```

Rules:

- A resident may have at most two parents.
- New edges require both residents to be accessible in the same household.
- Reject cycles, self-links, memorial residents, and duplicates.
- Edges are **not** deleted on transfer. Cross-household edges remain stored.
- Removing an edge is allowed for an owner of either accessible endpoint; audit
  the removal. The inaccessible side is never revealed.

### 4.4 Transfers

```sql
create table public.animal_transfers (
  id uuid primary key default gen_random_uuid(),
  source_household_id uuid not null references public.households(id),
  target_user_id uuid references public.profiles(id),
  target_household_id uuid references public.households(id),
  animal_ids uuid[] not null,
  transfer_type text not null check (transfer_type in ('own','other')),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null
);
create index animal_transfers_target_idx on public.animal_transfers(target_user_id, status);
create index animal_transfers_source_idx on public.animal_transfers(source_household_id, status);
```

- `own`: `target_household_id` is set at creation and status is immediately
  `accepted`; no target acceptance.
- `other`: `target_user_id` is set, `target_household_id` is chosen by the target
  when accepting.
- Pending transfers expire after 7 days; acceptance marks expired rows and fails
  with `TRANSFER_EXPIRED`.
- The command locks the transfer row and all selected animals before moving data.

## 5. Lineage privacy

Raw lineage/transfer tables are server-only. Clients use security-definer RPCs:

```sql
public.lineage_for_animal(p_animal_id uuid)
  returns table (
    edge_id uuid,
    relation text,        -- 'parent' | 'child'
    accessible boolean,
    animal_id uuid,       -- null when inaccessible
    name text,            -- null when inaccessible
    species_label text,   -- null when inaccessible
    avatar_color text,    -- null when inaccessible
    status text           -- null when inaccessible
  )
```

- The function first verifies the caller can access `p_animal_id` through
  household membership.
- For each direct edge, if the other resident is accessible, return its summary.
- If the other resident is inaccessible, return `accessible=false` and no
  name/household/profile fields. The client renders a neutral placeholder and
  does not offer navigation.
- Recursive tree expansion is client-side and limited to accessible nodes. The
  first inaccessible node stops that branch.
- The function must not expose households, UIDs, or records of inaccessible
  residents.

`public.list_animal_transfers()` returns incoming and outgoing rows for the
caller, with animal names only when the caller can access the source or is the
target (pending incoming). No transfer token or target household data is exposed
to unrelated users.

## 6. Memorial

`animal.memorialize`:

- Owner-only.
- Sets `status='memorial'`, `memorial_at=now()`, optional `memorial_note`.
- Disables all reminders for the resident.
- Removes the resident from Today and active lists.
- Makes records/read-only; no new quick records or reminders.
- Keeps lineage edges; relatives can still see the memorial resident if they are
  household members.
- Blocks transfer.
- Irreversible in 2A (matching the original copy: 「移至紀念館，無法復原」).

A dedicated memorial section displays memorial residents with a subdued style.

## 7. Transfer flows

### Own-household transfer

1. Owner selects one or more active, non-memorial residents.
2. Owner selects another household they own.
3. Server locks residents, updates household ids, increments revisions, writes
   audit rows, and marks the transfer accepted.
4. Lineage edges remain; only accessible residents are shown in each household.

### Other-user transfer

1. Owner selects residents and enters the target user's UID.
2. Server validates the target is an active profile and creates a pending
   transfer for 7 days.
3. Target sees the request in the in-app transfer inbox (no push in 2A).
4. Target selects a destination household they own and accepts.
5. Server atomically moves:
   - `animals.household_id`
   - `records.household_id`
   - `reminders.household_id`
   - `task_completions.household_id`
   - increments animal revisions
   - writes source and target audit rows
6. Target may decline; source may cancel. Expired requests cannot be accepted.

Validation:

- Source must own the source household.
- Target must own the destination household.
- Memorial/archived residents cannot be transferred.
- All animals must still be in the source household at acceptance.
- A target cannot be the source user for an `other` transfer.
- A transfer cannot include an animal already in another pending transfer.
- Empty or duplicate animal lists are rejected.

## 8. Commands and RPCs

Extend `execute-command` with:

| Command | Permission | Notes |
|---|---|---|
| `animal.update` | owner | Profile fields, species, morph, dates, notes, avatar color/pattern, baseRevision |
| `animal.memorialize` | owner | Irreversible; disables reminders |
| `lineage.add` | owner | Same household, max 2 parents, no cycles |
| `lineage.remove` | owner of either endpoint | Removes edge only |
| `transfer.create` | owner | own or other; active non-memorial residents |
| `transfer.accept` | target | destination household owned by target |
| `transfer.decline` | target | pending only |
| `transfer.cancel` | source owner | pending only |

Read RPCs:

- `species` via PostgREST (`select`).
- `lineage_for_animal(animal_id)`.
- `list_animal_transfers()`.

All writes use `commandId` idempotency and the existing session/profile checks.
Transfer commands lock rows and use a transaction; no partial moves.

## 9. UI

### Animals list

- Search by name/species.
- Group tabs and edit groups.
- Drag reorder (local preferences).
- Memorial section/entry.
- Pending transfer badge on the active resident or a Settings inbox.

### Resident detail

Tabs or sections:

- **Overview**: species, morph, sex, dates, notes, color/pattern.
- **Records**: existing records UI, read-only for memorial.
- **Reminders**: existing reminders UI; disabled for memorial.
- **Lineage**: parent/offspring graph with accessible cards and unavailable
  placeholders.

Owner-only actions:

- edit profile/color/pattern
- add/remove lineage
- memorialize
- transfer

Caretakers: view all; no identity/lineage/memorial/transfer mutations.

### Species picker

Searchable catalog grouped by kingdom/category; selecting a species sets the
default color/pattern but the owner can override.

### Color/pattern editor

Original hand-drawn palette picker with a few patterns
(`solid`, `spots`, `stripes`, `gradient`). No pixel sprites or original artwork.
Free in 2A; point cost can be attached later.

### Transfer UI

- Owner: select residents, choose own household or enter target UID, confirm.
- Target: incoming request card → choose owned household → accept/decline.
- Source: pending transfer can be cancelled.
- Show expiry and audit-friendly status; no push notification in 2A.

## 10. Platform scope

- **iOS**: full 2A.
- **LIFF**: existing basic resident list and quick record; lineage, memorial, and
  transfer are read-only/not exposed. If a resident is memorial, show a subdued
  label and disable record/reminder actions.
- **LINE Bot**: existing residents/quick records; no lineage/transfer management.

## 11. RLS and security

- `species`: authenticated SELECT only; writes service role.
- `animal_lineage`, `animal_transfers`: RLS enabled, no client policies; service
  role only. Clients use the RPCs above.
- `lineage_for_animal`/`list_animal_transfers`: security definer, explicit
  `auth.uid()` membership checks, grant only to authenticated.
- Transfer target UID lookup must not expose a general user search API.
- All destructive actions require owner membership; audit `auth` actor and
  household.
- Rate-limit transfer create/accept through the existing command rate limits.
- No records/photos/UIDs of inaccessible residents are returned.
- No token or secret is logged.

## 12. Migration

1. Add `species` + seed common species.
2. Add animal columns and backfill `avatar_pattern='solid'`.
3. Add lineage/transfer tables, indexes, RLS, grants, RPCs.
4. Existing animals and records remain untouched.
5. No destructive changes; `animals.status` values remain compatible.

## 13. Testing and acceptance

### Automated

- Species seed/read.
- Animal update revision and owner-only checks.
- Memorial transition: reminders disabled, Today excludes, records read-only,
  transfer rejected, lineage remains.
- Lineage: max 2 parents, no cycles/self/duplicate, cross-household denial,
  inaccessible placeholder, transfer preserves edge.
- Own transfer moves all data; source loses access; target gains.
- Other transfer pending/accept/decline/cancel/expire; atomicity; target owner
  requirement; memorial block.
- RLS: client cannot read raw lineage/transfer tables; unrelated user cannot see
  names of inaccessible relatives.
- Widget tests: list search/groups/reorder, species picker, lineage placeholder,
  memorial state, transfer inbox.
- Physical iPhone: create resident, edit species/color, add lineage, memorialize,
  transfer between own households, transfer to another account.

### Acceptance criteria

- A resident can be fully edited with species, morph, sex, dates, notes, and
  color/pattern.
- Parent/offspring links are visible and protected across households.
- Memorial residents disappear from active care and cannot be transferred.
- Own-household and other-user transfers move the resident and care data
  atomically; audit records exist.
- Groups/sort/search work on iOS.
- LIFF/Bot basic resident flows still work.
- No original pixel assets, sprites, or copy are used.

## 14. Risks / open items

- Cross-household lineage is privacy-sensitive; RPC tests are mandatory.
- Animal transfer moves records/reminders; volume can be large. Use one
  transaction and revision increments; no partial move.
- Local groups/order do not sync across devices; this matches the original local
  preference model.
- Species catalog completeness is a content task; seed a useful demo set and add
  more later.
- No push notification for pending transfers in 2A; the target sees them on app
  open.

## 15. Roadmap

1. 2A Residents, lineage, memorial, transfer (this spec)
2. 2B Records and analytics
3. 2C Reminders and local notifications
4. Journal/media
5. Map/dens
6. Proposals
7. Shop/points/subscription
8. Release polish
