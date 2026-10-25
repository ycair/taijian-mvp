import '../../core/models/models.dart';
import '../mock/mock_store.dart';
import 'read_store.dart';

class MockReadStore implements ReadStore {
  MockReadStore(this.store);

  final MockStore store;

  @override
  Stream<AppUser?> watchUser(String uid) => store.watch(() => store.users[uid]);

  @override
  Stream<Household?> watchHousehold(String householdId) =>
      store.watch(() => store.households[householdId]);

  @override
  Stream<List<HouseholdMember>> watchMembers(String householdId) =>
      store.watch(() => List<HouseholdMember>.unmodifiable(store.members[householdId] ?? const []));

  @override
  Stream<List<Animal>> watchAnimals(String householdId) => store.watch(() {
    final rows = store.animals.values.where((animal) => animal.householdId == householdId).toList()
      ..sort((a, b) => a.name.compareTo(b.name));
    return List<Animal>.unmodifiable(rows);
  });

  @override
  Stream<List<CareRecord>> watchRecords(String householdId, {String? animalId}) => store.watch(() {
    final rows = store.records
        .where((record) => record.householdId == householdId)
        .where((record) => animalId == null || record.animalId == animalId)
        .toList()
      ..sort((a, b) => b.occurredAt.compareTo(a.occurredAt));
    return List<CareRecord>.unmodifiable(rows);
  });

  @override
  Stream<List<Reminder>> watchReminders(String householdId, {String? animalId}) => store.watch(() {
    final rows = store.reminders.values
        .where((reminder) => reminder.householdId == householdId)
        .where((reminder) => animalId == null || reminder.animalId == animalId)
        .toList()
      ..sort((a, b) => a.schedule.time.compareTo(b.schedule.time));
    return List<Reminder>.unmodifiable(rows);
  });

  @override
  Stream<List<Completion>> watchCompletions(
    String householdId, {
    required String from,
    required String to,
  }) => store.watch(() {
    final rows = store.completions.values
        .where((completion) {
          final inWindow = completion.dueDate.compareTo(from) >= 0 &&
              completion.dueDate.compareTo(to) <= 0;
          return inWindow && store.reminders[completion.reminderId]?.householdId == householdId;
        })
        .toList();
    return List<Completion>.unmodifiable(rows);
  });
}
