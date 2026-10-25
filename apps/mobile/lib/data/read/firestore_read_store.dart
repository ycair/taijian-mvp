import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/models/models.dart';
import 'read_store.dart';

class FirestoreReadStore implements ReadStore {
  FirestoreReadStore([FirebaseFirestore? firestore])
    : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  Map<String, dynamic>? _data(DocumentSnapshot<Map<String, dynamic>> doc) => doc.data();

  @override
  Stream<AppUser?> watchUser(String uid) {
    return _db.collection('users').doc(uid).snapshots().map((doc) {
      final data = _data(doc);
      return data == null ? null : AppUser.fromMap(uid, data);
    });
  }

  @override
  Stream<Household?> watchHousehold(String householdId) {
    return _db.collection('households').doc(householdId).snapshots().map((doc) {
      final data = _data(doc);
      if (data == null || data['deletedAt'] != null) return null;
      return Household.fromMap(householdId, data);
    });
  }

  @override
  Stream<List<HouseholdMember>> watchMembers(String householdId) {
    return _db
        .collection('households')
        .doc(householdId)
        .collection('members')
        .snapshots()
        .map(
          (snapshot) => snapshot.docs
              .where((doc) => doc.data()['status'] != 'removed')
              .map((doc) => HouseholdMember.fromMap(doc.id, doc.data()))
              .toList(growable: false),
        );
  }

  @override
  Stream<List<Animal>> watchAnimals(String householdId) {
    return _db
        .collection('animals')
        .where('householdId', isEqualTo: householdId)
        .snapshots()
        .map(
          (snapshot) => snapshot.docs
              .where((doc) => doc.data()['deletedAt'] == null)
              .map((doc) => Animal.fromMap(doc.id, doc.data()))
              .toList(growable: false),
        );
  }

  @override
  Stream<List<CareRecord>> watchRecords(String householdId, {String? animalId}) {
    Query<Map<String, dynamic>> query = _db
        .collection('records')
        .where('householdId', isEqualTo: householdId);
    if (animalId != null) {
      query = query.where('animalId', isEqualTo: animalId);
    }
    return query
        .orderBy('occurredAt', descending: true)
        .limit(animalId == null ? 100 : 50)
        .snapshots()
        .map(
          (snapshot) => snapshot.docs
              .where((doc) => doc.data()['deletedAt'] == null)
              .map((doc) => CareRecord.fromMap(doc.id, doc.data()))
              .toList(growable: false),
        );
  }

  @override
  Stream<List<Reminder>> watchReminders(String householdId, {String? animalId}) {
    Query<Map<String, dynamic>> query = _db
        .collection('reminders')
        .where('householdId', isEqualTo: householdId);
    if (animalId != null) {
      query = query.where('animalId', isEqualTo: animalId);
    }
    return query.snapshots().map(
      (snapshot) => snapshot.docs
          .where((doc) => doc.data()['deletedAt'] == null)
          .map((doc) => Reminder.fromMap(doc.id, doc.data()))
          .toList(growable: false),
    );
  }

  @override
  Stream<List<Completion>> watchCompletions(
    String householdId, {
    required String from,
    required String to,
  }) {
    return _db
        .collection('taskCompletions')
        .where('householdId', isEqualTo: householdId)
        .where('dueDate', isGreaterThanOrEqualTo: from)
        .where('dueDate', isLessThanOrEqualTo: to)
        .snapshots()
        .map(
          (snapshot) => snapshot.docs
              .map((doc) => Completion.fromMap(doc.data()))
              .toList(growable: false),
        );
  }
}
