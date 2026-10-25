import '../../core/models/models.dart';

/// Read side of the data layer.
///
/// Phase 1 reads Firestore directly (rules limit access to household members);
/// mock mode reads the same shapes from an in-memory store.
abstract class ReadStore {
  Stream<AppUser?> watchUser(String uid);

  Stream<Household?> watchHousehold(String householdId);

  Stream<List<HouseholdMember>> watchMembers(String householdId);

  Stream<List<Animal>> watchAnimals(String householdId);

  Stream<List<CareRecord>> watchRecords(String householdId, {String? animalId});

  Stream<List<Reminder>> watchReminders(String householdId, {String? animalId});

  Stream<List<Completion>> watchCompletions(
    String householdId, {
    required String from,
    required String to,
  });
}
