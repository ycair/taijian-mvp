import { Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/firestore';

/** Product retention: soft-deleted documents are removed 30 days after `deletedAt`. */
export const RETENTION_DAYS = 30;
export const RETENTION_MS = RETENTION_DAYS * 86_400_000;

/**
 * `deletedAt > epoch` is not decoration: a range filter already excludes nulls
 * in production Firestore, but the emulator (and a future field-typed query)
 * can behave differently. Combining it with `<= cutoff` states the window
 * explicitly so a live document is never treated as deleted.
 */
const DELETED_AT_EPOCH = Timestamp.fromMillis(1);

/** Firestore allows 500 writes per batch; the parent document needs headroom. */
const BATCH_WRITE_LIMIT = 400;
/** Flagged animals handled per run (each may fan out to thousands of children). */
const TAIL_ANIMAL_LIMIT = 20;
/** Child batches finished per flagged animal per run. */
const TAIL_BATCHES_PER_ANIMAL = 10;
/** Soft-deleted parents hard-deleted per collection per run. */
const PAGE_LIMIT = 100;
/** Hard-delete pages per collection per run. */
const PAGE_BATCHES = 10;
/** A household with a very large history keeps its parent doc until a later run. */
const HOUSEHOLD_BATCHES = 25;

export type PurgeSummary = {
  tailsFinished: number;
  tailsPending: number;
  records: number;
  reminders: number;
  completions: number;
  animals: number;
  households: number;
  householdsSkipped: number;
};

type DocRef = FirebaseFirestore.DocumentReference;

const EMPTY_SUMMARY = (): PurgeSummary => ({
  tailsFinished: 0,
  tailsPending: 0,
  records: 0,
  reminders: 0,
  completions: 0,
  animals: 0,
  households: 0,
  householdsSkipped: 0,
});

function cutoffOf(now: Date): Timestamp {
  return Timestamp.fromMillis(now.getTime() - RETENTION_MS);
}

/** Writes deletes in bounded batches; returns how many documents were removed. */
async function deleteRefs(refs: DocRef[]): Promise<number> {
  let deleted = 0;
  for (let index = 0; index < refs.length; index += BATCH_WRITE_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(index, index + BATCH_WRITE_LIMIT)) batch.delete(ref);
    await batch.commit();
    deleted += Math.min(BATCH_WRITE_LIMIT, refs.length - index);
  }
  return deleted;
}

/** Hard-deletes every document in a collection whose `deletedAt` is in the window. */
async function purgeSoftDeleted(
  collection: string,
  cutoff: Timestamp,
  batches = PAGE_BATCHES,
): Promise<number> {
  let deleted = 0;
  for (let batch = 0; batch < batches; batch += 1) {
    const snap = await db
      .collection(collection)
      .where('deletedAt', '>', DELETED_AT_EPOCH)
      .where('deletedAt', '<=', cutoff)
      .limit(BATCH_WRITE_LIMIT)
      .get();
    if (snap.empty) break;
    deleted += await deleteRefs(snap.docs.map((doc) => doc.ref));
    if (snap.size < BATCH_WRITE_LIMIT) break;
  }
  return deleted;
}

/** True when the animal still has a child the bounded cascade could not reach. */
async function hasLiveChild(
  collection: 'records' | 'reminders',
  animalId: string,
): Promise<boolean> {
  const snap = await db
    .collection(collection)
    .where('animalId', '==', animalId)
    .where('deletedAt', '==', null)
    .limit(1)
    .get();
  return !snap.empty;
}

function tailPatch(animalId: string): Record<string, unknown> {
  return {
    deletedAt: Timestamp.now(),
    deletedWithAnimal: animalId,
    lastChangedFields: ['deletedAt', 'deletedWithAnimal'],
    updatedAt: Timestamp.now(),
    updatedFrom: 'system:purge',
  };
}

/**
 * Completes the soft-delete cascade for one flagged animal. Works through the
 * children in bounded batches, then reports whether any live child remains so
 * `cleanupPending` is only cleared once the tail is gone.
 *
 * `hardDelete` is used when the animal itself is already past retention: its
 * children are past retention too, so leaving them behind would only orphan
 * them once the parent document disappears.
 */
async function finishAnimalTail(
  animalId: string,
  options: { hardDelete?: boolean } = {},
): Promise<{
  records: number;
  reminders: number;
  remaining: boolean;
}> {
  let records = 0;
  let reminders = 0;

  for (const collection of ['records', 'reminders'] as const) {
    for (let batch = 0; batch < TAIL_BATCHES_PER_ANIMAL; batch += 1) {
      const snap = await db
        .collection(collection)
        .where('animalId', '==', animalId)
        .where('deletedAt', '==', null)
        .limit(BATCH_WRITE_LIMIT)
        .get();
      if (snap.empty) break;
      if (options.hardDelete) {
        await deleteRefs(snap.docs.map((doc) => doc.ref));
      } else {
        const write = db.batch();
        for (const doc of snap.docs) {
          write.set(doc.ref, tailPatch(animalId), { merge: true });
        }
        await write.commit();
      }
      if (collection === 'records') records += snap.size;
      else reminders += snap.size;
      if (snap.size < BATCH_WRITE_LIMIT) break;
    }
  }

  const remaining =
    (await hasLiveChild('records', animalId)) || (await hasLiveChild('reminders', animalId));
  return { records, reminders, remaining };
}

/**
 * Animals whose cascade hit its bound carry `cleanupPending`. Only animals that
 * are actually deleted are considered: a flag left on a live animal (for
 * example a manual fix) must never hide its children.
 */
