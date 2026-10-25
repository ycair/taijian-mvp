import 'dart:convert';
import 'dart:math';

import 'package:uuid/uuid.dart';

import '../../core/models/command_result.dart';
import '../../core/models/models.dart';
import '../../core/time/app_time.dart';
import '../../core/time/schedule_dates.dart';
import '../command/command_api.dart';
import 'mock_store.dart';

class _CachedCommand {
  const _CachedCommand(this.fingerprint, this.result);

  final String fingerprint;
  final CommandResult result;
}

/// In-memory implementation of the Phase 1 command contract.
///
/// It enforces the same revision rules, idempotency cache, role checks, and
/// deterministic CONFLICT payloads as `executeCommand`, so the outbox and the
/// conflict UI can be exercised without Firebase.
class MockCommandApi implements CommandApi {
  MockCommandApi({
    required this.store,
    required this.uid,
    this.latency = const Duration(milliseconds: 40),
  });

  final MockStore store;
  final String Function() uid;
  final Duration latency;

  final Map<String, _CachedCommand> _cache = {};
  final _uuid = const Uuid();
  final _random = Random.secure();

  @override
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) async {
    if (latency > Duration.zero) await Future<void>.delayed(latency);
    final fingerprint = _fingerprint(type, payload, householdId, baseRevision);
    final cached = _cache[commandId];
    if (cached != null) {
      if (cached.fingerprint == fingerprint) return cached.result;
      return _failure(
        commandId,
        'IDEMPOTENCY_MISMATCH',
        'commandId was reused with a different request',
      );
    }

    final result = _apply(
      type,
      payload,
      commandId: commandId,
      householdId: householdId,
      baseRevision: baseRevision,
    );
    if (result.ok) _cache[commandId] = _CachedCommand(fingerprint, result);
    return result;
  }

  CommandResult _apply(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) {
    try {
      switch (type) {
        case 'household.create':
          return _createHousehold(commandId, payload);
        case 'household.update':
          return _updateHousehold(commandId, payload, householdId, baseRevision);
        case 'member.invite':
          return _inviteMember(commandId, payload, householdId);
        case 'member.accept':
          return _acceptInvite(commandId, payload);
        case 'animal.create':
          return _createAnimal(commandId, payload, householdId);
        case 'animal.update':
          return _updateAnimal(commandId, payload, householdId, baseRevision);
        case 'animal.archive':
          return _archiveAnimal(commandId, payload, householdId, baseRevision);
        case 'animal.delete':
          return _deleteAnimal(commandId, payload, householdId, baseRevision);
        case 'record.create':
          return _createRecord(commandId, payload, householdId);
        case 'reminder.create':
          return _createReminder(commandId, payload, householdId);
        case 'reminder.update':
          return _updateReminder(commandId, payload, householdId, baseRevision);
        case 'reminder.delete':
          return _deleteReminder(commandId, payload, householdId, baseRevision);
        case 'task.complete':
          return _completeTask(commandId, payload, householdId);
        case 'task.uncomplete':
          return _uncompleteTask(commandId, payload, householdId);
        case 'user.updateProfile':
          return _updateProfile(commandId, payload);
        default:
          return _failure(commandId, 'VALIDATION_ERROR', 'unsupported command: $type');
      }
    } on _CommandError catch (error) {
      return _failure(
        commandId,
        error.code,
        error.message,
        current: error.current,
        currentRevision: error.currentRevision,
      );
    }
  }

  CommandResult _createHousehold(String commandId, Map<String, dynamic> payload) {
    final name = _string(payload['name']).trim();
    if (name.isEmpty || name.length > 40) {
      throw const _CommandError('VALIDATION_ERROR', 'name must be 1-40 characters');
    }
    final timezone = _string(payload['timezone'], 'Asia/Taipei');
    final currentUid = uid();
    final householdId = 'hh_${_uuid.v4().replaceAll('-', '').substring(0, 18)}';
    final user = store.users[currentUid] ??
        AppUser(uid: currentUid, displayName: currentUid, timezone: timezone, isMock: true);

    store.mutate(() {
      store.households[householdId] = Household(
        id: householdId,
        name: name,
        ownerUid: currentUid,
        timezone: timezone,
        revision: 0,
      );
      store.members[householdId] = [
        HouseholdMember(uid: currentUid, role: MemberRole.owner, displayName: user.displayName),
      ];
      store.users[currentUid] = user.copyWith(
        householdIds: [...{...user.householdIds, householdId}],
        defaultHouseholdId: householdId,
      );
    });
    return CommandResult.success(
      commandId: commandId,
      revision: 0,
      data: {'householdId': householdId},
    );
  }

  CommandResult _updateHousehold(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
    int? baseRevision,
  ) {
    final household = _requireHousehold(householdId);
    _requireRole(household.id, MemberRole.owner, 'household.update');
    _assertRevision(household.revision, baseRevision, _householdJson(household));

    final name = payload['name'] == null ? null : _string(payload['name']).trim();
    if (name != null && (name.isEmpty || name.length > 40)) {
      throw const _CommandError('VALIDATION_ERROR', 'name must be 1-40 characters');
    }
    final timezone = payload['timezone'] as String?;
    final next = household.copyWith(
      name: name,
      timezone: timezone,
      revision: household.revision + 1,
    );
    store.mutate(() => store.households[household.id] = next);
    return CommandResult.success(
      commandId: commandId,
      revision: next.revision,
      data: {'householdId': next.id},
    );
  }

  CommandResult _inviteMember(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
  ) {
    final household = _requireHousehold(householdId);
    _requireRole(household.id, MemberRole.owner, 'member.invite');
    final inviteId = 'invite_${_uuid.v4().replaceAll('-', '').substring(0, 14)}';
    final secret = base64Url.encode(List<int>.generate(24, (_) => _random.nextInt(256)));
    final token = '$inviteId.$secret';
    final expiresAt = DateTime.now().toUtc().add(const Duration(days: 7));
    store.mutate(() {
      store.invites[token] = MockInvite(
        id: inviteId,
        token: token,
        householdId: household.id,
        role: 'caretaker',
        expiresAt: expiresAt,
      );
    });
    return CommandResult.success(
      commandId: commandId,
      data: {
        'token': token,
        'inviteId': inviteId,
        'expiresAt': expiresAt.toIso8601String(),
      },
    );
  }

  CommandResult _acceptInvite(String commandId, Map<String, dynamic> payload) {
    final token = _string(payload['token']);
    final invite = store.invites[token];
    if (invite == null) throw const _CommandError('NOT_FOUND', 'invite not found');
    if (invite.expiresAt.isBefore(DateTime.now().toUtc())) {
      throw const _CommandError('INVITE_EXPIRED', 'invite is no longer valid');
    }
    final currentUid = uid();
    if (store.memberOf(invite.householdId, currentUid) != null) {
      return CommandResult.success(
        commandId: commandId,
        data: {'householdId': invite.householdId, 'alreadyMember': true},
      );
    }
    final user = store.users[currentUid] ??
        AppUser(uid: currentUid, displayName: currentUid, isMock: true);
    store.mutate(() {
      store.members[invite.householdId] = [
        ...store.members[invite.householdId] ?? const [],
        HouseholdMember(uid: currentUid, role: MemberRole.caretaker, displayName: user.displayName),
      ];
      store.users[currentUid] = user.copyWith(
        householdIds: [...{...user.householdIds, invite.householdId}],
        defaultHouseholdId: user.defaultHouseholdId ?? invite.householdId,
      );
      store.invites.remove(token);
    });
    return CommandResult.success(
      commandId: commandId,
      data: {'householdId': invite.householdId},
    );
  }

  CommandResult _createAnimal(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
  ) {
    final household = _requireHousehold(householdId);
    _requireMember(household.id, 'animal.create');
    final name = _string(payload['name']).trim();
    if (name.isEmpty || name.length > 40) {
      throw const _CommandError('VALIDATION_ERROR', 'name must be 1-40 characters');
    }
    final species = _string(payload['species']);
    if (species.isEmpty) throw const _CommandError('VALIDATION_ERROR', 'species is required');
    final id = 'animal_${_uuid.v4().replaceAll('-', '').substring(0, 16)}';
    final animal = Animal(
      id: id,
      householdId: household.id,
      name: name,
      species: species,
      speciesLabel: _string(payload['speciesLabel']),
      morph: _nullableString(payload['morph']),
      sex: _string(payload['sex'], 'unknown'),
      avatarColor: _string(payload['avatarColor'], '#7C9A76'),
      status: 'active',
      revision: 0,
      notes: _nullableString(payload['notes']),
      birthDate: _nullableString(payload['birthDate']),
    );
    store.mutate(() => store.animals[id] = animal);
    return CommandResult.success(
      commandId: commandId,
      revision: 0,
      data: {'animalId': id},
    );
  }

  CommandResult _updateAnimal(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
    int? baseRevision,
  ) {
    final household = _requireHousehold(householdId);
    _requireMember(household.id, 'animal.update');
    final animal = _requireAnimal(household.id, _string(payload['animalId']));
    _assertRevision(animal.revision, baseRevision, _animalJson(animal));
    final next = animal.copyWith(
      name: payload['name'] == null ? null : _string(payload['name']).trim(),
      morph: payload['morph'] == null ? null : _string(payload['morph']),
      notes: payload['notes'] == null ? null : _string(payload['notes']),
      revision: animal.revision + 1,
    );
    store.mutate(() => store.animals[next.id] = next);
    return CommandResult.success(
      commandId: commandId,
      revision: next.revision,
      data: {'animalId': next.id},
    );
  }

  CommandResult _archiveAnimal(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
    int? baseRevision,
  ) {
    final household = _requireHousehold(householdId);
    _requireRole(household.id, MemberRole.owner, 'animal.archive');
    final animal = _requireAnimal(household.id, _string(payload['animalId']));
    _assertRevision(animal.revision, baseRevision, _animalJson(animal));
    final next = Animal(
      id: animal.id,
      householdId: animal.householdId,
      name: animal.name,
      species: animal.species,
      speciesLabel: animal.speciesLabel,
      avatarColor: animal.avatarColor,
      status: 'archived',
      revision: animal.revision + 1,
      morph: animal.morph,
      sex: animal.sex,
      notes: animal.notes,
      birthDate: animal.birthDate,
    );
    store.mutate(() {
      store.animals[next.id] = next;
      for (final reminder in store.reminders.values.toList()) {
        if (reminder.animalId == next.id) {
          store.reminders[reminder.id] = reminder.copyWith(enabled: false);
        }
      }
    });
    return CommandResult.success(
      commandId: commandId,
      revision: next.revision,
      data: {'animalId': next.id, 'status': 'archived'},
    );
  }

  CommandResult _deleteAnimal(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
    int? baseRevision,
  ) {
    final household = _requireHousehold(householdId);
    _requireRole(household.id, MemberRole.owner, 'animal.delete');
    final animal = _requireAnimal(household.id, _string(payload['animalId']));
    _assertRevision(animal.revision, baseRevision, _animalJson(animal));
    store.mutate(() {
      store.animals.remove(animal.id);
      store.records.removeWhere((record) => record.animalId == animal.id);
      final reminderIds = store.reminders.values
          .where((reminder) => reminder.animalId == animal.id)
          .map((reminder) => reminder.id)
          .toSet();
      for (final id in reminderIds) {
        store.reminders.remove(id);
      }
      store.completions.removeWhere((_, completion) => reminderIds.contains(completion.reminderId));
    });
    return CommandResult.success(
      commandId: commandId,
      revision: animal.revision + 1,
      data: {'animalId': animal.id, 'deleted': true},
    );
  }

  CommandResult _createRecord(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
  ) {
    final household = _requireHousehold(householdId);
    final member = _requireMember(household.id, 'record.create');
    final animal = _requireAnimal(household.id, _string(payload['animalId']));
    final occurredAt = parseDateValue(payload['occurredAt']);
    if (occurredAt == null) throw const _CommandError('VALIDATION_ERROR', 'occurredAt is required');
    final now = DateTime.now().toUtc();
    if (occurredAt.isAfter(now.add(const Duration(minutes: 5))) ||
        occurredAt.isBefore(now.subtract(const Duration(days: 365)))) {
      throw const _CommandError(
        'VALIDATION_ERROR',
        'occurredAt must be within the last 365 days and no more than 5 minutes in the future',
      );
    }
    final type = RecordType.tryParse(payload['type']);
    if (type == null) {
      throw const _CommandError('VALIDATION_ERROR', 'unknown record type');
    }
    final id = _nullableString(payload['recordId']) ?? newRecordId();
    final payloadHash = _fingerprint('record.create', payload, householdId, null);
    CareRecord? existing;
    for (final record in store.records) {
      if (record.id == id) {
        existing = record;
        break;
      }
    }
    if (existing != null) {
      // A record id is owned by its creator and payload. Reusing it with a
      // different body is a duplicate-id bug, not an idempotent replay.
      if (existing.createdBy != member.uid || existing.payloadHash != payloadHash) {
        throw const _CommandError('DUPLICATE_ID', 'record id already used');
      }
      return CommandResult.success(
        commandId: commandId,
        data: {'recordId': id, 'alreadyExists': true},
      );
    }
    final value = payload['value'];
    final record = CareRecord(
      id: id,
      householdId: household.id,
      animalId: animal.id,
      type: type,
      occurredAt: occurredAt,
      value: value is num ? value.toDouble() : null,
      unit: _nullableString(payload['unit']),
      note: _nullableString(payload['note']),
      source: 'ios',
      createdBy: member.uid,
      payloadHash: payloadHash,
    );
    store.mutate(() => store.records.add(record));
    return CommandResult.success(
      commandId: commandId,
      revision: 0,
      data: {'recordId': id},
    );
  }

  CommandResult _createReminder(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
  ) {
    final household = _requireHousehold(householdId);
    _requireMember(household.id, 'reminder.manage');
    final animal = _requireAnimal(household.id, _string(payload['animalId']));
    final title = _string(payload['title']).trim();
    if (title.isEmpty || title.length > 60) {
      throw const _CommandError('VALIDATION_ERROR', 'title must be 1-60 characters');
    }
    final schedule = ReminderSchedule.fromMap(_map(payload['schedule']));
    final timezone = _string(payload['timezone'], household.timezone);
    final now = DateTime.now().toUtc();
    final id = 'reminder_${_uuid.v4().replaceAll('-', '').substring(0, 16)}';
    final reminder = Reminder(
      id: id,
      householdId: household.id,
      animalId: animal.id,
      title: title,
      type: _string(payload['type'], 'feeding'),
      schedule: schedule,
      timezone: timezone,
      enabled: payload['enabled'] != false,
      revision: 0,
      nextDueAt: nextDueAt(schedule, timezone, DateTime.now().toUtc()),
      createdAt: now,
      updatedAt: now,
    );
    store.mutate(() => store.reminders[id] = reminder);
    return CommandResult.success(
      commandId: commandId,
      revision: 0,
      data: {
        'reminderId': id,
        'nextDueAt': reminder.nextDueAt?.toIso8601String(),
      },
    );
  }

  CommandResult _updateReminder(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
    int? baseRevision,
  ) {
    final household = _requireHousehold(householdId);
    _requireMember(household.id, 'reminder.manage');
    final reminder = _requireReminder(household.id, _string(payload['reminderId']));
    _assertRevision(reminder.revision, baseRevision, _reminderJson(reminder));

    final schedule = payload['schedule'] == null
        ? null
        : ReminderSchedule.fromMap(_map(payload['schedule']));
    final timezone = payload['timezone'] as String?;
    final enabled = payload['enabled'] is bool ? payload['enabled'] as bool : null;
    final enabledChanged = enabled != null && enabled != reminder.enabled;
    final reenabled = enabledChanged && enabled == true;
    final rescheduled = schedule != null || timezone != null || reenabled;
    final now = DateTime.now().toUtc();
    final changed = <String>[
      if (payload['title'] != null) 'title',
      if (payload['type'] != null) 'type',
      if (schedule != null) 'schedule',
      if (timezone != null) 'timezone',
      if (enabledChanged) 'enabled',
      if (rescheduled) 'nextDueAt',
      if (enabledChanged) 'enabledChangedAt',
    ];
    final nextSchedule = schedule ?? reminder.schedule;
    final nextTimezone = timezone ?? reminder.timezone;
    final next = Reminder(
      id: reminder.id,
      householdId: reminder.householdId,
      animalId: reminder.animalId,
      title: payload['title'] == null ? reminder.title : _string(payload['title']).trim(),
      type: payload['type'] == null ? reminder.type : _string(payload['type']),
      schedule: nextSchedule,
      timezone: nextTimezone,
      enabled: enabled ?? reminder.enabled,
      revision: reminder.revision + 1,
      nextDueAt: rescheduled
          ? nextDueAt(nextSchedule, nextTimezone, now)
          : reminder.nextDueAt,
      createdAt: reminder.createdAt,
      updatedAt: now,
      enabledChangedAt: enabledChanged ? now : reminder.enabledChangedAt,
      lastChangedFields: changed,
    );
    store.mutate(() => store.reminders[next.id] = next);
    return CommandResult.success(
      commandId: commandId,
      revision: next.revision,
      data: {'reminderId': next.id},
    );
  }

  CommandResult _deleteReminder(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
    int? baseRevision,
  ) {
    final household = _requireHousehold(householdId);
    _requireMember(household.id, 'reminder.manage');
    final reminder = _requireReminder(household.id, _string(payload['reminderId']));
    _assertRevision(reminder.revision, baseRevision, _reminderJson(reminder));
    store.mutate(() {
      store.reminders.remove(reminder.id);
      store.completions.removeWhere((_, completion) => completion.reminderId == reminder.id);
    });
    return CommandResult.success(
      commandId: commandId,
      revision: reminder.revision + 1,
      data: {'reminderId': reminder.id, 'deleted': true},
    );
  }

  CommandResult _completeTask(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
  ) {
    final household = _requireHousehold(householdId);
    final member = _requireMember(household.id, 'reminder.manage');
    final reminder = _requireReminder(household.id, _string(payload['reminderId']));
    final dueDate = _string(payload['dueDate']);
    final key = '${reminder.id}:$dueDate';
    final existing = store.completions[key];
    if (existing != null) {
      return CommandResult.success(
        commandId: commandId,
        data: {
          'completionId': key,
          'alreadyCompleted': true,
          'completedBy': existing.completedBy,
          'completedByName': existing.completedByName,
          'completedAt': existing.completedAt?.toIso8601String(),
        },
      );
    }
    final completedAt = DateTime.now().toUtc();
    final completion = Completion(
      reminderId: reminder.id,
      dueDate: dueDate,
      completedBy: member.uid,
      completedByName: member.displayName,
      completedAt: completedAt,
    );
    store.mutate(() => store.completions[key] = completion);
    return CommandResult.success(
      commandId: commandId,
      data: {
        'completionId': key,
        'completedBy': member.uid,
        'completedByName': member.displayName,
        'completedAt': completedAt.toIso8601String(),
      },
    );
  }

  CommandResult _uncompleteTask(
    String commandId,
    Map<String, dynamic> payload,
    String? householdId,
  ) {
    final household = _requireHousehold(householdId);
    final member = _requireMember(household.id, 'reminder.manage');
    final reminder = _requireReminder(household.id, _string(payload['reminderId']));
    final dueDate = _string(payload['dueDate']);
    final completion = store.completions['${reminder.id}:$dueDate'];
    if (completion == null) throw const _CommandError('NOT_FOUND', 'completion not found');
    if (member.role != MemberRole.owner && completion.completedBy != member.uid) {
      throw const _CommandError('FORBIDDEN', 'only the completer or an owner can undo');
    }
    store.mutate(() => store.completions.remove('${reminder.id}:$dueDate'));
    return CommandResult.success(
      commandId: commandId,
      data: {'completionId': '${reminder.id}:$dueDate', 'removed': true},
    );
  }

  CommandResult _updateProfile(String commandId, Map<String, dynamic> payload) {
    final currentUid = uid();
    final existing = store.users[currentUid] ??
        AppUser(uid: currentUid, displayName: currentUid, isMock: true);
    final defaultHouseholdId = payload['defaultHouseholdId'] as String?;
    if (defaultHouseholdId != null && store.memberOf(defaultHouseholdId, currentUid) == null) {
      throw const _CommandError('FORBIDDEN', 'not a household member');
    }
    final next = existing.copyWith(
      displayName: payload['displayName'] == null ? null : _string(payload['displayName']).trim(),
      timezone: payload['timezone'] as String?,
      locale: payload['locale'] as String?,
      defaultHouseholdId: defaultHouseholdId,
    );
    store.mutate(() => store.users[currentUid] = next);
    return CommandResult.success(commandId: commandId, data: {'updated': true});
  }

  Household _requireHousehold(String? householdId) {
    if (householdId == null || householdId.isEmpty) {
      throw const _CommandError('VALIDATION_ERROR', 'householdId is required');
    }
    final household = store.households[householdId];
    if (household == null) throw const _CommandError('NOT_FOUND', 'household not found');
    return household;
  }

  HouseholdMember _requireMember(String householdId, String action) {
    final member = store.memberOf(householdId, uid());
    if (member == null) throw _CommandError('FORBIDDEN', 'not a household member: $action');
    return member;
  }

  void _requireRole(String householdId, MemberRole role, String action) {
    final member = _requireMember(householdId, action);
    if (member.role != role) {
      throw _CommandError('FORBIDDEN', 'role ${member.role.name} cannot $action');
    }
  }

  Animal _requireAnimal(String householdId, String animalId) {
    final animal = store.animals[animalId];
    if (animal == null || animal.householdId != householdId || !animal.isActive) {
      throw const _CommandError('NOT_FOUND', 'animal not found');
    }
    return animal;
  }

  Reminder _requireReminder(String householdId, String reminderId) {
    final reminder = store.reminders[reminderId];
    if (reminder == null || reminder.householdId != householdId) {
      throw const _CommandError('NOT_FOUND', 'reminder not found');
    }
    return reminder;
  }

  void _assertRevision(int current, int? baseRevision, Map<String, dynamic> currentJson) {
    if (baseRevision == null) {
      throw const _CommandError('VALIDATION_ERROR', 'baseRevision is required');
    }
    if (current != baseRevision) {
      throw _CommandError(
        'CONFLICT',
        'stale revision',
        current: currentJson,
        currentRevision: current,
      );
    }
  }

  Map<String, dynamic> _animalJson(Animal animal) => {
    'id': animal.id,
    'householdId': animal.householdId,
    'name': animal.name,
    'species': animal.species,
    'speciesLabel': animal.speciesLabel,
    'morph': animal.morph,
    'sex': animal.sex,
    'avatarColor': animal.avatarColor,
    'notes': animal.notes,
    'birthDate': animal.birthDate,
    'status': animal.status,
    'revision': animal.revision,
  };

  Map<String, dynamic> _reminderJson(Reminder reminder) => {
    'id': reminder.id,
    'householdId': reminder.householdId,
    'animalId': reminder.animalId,
    'title': reminder.title,
    'type': reminder.type,
    'schedule': reminder.schedule.toJson(),
    'timezone': reminder.timezone,
    'enabled': reminder.enabled,
    'enabledChangedAt': reminder.enabledChangedAt?.toIso8601String(),
    'revision': reminder.revision,
  };

  Map<String, dynamic> _householdJson(Household household) => {
    'id': household.id,
    'name': household.name,
    'ownerUid': household.ownerUid,
    'timezone': household.timezone,
    'ownerCount': household.ownerCount,
    'memberCount': household.memberCount,
    'revision': household.revision,
  };

  CommandResult _failure(
    String commandId,
    String code,
    String message, {
    Map<String, dynamic>? current,
    int? currentRevision,
    List<String> lastChangedFields = const [],
  }) {
    return CommandResult.failure(
      commandId: commandId,
      code: code,
      message: message,
      current: current,
      currentRevision: currentRevision,
      lastChangedFields: lastChangedFields,
    );
  }

  static String _string(Object? value, [String fallback = '']) =>
      value is String ? value : fallback;

  static String? _nullableString(Object? value) {
    if (value is! String) return null;
    return value.trim().isEmpty ? null : value.trim();
  }

  static Map<String, dynamic> _map(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return const {};
  }

  static String _fingerprint(
    String type,
    Map<String, dynamic> payload,
    String? householdId,
    int? baseRevision,
  ) {
    return jsonEncode({
      'type': type,
      'payload': _canonical(payload),
      'householdId': householdId,
      'baseRevision': baseRevision,
    });
  }

  static Object? _canonical(Object? value) {
    if (value is Map) {
      final keys = value.keys.map((key) => key.toString()).toList()..sort();
      return {for (final key in keys) key: _canonical(value[key])};
    }
    if (value is List) return value.map(_canonical).toList();
    return value;
  }
}

class _CommandError implements Exception {
  const _CommandError(
    this.code,
    this.message, {
    this.current,
    this.currentRevision,
  });

  final String code;
  final String message;
  final Map<String, dynamic>? current;
  final int? currentRevision;
}
