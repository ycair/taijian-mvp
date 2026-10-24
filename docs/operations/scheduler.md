# Reminder scheduler runbook

`reminderScheduler` (`services/functions/src/reminders/scheduler.ts`) runs every
5 minutes in `asia-east1`, timezone `Asia/Taipei`, with a 120s timeout. Each
tick reads up to 100 reminders whose `enabled == true` and `nextDueAt <= now`
and delivers at most one LINE push per reminder occurrence.

## Expected document state

| Collection                                    | Field                   | Meaning                                                               |
| --------------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `notificationLog/{reminderId}_{dueDate}_line` | `status: pending`       | Claimed by a run before the push; normally replaced within seconds    |
|                                               | `status: sent`          | At least one push succeeded                                           |
|                                               | `status: partial`       | Some recipients failed                                                |
|                                               | `status: failed`        | Every push failed; the occurrence is not retried                      |
|                                               | `status: no_recipients` | No active LINE mapping at send time                                   |
| `reminders/{id}`                              | `nextDueAt`             | Advanced after a send, a completion, an opt-out, or a duplicate claim |

`expiresAt` is `createdAt + 30 days`; enable the Firestore TTL policy per
[`ttl.md`](./ttl.md). A `pending` row older than a few minutes means the run
crashed (or was killed) between claiming the occurrence and finishing it. The
occurrence is then lost rather than retried: the next tick sees the existing
claim, advances `nextDueAt`, and sends nothing. Use the re-queue procedure below
to recover it.

## Find stale pending rows

The status filter is a single-field equality, so no composite index is needed;
compare `createdAt` client-side.

Firestore console:

1. Open `notificationLog`.
2. Filter `status` `==` `pending`.
3. Inspect `createdAt`; anything older than 15 minutes is stale.

REST (read-only; use an authenticated operator account, never a committed key):

```bash
PROJECT_ID=taijian-prod

curl -s \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents:runQuery" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{"structuredQuery":{
        "from":[{"collectionId":"notificationLog"}],
        "where":{"fieldFilter":{
          "field":{"fieldPath":"status"},
          "op":"EQUAL",
          "value":{"stringValue":"pending"}}},
        "limit":100}}' |
  jq -r '.[] | select(.document) | [
    .document.name,
    (.document.fields.createdAt.timestampValue // ""),
    (.document.fields.reminderId.stringValue // ""),
    (.document.fields.dueDate.stringValue // "")] | @tsv'
```

Admin SDK (same query, also filters by age):

```js
const cutoff = new Date(Date.now() - 15 * 60 * 1000);
const snap = await db.collection('notificationLog').where('status', '==', 'pending').get();
for (const doc of snap.docs) {
  const createdAt = doc.get('createdAt')?.toDate?.();
  if (createdAt && createdAt < cutoff) console.log(doc.id, createdAt.toISOString());
}
```

## Re-queue a stale occurrence

The row is both the delivery record and the dedupe marker, so a retry needs the
row **and** the reminder rewound.

1. Confirm the occurrence still matters:
   - `reminders/{reminderId}` exists, `enabled == true`, `deletedAt == null`.
   - No completion: `taskCompletions/{completionId(reminderId, dueDate)}` is
     absent (`completionId` is `sha256("<reminderId>:<dueDate>")`, 64 hex chars —
     use `scripts`/the console to compute it, or check the LIFF today page).
   - `dueDate` is **today** in the reminder's timezone. Do not replay older
     occurrences; the household already saw the day pass.
2. Delete `notificationLog/{reminderId}_{dueDate}_line`.
3. Set `reminders/{reminderId}.nextDueAt` back to the occurrence instant for
   `dueDate` (the schedule time in the reminder's timezone), which is now in the
   past. Keep `enabled == true`.
4. The next 5-minute tick re-claims the occurrence, pushes to the active
   mappings, and advances `nextDueAt` again.

If the occurrence should stay lost, delete the `pending` row and do nothing
else. Deleting the row alone does **not** retry: `nextDueAt` has already moved
on. Leaving it in place is also safe — TTL removes it after 30 days.

Check a run's outcome without message content:

```bash
firebase functions:log --only reminderScheduler
```

Failures are logged as `reminder processing failed` or `LINE push failed` with
`reminderId` and the error message only (no LINE ids, titles, or tokens).

## `cleanupPending` tail (handled by `purgeDeleted`)

`animal.delete` cascades at most 200 records and 50 reminders in its
transaction. A larger history leaves the tail with `deletedAt: null` and sets
`animals.cleanupPending == true`. The reminder scheduler already retires
(disables) reminders whose animal is no longer live, so the tail cannot notify.

The tail is now finished by `purgeDeleted`
(`services/functions/src/maintenance/purge.ts`), which runs daily at 03:30
Asia/Taipei:

1. Flagged, soft-deleted animals get their remaining records and reminders
   stamped with `deletedAt` + `deletedWithAnimal` in batches. `cleanupPending`
   is cleared only once a re-check reports no live child left. A tail too large
   for one run keeps its flag and the animal is retried the next day.
2. Soft-deleted records, reminders, task completions, and animals older than 30
   days are hard-deleted. An animal whose tail still has live children is kept
   so the tail is never orphaned.
3. Soft-deleted households older than 30 days are deleted together with their
   records, reminders, task completions, animals, invites, audit logs, and
   members. A household that still has a member document is skipped (an
   interrupted account deletion can leave one behind).

Inspect flagged animals with the equality filter `cleanupPending == true`; the
composite index `(cleanupPending, deletedAt)` is declared in
`firestore.indexes.json`. Inspect a tail's live children per collection:

```js
const animalId = '...';
for (const name of ['records', 'reminders']) {
  const snap = await db
    .collection(name)
    .where('animalId', '==', animalId)
    .where('deletedAt', '==', null)
    .get();
  console.log(name, 'remaining:', snap.size);
}
```

Do not run an unbounded loop inside either scheduled function: both are bounded
per tick and resume on the next run.

## Known v1 limits

- One time of day per schedule. `ScheduleSchema` rejects `times.length != 1`
  because notification and completion keys are due-date based; occurrence-based
  keys are a v2 change.
- Quiet hours (`households/{id}.settings.quietHours`) defer the occurrence by
  leaving `nextDueAt` untouched. The reminder stays due and is re-read every
  tick until the window closes, then delivered late.
- `notificationsEnabled: false` skips the push and advances `nextDueAt`; a
  backlog is not delivered when notifications are re-enabled.
- Delivery is at-most-once per occurrence: a crash after the `pending` claim
  loses that push instead of duplicating it. Use the re-queue procedure above.
