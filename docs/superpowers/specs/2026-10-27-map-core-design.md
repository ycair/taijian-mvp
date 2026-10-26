# Map / Dens 4A — Shared Household Map

**Status:** Implementation draft
**Date:** 2026-10-27

## Goal

Give each household a shared, warm hand-drawn map where residents can be
placed in named zones. The map is a care-planning and visual memory surface, not
a pixel-art copy of the original app.

## Scope

- One map per household.
- Four default zones: 苔庭, 水盆, 躲藏, 曬台.
- Add and delete zones; deleting a zone returns its residents to free positions.
- Drag active residents; positions are normalized (0..1) and shared through
  `execute-command`.
- Memorial/archived residents do not appear on the map.
- iOS full; LIFF/Bot unchanged.
- No custom background upload, pixel sprites, rotations, or multi-map support.

## Data

### `map_zones`

- id, household_id, name, x/y/w/h (normalized), color, sort_order, revision,
  created_by/updated_by, timestamps, deleted_at.
- RLS: household members select; writes are command-only.
- Zone delete is soft delete and clears `animal_positions.zone_id`.

### `animal_positions`

- animal_id primary key, household_id, optional zone_id, normalized x/y,
  updated_by/updated_at.
- RLS: household members select; writes are command-only.
- Last write wins; positions do not carry a user-editable revision.

## Commands

| Command | Permission | Notes |
|---|---|---|
| `map.ensureDefaults` | member | Seeds default zones only when the household has none. |
| `map.zone.create` | member | name + bounded normalized rectangle + color. |
| `map.zone.update` | member | revision check; name/bounds/color. |
| `map.zone.delete` | member | revision check; soft delete, clear position zone. |
| `map.move` | member | active resident, x/y in 0..1, upsert. |

## UI

- `/map` route, opened from the Residents care card.
- `CustomPainter` background and zone cards; no external artwork.
- Dragging updates local position immediately and saves on pan end.
- Long-press zone to delete; app-bar add zone with default placement.
- Tap resident avatar -> resident detail is a later enhancement.

## Deferred

- Zone resize/rotate, map background images, zoom/pan, multi-floor maps.
- Real-time shared drag (Realtime subscription).
- LIFF map.
