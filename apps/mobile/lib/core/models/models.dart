import '../time/app_time.dart';

String readString(Map<String, dynamic> map, String key, [String fallback = '']) {
  final value = map[key];
  return value is String ? value : fallback;
}

int readInt(Map<String, dynamic> map, String key, [int fallback = 0]) {
  final value = map[key];
  if (value is int) return value;
  if (value is num) return value.toInt();
  return fallback;
}

double? readDouble(Map<String, dynamic> map, String key) {
  final value = map[key];
  if (value is num) return value.toDouble();
  return null;
}

DateTime? readDate(Map<String, dynamic> map, String key) => parseDateValue(map[key]);

List<String> readStringList(Map<String, dynamic> map, String key) {
  final value = map[key];
  if (value is List) {
    return value.whereType<String>().toList(growable: false);
  }
  return const [];
}

Map<String, dynamic> readMap(Map<String, dynamic> map, String key) {
  final value = map[key];
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return const {};
}

class AppUser {
  const AppUser({
    required this.uid,
    required this.displayName,
    this.avatarUrl,
    this.locale = 'zh-TW',
    this.timezone = 'Asia/Taipei',
    this.householdIds = const [],
    this.defaultHouseholdId,
    this.isMock = false,
  });

  factory AppUser.fromMap(String uid, Map<String, dynamic> map, {bool isMock = false}) {
    return AppUser(
      uid: uid,
      displayName: readString(map, 'displayName', uid),
      avatarUrl: (map['avatarUrl'] as String?)?.trim().isEmpty == true ? null : map['avatarUrl'] as String?,
      locale: readString(map, 'locale', 'zh-TW'),
      timezone: readString(map, 'timezone', 'Asia/Taipei'),
      householdIds: readStringList(map, 'householdIds'),
      defaultHouseholdId: map['defaultHouseholdId'] as String?,
      isMock: isMock,
    );
  }

  final String uid;
  final String displayName;
  final String? avatarUrl;
  final String locale;
  final String timezone;
  final List<String> householdIds;
  final String? defaultHouseholdId;
  final bool isMock;

  String get initial => displayName.trim().isEmpty ? '苔' : displayName.trim().substring(0, 1);

  AppUser copyWith({
    String? displayName,
    String? avatarUrl,
    String? locale,
    String? timezone,
    List<String>? householdIds,
    String? defaultHouseholdId,
  }) {
    return AppUser(
      uid: uid,
      displayName: displayName ?? this.displayName,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      locale: locale ?? this.locale,
      timezone: timezone ?? this.timezone,
      householdIds: householdIds ?? this.householdIds,
      defaultHouseholdId: defaultHouseholdId ?? this.defaultHouseholdId,
      isMock: isMock,
    );
  }
}

class Household {
  const Household({
    required this.id,
    required this.name,
    required this.ownerUid,
    required this.timezone,
    this.ownerCount = 1,
    this.memberCount = 1,
    this.revision = 0,
    this.notificationsEnabled = true,
  });

  factory Household.fromMap(String id, Map<String, dynamic> map) {
    final settings = readMap(map, 'settings');
    return Household(
      id: id,
      name: readString(map, 'name', '我的家庭'),
      ownerUid: readString(map, 'ownerUid'),
      timezone: readString(map, 'timezone', 'Asia/Taipei'),
      ownerCount: readInt(map, 'ownerCount', 1),
      memberCount: readInt(map, 'memberCount', 1),
      revision: readInt(map, 'revision'),
      notificationsEnabled: settings['notificationsEnabled'] != false,
    );
  }

  final String id;
  final String name;
  final String ownerUid;
  final String timezone;
  final int ownerCount;
  final int memberCount;
  final int revision;
  final bool notificationsEnabled;

