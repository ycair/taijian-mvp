import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/models/command_result.dart';
import '../../core/models/models.dart';
import '../../core/time/app_time.dart';
import '../../core/time/schedule_dates.dart';
import '../../data/command/command_api.dart';
import '../../data/outbox/outbox.dart';
import '../../data/outbox/outbox_database.dart';
import '../../data/read/read_store.dart';
import '../app/bootstrap.dart';
import '../features/auth/auth_service.dart';
import '../features/today/today_engine.dart';

final appDependenciesProvider = Provider<AppDependencies>(
  (ref) => throw StateError('appDependenciesProvider must be overridden in main()'),
);

final appConfigProvider = Provider<AppConfig>((ref) => ref.watch(appDependenciesProvider).config);
final appVersionProvider = Provider<String>(
  (ref) => ref.watch(appDependenciesProvider).appVersion,
);
final authServiceProvider = Provider<AuthService>((ref) => ref.watch(appDependenciesProvider).auth);
final readStoreProvider = Provider<ReadStore>((ref) => ref.watch(appDependenciesProvider).readStore);
final commandApiProvider = Provider<CommandApi>((ref) => ref.watch(appDependenciesProvider).commandApi);
final outboxDatabaseProvider = Provider<OutboxDatabase>(
  (ref) => ref.watch(appDependenciesProvider).outboxDatabase,
);
final outboxProvider = Provider<Outbox>((ref) => ref.watch(appDependenciesProvider).outbox);

final authStateProvider = StreamProvider<AppUser?>(
  (ref) => ref.watch(authServiceProvider).authStateChanges(),
);

final currentUserProvider = Provider<AppUser?>(
  (ref) => ref.watch(authStateProvider).value,
);

final appUserProvider = StreamProvider<AppUser?>((ref) {
  final authUser = ref.watch(currentUserProvider);
  if (authUser == null) return Stream<AppUser?>.value(null);
  return ref.watch(readStoreProvider).watchUser(authUser.uid).map((profile) {
    if (profile == null) return authUser;
    // `ensureUserDoc` seeds displayName with the UID; the Auth provider's name
    // is better until the user edits their profile.
    final name = profile.displayName == authUser.uid ? authUser.displayName : profile.displayName;
    return profile.copyWith(
      displayName: name,
      timezone: profile.timezone.isEmpty ? authUser.timezone : profile.timezone,
    );
  });
});

final householdIdProvider = Provider<String?>((ref) {
  final user = ref.watch(appUserProvider).value;
  if (user == null) return null;
  final selected = user.defaultHouseholdId;
  if (selected != null && user.householdIds.contains(selected)) return selected;
  if (user.householdIds.isNotEmpty) return user.householdIds.first;
  return null;
});

final householdProvider = StreamProvider<Household?>((ref) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<Household?>.value(null);
  return ref.watch(readStoreProvider).watchHousehold(id);
});

final householdTimezoneProvider = Provider<String>((ref) {
  return ref.watch(householdProvider).value?.timezone ??
      ref.watch(appUserProvider).value?.timezone ??
      'Asia/Taipei';
});

final householdMembersProvider = StreamProvider<List<HouseholdMember>>((ref) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<List<HouseholdMember>>.value(const []);
  return ref.watch(readStoreProvider).watchMembers(id);
});

final householdOwnerProvider = Provider<bool>((ref) {
  final uid = ref.watch(currentUserProvider)?.uid;
  if (uid == null) return false;
  final members = ref.watch(householdMembersProvider).value ?? const <HouseholdMember>[];
  return members.any((member) => member.uid == uid && member.role == MemberRole.owner);
});

final animalsProvider = StreamProvider<List<Animal>>((ref) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<List<Animal>>.value(const []);
  return ref.watch(readStoreProvider).watchAnimals(id);
});

final activeAnimalsProvider = Provider<List<Animal>>((ref) {
  final animals = (ref.watch(animalsProvider).value ?? const <Animal>[])
      .where((animal) => animal.isActive)
      .toList();
  animals.sort((a, b) => a.name.compareTo(b.name));
  return List<Animal>.unmodifiable(animals);
});

final memorialAnimalsProvider = Provider<List<Animal>>((ref) {
  final animals = (ref.watch(animalsProvider).value ?? const <Animal>[])
      .where((animal) => animal.isMemorial)
      .toList();
  animals.sort((a, b) => a.name.compareTo(b.name));
  return List<Animal>.unmodifiable(animals);
});

final animalProvider = StreamProvider.family<Animal?, String>((ref, animalId) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<Animal?>.value(null);
  return ref.watch(readStoreProvider).watchAnimals(id).map((animals) {
    for (final animal in animals) {
      if (animal.id == animalId) return animal;
    }
    return null;
  });
});

final recordsProvider = StreamProvider<List<CareRecord>>((ref) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<List<CareRecord>>.value(const []);
  return ref.watch(readStoreProvider).watchRecords(id);
});

final animalRecordsProvider = StreamProvider.family<List<CareRecord>, String>((ref, animalId) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<List<CareRecord>>.value(const []);
  return ref.watch(readStoreProvider).watchRecords(id, animalId: animalId);
});

final remindersProvider = StreamProvider<List<Reminder>>((ref) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<List<Reminder>>.value(const []);
  return ref.watch(readStoreProvider).watchReminders(id);
});

