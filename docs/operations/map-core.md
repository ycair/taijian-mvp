# Map core operations

## Migration

`20261027100000_map_core` adds `map_zones` and `animal_positions`, RLS read
policies, and command-only writes.

## Commands

- `map.ensureDefaults`
- `map.zone.create`
- `map.zone.update`
- `map.zone.delete`
- `map.move`

## Client

- `/map` route from the Residents care card.
- Default zones are seeded once per household.
- Positions are normalized 0..1 and shared across household members.
- Active residents only; memorial residents do not appear.
- Local drag is optimistic; save failure shows a snackbar and leaves the local
  position until the next reload.

## Deferred

Zone resize/rotate, background images, pan/zoom, LIFF map, and Realtime drag.