  Household copyWith({
    String? name,
    String? timezone,
    int? revision,
    bool? notificationsEnabled,
  }) {
    return Household(
      id: id,
      name: name ?? this.name,
      ownerUid: ownerUid,
      timezone: timezone ?? this.timezone,
      ownerCount: ownerCount,
      memberCount: memberCount,
      revision: revision ?? this.revision,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
    );
  }
}

enum MemberRole {
  owner,
  caretaker;

  static MemberRole parse(Object? value) =>
      value == 'owner' ? MemberRole.owner : MemberRole.caretaker;

  String get label => this == MemberRole.owner ? '屋主' : '代管人';
}

class HouseholdMember {
  const HouseholdMember({
    required this.uid,
    required this.role,
    required this.displayName,
    this.avatarUrl,
  });

  factory HouseholdMember.fromMap(String uid, Map<String, dynamic> map) {
    return HouseholdMember(
      uid: uid,
      role: MemberRole.parse(map['role']),
      displayName: readString(map, 'displayName', '家人'),
      avatarUrl: map['avatarUrl'] as String?,
    );
  }

  final String uid;
  final MemberRole role;
  final String displayName;
  final String? avatarUrl;
}

class Animal {
  const Animal({
    required this.id,
    required this.householdId,
    required this.name,
    required this.species,
    required this.speciesLabel,
    required this.avatarColor,
    required this.status,
    required this.revision,
    this.avatarPattern = 'solid',
    this.morph,
    this.sex = 'unknown',
    this.notes,
    this.birthDate,
    this.adoptionDate,
    this.memorialAt,
    this.memorialNote,
  });

  factory Animal.fromMap(String id, Map<String, dynamic> map) {
    return Animal(
      id: id,
      householdId: readString(map, 'householdId'),
      name: readString(map, 'name', '未命名居民'),
      species: readString(map, 'species', 'other'),
      speciesLabel: readString(map, 'speciesLabel'),
      avatarColor: readString(map, 'avatarColor', '#7C9A76'),
      avatarPattern: readString(map, 'avatarPattern', 'solid'),
      status: readString(map, 'status', 'active'),
      revision: readInt(map, 'revision'),
      morph: (map['morph'] as String?)?.trim().isEmpty == true ? null : map['morph'] as String?,
      sex: readString(map, 'sex', 'unknown'),
      notes: map['notes'] as String?,
      birthDate: map['birthDate'] as String?,
      adoptionDate: map['adoptionDate'] as String?,
      memorialAt: readDate(map, 'memorialAt'),
      memorialNote: (map['memorialNote'] as String?)?.trim().isEmpty == true
          ? null
          : map['memorialNote'] as String?,
    );
  }

  final String id;
  final String householdId;
  final String name;
  final String species;
  final String speciesLabel;
  final String avatarColor;
  final String avatarPattern;
  final String status;
  final int revision;
  final String? morph;
  final String sex;
  final String? notes;
  final String? birthDate;
  final String? adoptionDate;
  final DateTime? memorialAt;
  final String? memorialNote;

  bool get isActive => status == 'active';

  bool get isMemorial => status == 'memorial';

  String get displaySpecies => speciesLabel.isNotEmpty ? speciesLabel : species;

  String get initial => name.trim().isEmpty ? '?' : name.trim().substring(0, 1);

  Animal copyWith({
    int? revision,
    String? name,
    String? species,
    String? speciesLabel,
    String? avatarColor,
    String? avatarPattern,
    String? status,
    String? morph,
    String? sex,
    String? notes,
    String? birthDate,
    String? adoptionDate,
    DateTime? memorialAt,
    String? memorialNote,
  }) {
    return Animal(
      id: id,
      householdId: householdId,
      name: name ?? this.name,
      species: species ?? this.species,
      speciesLabel: speciesLabel ?? this.speciesLabel,
      avatarColor: avatarColor ?? this.avatarColor,
      avatarPattern: avatarPattern ?? this.avatarPattern,
      status: status ?? this.status,
      revision: revision ?? this.revision,
      morph: morph ?? this.morph,
      sex: sex ?? this.sex,
      notes: notes ?? this.notes,
      birthDate: birthDate ?? this.birthDate,
      adoptionDate: adoptionDate ?? this.adoptionDate,
      memorialAt: memorialAt ?? this.memorialAt,
      memorialNote: memorialNote ?? this.memorialNote,
    );
  }
}

