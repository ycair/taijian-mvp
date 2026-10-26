import '../../core/models/models.dart';

/// Converts PostgREST snake_case keys to the camelCase keys used by the
/// existing domain models. Nested maps and lists are converted recursively.
Map<String, dynamic> snakeToCamelMap(Map<String, dynamic> input) {
  return input.map(
    (key, value) => MapEntry(_camelKey(key), _convertValue(value)),
  );
}

String _camelKey(String key) {
  final parts = key.split('_');
  if (parts.length == 1) return key;
  return parts.first +
      parts
          .skip(1)
          .map(
            (part) =>
                part.isEmpty ? '' : part[0].toUpperCase() + part.substring(1),
          )
          .join();
}

dynamic _convertValue(dynamic value) {
  if (value is Map) return snakeToCamelMap(Map<String, dynamic>.from(value));
  if (value is List) return value.map(_convertValue).toList(growable: false);
  return value;
}

AppUser appUserFromSupabase(
  Map<String, dynamic> profile,
  List<Map<String, dynamic>> memberships,
) {
  final row = snakeToCamelMap(profile);
  final householdIds = <String>[];
  for (final membership in memberships) {
    final id = membership['household_id'];
    if (id is String && id.isNotEmpty && !householdIds.contains(id)) {
      householdIds.add(id);
    }
  }
  final displayName = readString(row, 'displayName', '苔友').trim();
  return AppUser(
    uid: readString(row, 'id'),
    displayName: displayName.isEmpty ? '苔友' : displayName,
    avatarUrl: _nullableString(row['avatarUrl']),
    timezone: readString(row, 'timezone', 'Asia/Taipei'),
    householdIds: householdIds,
    defaultHouseholdId: _nullableString(row['defaultHouseholdId']),
  );
}

Household householdFromSupabase(Map<String, dynamic> row) {
  final map = snakeToCamelMap(row);
  final ownerId =
      _nullableString(map['ownerId']) ?? readString(map, 'ownerUid');
  return Household(
    id: readString(map, 'id'),
    name: readString(map, 'name', '我的家庭'),
    ownerUid: ownerId,
    timezone: readString(map, 'timezone', 'Asia/Taipei'),
    ownerCount: readInt(map, 'ownerCount', 1),
    memberCount: readInt(map, 'memberCount', 1),
    revision: readInt(map, 'revision'),
  );
}

HouseholdMember memberFromSupabase(Map<String, dynamic> row) {
  final map = snakeToCamelMap(row);
  final profile = map['profiles'];
  final profileMap = profile is Map
      ? Map<String, dynamic>.from(profile)
      : const <String, dynamic>{};
  return HouseholdMember(
    uid: readString(map, 'userId'),
    role: MemberRole.parse(map['role']),
    displayName: readString(profileMap, 'displayName', '家人'),
    avatarUrl: _nullableString(profileMap['avatarUrl']),
  );
}

Animal animalFromSupabase(Map<String, dynamic> row) {
  final map = snakeToCamelMap(row);
  return Animal.fromMap(readString(map, 'id'), map);
}

CareRecord recordFromSupabase(Map<String, dynamic> row) {
  final map = snakeToCamelMap(row);
  return CareRecord.fromMap(readString(map, 'id'), map);
}

Reminder reminderFromSupabase(Map<String, dynamic> row) {
  final map = snakeToCamelMap(row);
  return Reminder.fromMap(readString(map, 'id'), map);
}

Completion completionFromSupabase(Map<String, dynamic> row) {
  final map = snakeToCamelMap(row);
  return Completion.fromMap(map);
}

String? _nullableString(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