async function finishCleanupPending(
  deletedBefore: Timestamp,
  summary: PurgeSummary,
): Promise<void> {
  const flagged = await db
    .collection('animals')
    .where('cleanupPending', '==', true)
    .where('deletedAt', '>', DELETED_AT_EPOCH)
    .where('deletedAt', '<=', deletedBefore)
    .limit(TAIL_ANIMAL_LIMIT)
    .get();

  for (const animal of flagged.docs) {
    const tail = await finishAnimalTail(animal.id);
    summary.records += tail.records;
    summary.reminders += tail.reminders;
    if (tail.remaining) {
      summary.tailsPending += 1;
      continue;
    }
    await animal.ref.set({ cleanupPending: false }, { merge: true });
    summary.tailsFinished += 1;
  }
}

/** Hard-deletes soft-deleted animals, finishing any tail first. */
async function purgeAnimals(cutoff: Timestamp, summary: PurgeSummary): Promise<void> {
  for (let batch = 0; batch < PAGE_BATCHES; batch += 1) {
    const snap = await db
      .collection('animals')
      .where('deletedAt', '>', DELETED_AT_EPOCH)
      .where('deletedAt', '<=', cutoff)
      .limit(PAGE_LIMIT)
      .get();
    if (snap.empty) return;

    const deletable: DocRef[] = [];
    for (const animal of snap.docs) {
      if (animal.data().cleanupPending === true) {
        const tail = await finishAnimalTail(animal.id, { hardDelete: true });
        summary.records += tail.records;
        summary.reminders += tail.reminders;
        // A tail still in progress keeps the animal for the next run, so the
        // children are never orphaned by a hard-deleted parent.
        if (tail.remaining) continue;
      }
      deletable.push(animal.ref);
    }

    summary.animals += await deleteRefs(deletable);
    if (snap.size < PAGE_LIMIT) return;
  }
}

/** Deletes every document of a top-level collection that belongs to a household. */
async function purgeHouseholdChildren(
  collection: string,
  householdId: string,
): Promise<boolean> {
  for (let batch = 0; batch < HOUSEHOLD_BATCHES; batch += 1) {
    const snap = await db
      .collection(collection)
      .where('householdId', '==', householdId)
      .limit(BATCH_WRITE_LIMIT)
      .get();
    if (snap.empty) return true;
    await deleteRefs(snap.docs.map((doc) => doc.ref));
    if (snap.size < BATCH_WRITE_LIMIT) return true;
  }
  const leftover = await db
    .collection(collection)
    .where('householdId', '==', householdId)
    .limit(1)
    .get();
  return leftover.empty;
}

/** Deletes a subcollection whose documents have no `householdId` field. */
async function purgeSubcollection(
  householdId: string,
  subcollection: string,
): Promise<boolean> {
  for (let batch = 0; batch < HOUSEHOLD_BATCHES; batch += 1) {
    const snap = await db.collection(`households/${householdId}/${subcollection}`).limit(BATCH_WRITE_LIMIT).get();
    if (snap.empty) return true;
    await deleteRefs(snap.docs.map((doc) => doc.ref));
    if (snap.size < BATCH_WRITE_LIMIT) return true;
  }
  return false;
}

/**
 * Hard-deletes a soft-deleted household and its children. A household that
 * still has a member document is skipped: an interrupted account deletion can
 * leave one behind, and deleting the parent would leave that member pointing at
 * nothing (and the rules join would fail closed for a live user).
 */
async function purgeHouseholds(cutoff: Timestamp, summary: PurgeSummary): Promise<void> {
  const snap = await db
    .collection('households')
    .where('deletedAt', '>', DELETED_AT_EPOCH)
    .where('deletedAt', '<=', cutoff)
    .limit(PAGE_LIMIT)
    .get();

  for (const household of snap.docs) {
    const members = await db.collection(`households/${household.id}/members`).limit(1).get();
    if (!members.empty) {
      summary.householdsSkipped += 1;
      continue;
    }

    const childrenGone: boolean[] = [];
    for (const collection of ['records', 'reminders', 'taskCompletions', 'animals', 'invites']) {
      childrenGone.push(await purgeHouseholdChildren(collection, household.id));
    }
    // Audit logs are the household's own history; they cannot outlive it.
    childrenGone.push(await purgeSubcollection(household.id, 'auditLogs'));
    childrenGone.push(await purgeSubcollection(household.id, 'members'));

    if (childrenGone.some((gone) => !gone)) {
      summary.householdsSkipped += 1;
      continue;
    }

    await household.ref.delete();
    summary.households += 1;
  }
}

/**
 * One purge pass. Exported so the emulator suite can drive it with a fixed
 * clock; production calls it through `purgeDeleted`.
 */
export async function runPurgeDeleted(options: { now?: Date } = {}): Promise<PurgeSummary> {
  const now = options.now ?? new Date();
  const cutoff = cutoffOf(now);
  const summary = EMPTY_SUMMARY();

  // A flagged tail is finished as soon as the animal is deleted; waiting for
  // the 30-day window would leave logically-deleted children visible to reads
  // that only trust their own `deletedAt`.
  await finishCleanupPending(Timestamp.fromDate(now), summary);
  summary.records += await purgeSoftDeleted('records', cutoff);
  summary.reminders += await purgeSoftDeleted('reminders', cutoff);
  summary.completions += await purgeSoftDeleted('taskCompletions', cutoff);
  await purgeAnimals(cutoff, summary);
  await purgeHouseholds(cutoff, summary);

  return summary;
}

/**
 * Daily retention sweep, separate from `reminderScheduler` so a slow purge can
 * never delay (or overlap) notification delivery.
 */
export const purgeDeleted = onSchedule(
  {
    region: 'asia-east1',
    schedule: 'every day 03:30',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 540,
  },
  async () => {
    await runPurgeDeleted();
  },
);