enum RecordType {
  feeding,
  water,
  weight,
  poop,
  shed,
  activity,
  medical,
  note,
  custom;

  /// Strict parser for command payloads and stored documents. Unknown values
  /// are a validation error, never silently downgraded to `note`.
  static RecordType parse(Object? value) {
    final parsed = tryParse(value);
    if (parsed == null) throw FormatException('unknown record type: $value');
    return parsed;
  }

  static RecordType? tryParse(Object? value) {
    if (value is! String) return null;
    for (final type in RecordType.values) {
      if (type.name == value) return type;
    }
    return null;
  }

  String get label => switch (this) {
    RecordType.feeding => '餵食',
    RecordType.water => '換水',
    RecordType.weight => '體重',
    RecordType.poop => '排便',
    RecordType.shed => '蛻皮',
    RecordType.activity => '活動',
    RecordType.medical => '醫療',
    RecordType.note => '備註',
    RecordType.custom => '自訂',
  };
}

class CareRecord {
  const CareRecord({
    required this.id,
    required this.householdId,
    required this.animalId,
    required this.type,
    required this.occurredAt,
    this.value,
    this.unit,
    this.note,
    this.source = 'ios',
    this.revision = 0,
    this.createdBy,
    this.payloadHash,
  });

  factory CareRecord.fromMap(String id, Map<String, dynamic> map) {
    return CareRecord(
      id: id,
      householdId: readString(map, 'householdId'),
      animalId: readString(map, 'animalId'),
      type: RecordType.parse(map['type']),
      occurredAt: readDate(map, 'occurredAt') ?? DateTime.now().toUtc(),
      value: readDouble(map, 'value'),
      unit: map['unit'] as String?,
      note: (map['note'] as String?)?.trim(),
      source: readString(map, 'source', 'ios'),
      revision: readInt(map, 'revision'),
      createdBy: map['createdBy'] as String?,
      payloadHash: map['payloadHash'] as String?,
    );
  }

  final String id;
  final String householdId;
  final String animalId;
  final RecordType type;
  final DateTime occurredAt;
  final double? value;
  final String? unit;
  final String? note;
  final String source;
  final int revision;
  final String? createdBy;
  final String? payloadHash;

  String get summary {
    if (note != null && note!.isNotEmpty) return note!;
    final valueText = value == null
        ? ''
        : (value == value!.roundToDouble() ? value!.toInt().toString() : value.toString());
    return '$valueText ${unit ?? ''}'.trim();
  }
}

class ReminderSchedule {
  const ReminderSchedule({
    required this.kind,
    required this.times,
    this.weekdays = const [],
    this.everyNDays,
    this.startDate,
  });

  factory ReminderSchedule.fromMap(Map<String, dynamic> map) {
    final kind = readString(map, 'kind', 'daily');
    final everyNDays = map['everyNDays'];
    return ReminderSchedule(
      kind: kind == 'weekly' || kind == 'interval' ? kind : 'daily',
      times: readStringList(map, 'times').isEmpty
          ? const ['08:30']
          : readStringList(map, 'times'),
      weekdays: (map['weekdays'] as List?)?.whereType<num>().map((e) => e.toInt()).toList() ?? const [],
      everyNDays: everyNDays is num ? everyNDays.toInt() : null,
      startDate: map['startDate'] as String?,
    );
  }

  final String kind;
  final List<String> times;
  final List<int> weekdays;
  final int? everyNDays;
  final String? startDate;

  String get time => times.isEmpty ? '08:30' : times.first;