final animalRemindersProvider = StreamProvider.family<List<Reminder>, String>((ref, animalId) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<List<Reminder>>.value(const []);
  return ref.watch(readStoreProvider).watchReminders(id, animalId: animalId);
});

final todayCompletionsProvider = StreamProvider<List<Completion>>((ref) {
  final id = ref.watch(householdIdProvider);
  if (id == null) return Stream<List<Completion>>.value(const []);
  final window = TodayEngine.completionWindow(DateTime.now(), ref.watch(householdTimezoneProvider));
  return ref
      .watch(readStoreProvider)
      .watchCompletions(id, from: window.from, to: window.to);
});

final todayTasksProvider = Provider<AsyncValue<List<TodayTask>>>((ref) {
  final reminders = ref.watch(remindersProvider);
  final animals = ref.watch(animalsProvider);
  final completions = ref.watch(todayCompletionsProvider);
  final pendingCompletions = ref.watch(pendingTaskCompletionKeysProvider);

  if (reminders.isLoading || animals.isLoading || completions.isLoading) {
    return const AsyncLoading();
  }
  final error = reminders.error ?? animals.error ?? completions.error;
  if (error != null) {
    return AsyncError(
      error,
      reminders.stackTrace ?? animals.stackTrace ?? completions.stackTrace ?? StackTrace.current,
    );
  }
  return AsyncData(
    TodayEngine.build(
      reminders: reminders.value ?? const [],
      animals: animals.value ?? const [],
      completions: completions.value ?? const [],
      now: DateTime.now(),
      householdTimezone: ref.watch(householdTimezoneProvider),
      pendingCompletionKeys: pendingCompletions,
    ),
  );
});

/// `reminderId:dueDate` keys for task completions still waiting in the outbox.
/// Today renders these as "已完成 · 同步中…" while offline.
final pendingTaskCompletionKeysProvider = Provider<Set<String>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const {};
  return pendingTaskCompletionKeysFrom(
    ref.watch(outboxEntriesProvider).value ?? const <OutboxEntry>[],
  );
});

/// Extracts `reminderId:dueDate` from pending/sending `task.complete` rows.
Set<String> pendingTaskCompletionKeysFrom(Iterable<OutboxEntry> entries) {
  final keys = <String>{};
  for (final entry in entries) {
    if (entry.type != 'task.complete') continue;
    if (entry.status != OutboxStatus.pending && entry.status != OutboxStatus.sending) {
      continue;
    }
    try {
      final payload = jsonDecode(entry.payloadJson);
      if (payload is! Map) continue;
      final reminderId = payload['reminderId'];
      final dueDate = payload['dueDate'];
      if (reminderId is String && dueDate is String && reminderId.isNotEmpty && dueDate.isNotEmpty) {
        keys.add('$reminderId:$dueDate');
      }
    } catch (_) {
      // A malformed row is handled by the outbox's own failure path.
    }
  }
  return keys;
}

final outboxEntriesProvider = StreamProvider<List<OutboxEntry>>((ref) {
  // The query is scoped by UID, so rebuild when the signed-in account changes.
  ref.watch(currentUserProvider);
  return ref.watch(outboxProvider).watchEntries();
});

final conflictsProvider = StreamProvider<List<OutboxEntry>>((ref) {
  ref.watch(currentUserProvider);
  return ref.watch(outboxProvider).watchConflicts();
});

class CommandService {
  CommandService({required this.outbox, required this.api, this.autoFlush = true});

  final Outbox outbox;
  final CommandApi api;

  /// Disabled by contract tests that inspect queued rows before flushing.
  final bool autoFlush;

  /// Queues a mutation and flushes in the background.
  Future<QueuedCommand> submit(
    String type,
    Map<String, dynamic> payload, {
    String? householdId,
    int? baseRevision,
    String? targetId,
  }) async {
    final command = await outbox.enqueue(
      type,
      payload,
      householdId: householdId,
      baseRevision: baseRevision,
      targetId: targetId,
    );
    if (autoFlush) unawaited(outbox.flush());
    return command;
  }

  /// For writes whose response is needed immediately (invite token, new
  /// household). These are online-only.
  ///
  /// `commandId` must come from a `CommandAttempt` owned by the screen and be
  /// reused while the same logical request is retried.
  Future<CommandResult> runNow(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) {
    return api.executeCommand(
      type,
      payload,
      commandId: commandId,
      householdId: householdId,
      baseRevision: baseRevision,
    );
  }
}

final commandServiceProvider = Provider<CommandService>(
  (ref) => CommandService(outbox: ref.watch(outboxProvider), api: ref.watch(commandApiProvider)),
);

/// A recipient selector for the settings screen.
final timezoneOptions = <String>[
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'UTC',
];

String timezoneLabel(String timezone) => switch (timezone) {
  'Asia/Taipei' => '台北 (UTC+8)',
  'Asia/Tokyo' => '東京 (UTC+9)',
  'Asia/Hong_Kong' => '香港 (UTC+8)',
  'Asia/Singapore' => '新加坡 (UTC+8)',
  'UTC' => 'UTC',
  _ => timezone,
};

String nextDueLabel(Reminder reminder) {
  final next = reminder.nextDueAt ?? nextDueAt(reminder.schedule, reminder.timezone, DateTime.now());
  if (next == null) return '尚未排程';
  return '下次 ${formatDateTime(next, reminder.timezone)}（${localDateKey(next, reminder.timezone)}）';
}
