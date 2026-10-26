import 'dart:async';

import '../../core/models/models.dart';
import '../read/read_store.dart';
import 'supabase_mappers.dart';
import 'supabase_rest_client.dart';

class SupabaseReadStore implements ReadStore {
  SupabaseReadStore(
    this._client, {
    this.pollInterval = const Duration(seconds: 12),
  });

  final SupabaseRestClient _client;
  final Duration pollInterval;

  @override
  Stream<AppUser?> watchUser(String uid) {
    return _poll(() async {
      final results = await Future.wait([
        _client.select('profiles', query: 'select=*&id=eq.${_value(uid)}'),
        _client.select(
          'household_members',
          query: 'select=household_id&user_id=eq.${_value(uid)}',
        ),
      ]);
      final profile = results[0];
      if (profile.isEmpty) return null;
      return appUserFromSupabase(profile.first, results[1]);
    });
  }

  @override
  Stream<Household?> watchHousehold(String householdId) {
    return _poll(() async {
      final rows = await _client.select(
        'households',
        query: 'select=*&id=eq.${_value(householdId)}&deleted_at=is.null',
      );
      return rows.isEmpty ? null : householdFromSupabase(rows.first);
    });
  }

  @override
  Stream<List<HouseholdMember>> watchMembers(String householdId) {
    return _poll(() async {
      final rows = await _client.select(
        'household_members',
        query:
            'select=user_id,role,profiles(display_name,avatar_url)&household_id=eq.${_value(householdId)}',
      );
      return rows
          .map(_normalizeMemberRow)
          .map(memberFromSupabase)
          .toList(growable: false);
    });
  }

  @override
  Stream<List<Animal>> watchAnimals(String householdId) {
    return _poll(() async {
      final rows = await _client.select(
        'animals',
        query:
            'select=*&household_id=eq.${_value(householdId)}&deleted_at=is.null&order=name.asc',
      );
      return rows.map(animalFromSupabase).toList(growable: false);
    });
  }

  @override
  Stream<List<CareRecord>> watchRecords(
    String householdId, {
    String? animalId,
  }) {
    return _poll(() async {
      final rows = await _client.select(
        'records',
        query: [
          'select=*',
          'household_id=eq.${_value(householdId)}',
          'deleted_at=is.null',
          if (animalId != null) 'animal_id=eq.${_value(animalId)}',
          'order=occurred_at.desc',
        ].join('&'),
      );
      return rows.map(recordFromSupabase).toList(growable: false);
    });
  }

  @override
  Stream<List<Reminder>> watchReminders(
    String householdId, {
    String? animalId,
  }) {
    return _poll(() async {
      final rows = await _client.select(
        'reminders',
        query: [
          'select=*',
          'household_id=eq.${_value(householdId)}',
          'deleted_at=is.null',
          if (animalId != null) 'animal_id=eq.${_value(animalId)}',
          'order=created_at.asc',
        ].join('&'),
      );
      return rows.map(reminderFromSupabase).toList(growable: false);
    });
  }

  @override
  Stream<List<Completion>> watchCompletions(
    String householdId, {
    required String from,
    required String to,
  }) {
    return _poll(() async {
      final rows = await _client.select(
        'task_completions',
        query: [
          'select=*',
          'household_id=eq.${_value(householdId)}',
          'due_date=gte.${_value(from)}',
          'due_date=lte.${_value(to)}',
        ].join('&'),
      );
      return rows.map(completionFromSupabase).toList(growable: false);
    });
  }

  Stream<T> _poll<T>(Future<T> Function() read) async* {
    while (true) {
      try {
        yield await read();
      } catch (error, stackTrace) {
        yield* Stream<T>.error(error, stackTrace);
      }
      await Future<void>.delayed(pollInterval);
    }
  }

  String _value(String value) => Uri.encodeQueryComponent(value);

  Map<String, dynamic> _normalizeMemberRow(Map<String, dynamic> row) {
    final profile = row['profiles'];
    if (profile is List && profile.isNotEmpty) {
      return {...row, 'profiles': profile.first};
    }
    return row;
  }
}