  String get label {
    switch (kind) {
      case 'weekly':
        final days = weekdays.map(weekdayLabel).join('、');
        return '每週$days $time';
      case 'interval':
        return '每 ${everyNDays ?? 1} 天 $time';
      default:
        return '每天 $time';
    }
  }

  Map<String, dynamic> toJson() => {
    'kind': kind,
    'times': [time],
    if (kind == 'weekly') 'weekdays': weekdays,
    if (kind == 'interval') ...{
      'everyNDays': everyNDays ?? 1,
      'startDate': startDate ?? formatDateKey(DateTime.now().year, DateTime.now().month, DateTime.now().day),
    },
  };
}

class Reminder {
  const Reminder({
    required this.id,
    required this.householdId,
    required this.animalId,
    required this.title,
    required this.type,
    required this.schedule,
    required this.timezone,
    required this.enabled,
    required this.revision,
    this.nextDueAt,
    this.createdAt,
    this.updatedAt,
    this.enabledChangedAt,
    this.lastChangedFields = const [],
  });

  factory Reminder.fromMap(String id, Map<String, dynamic> map) {
    return Reminder(
      id: id,
      householdId: readString(map, 'householdId'),
      animalId: readString(map, 'animalId'),
      title: readString(map, 'title', '照護提醒'),
      type: readString(map, 'type', 'feeding'),
      schedule: ReminderSchedule.fromMap(readMap(map, 'schedule')),
      timezone: readString(map, 'timezone', 'Asia/Taipei'),
      enabled: map['enabled'] != false,
      revision: readInt(map, 'revision'),
      nextDueAt: readDate(map, 'nextDueAt'),
      createdAt: readDate(map, 'createdAt'),
      updatedAt: readDate(map, 'updatedAt'),
      enabledChangedAt: readDate(map, 'enabledChangedAt'),
      lastChangedFields: readStringList(map, 'lastChangedFields'),
    );
  }

  final String id;
  final String householdId;
  final String animalId;
  final String title;
  final String type;
  final ReminderSchedule schedule;
  final String timezone;
  final bool enabled;
  final int revision;
  final DateTime? nextDueAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Set by the server only when `enabled` actually transitions. Today uses
  /// this as the floor for a re-enabled reminder.
  final DateTime? enabledChangedAt;
  final List<String> lastChangedFields;

  Reminder copyWith({
    String? title,
    String? type,
    ReminderSchedule? schedule,
    String? timezone,
    bool? enabled,
    int? revision,
    DateTime? nextDueAt,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? enabledChangedAt,
    List<String>? lastChangedFields,
  }) {
    return Reminder(
      id: id,
      householdId: householdId,
      animalId: animalId,
      title: title ?? this.title,
      type: type ?? this.type,
      schedule: schedule ?? this.schedule,
      timezone: timezone ?? this.timezone,
      enabled: enabled ?? this.enabled,
      revision: revision ?? this.revision,
      nextDueAt: nextDueAt ?? this.nextDueAt,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      enabledChangedAt: enabledChangedAt ?? this.enabledChangedAt,
      lastChangedFields: lastChangedFields ?? this.lastChangedFields,
    );
  }
}

class Completion {
  const Completion({
    required this.reminderId,
    required this.dueDate,
    this.completedBy,
    this.completedByName,
    this.completedAt,
  });

  factory Completion.fromMap(Map<String, dynamic> map) {
    return Completion(
      reminderId: readString(map, 'reminderId'),
      dueDate: readString(map, 'dueDate'),
      completedBy: map['completedBy'] as String?,
      completedByName: map['completedByName'] as String?,
      completedAt: readDate(map, 'completedAt'),
    );
  }

  final String reminderId;
  final String dueDate;
  final String? completedBy;
  final String? completedByName;
  final DateTime? completedAt;

  String get key => '$reminderId:$dueDate';
}
