import '../../core/models/models.dart';

class PublicResidentProfile {
  const PublicResidentProfile({
    required this.name,
    required this.species,
    required this.speciesLabel,
    required this.morph,
    required this.sex,
    required this.avatarColor,
    required this.avatarPattern,
    required this.status,
  });

  factory PublicResidentProfile.fromMap(Map<String, dynamic> map) {
    return PublicResidentProfile(
      name: readString(map, 'name', '居民'),
      species: readString(map, 'species'),
      speciesLabel: readString(map, 'speciesLabel'),
      morph: _nullableString(map['morph']),
      sex: readString(map, 'sex', 'unknown'),
      avatarColor: readString(map, 'avatarColor', '#7C9A76'),
      avatarPattern: readString(map, 'avatarPattern', 'solid'),
      status: readString(map, 'status', 'active'),
    );
  }

  final String name;
  final String species;
  final String speciesLabel;
  final String? morph;
  final String sex;
  final String avatarColor;
  final String avatarPattern;
  final String status;

  String get sexLabel => switch (sex) {
    'male' => '公',
    'female' => '母',
    _ => '未知',
  };

  String get statusLabel => status == 'memorial' ? '紀念居民' : '生活居民';
}

class PublicResidentRecord {
  const PublicResidentRecord({
    required this.type,
    required this.occurredAt,
    required this.value,
    required this.unit,
    required this.note,
    required this.metadata,
  });

  factory PublicResidentRecord.fromMap(Map<String, dynamic> map) {
    final metadata = map['metadata'];
    return PublicResidentRecord(
      type: readString(map, 'type', 'note'),
      occurredAt: readDate(map, 'occurredAt') ?? DateTime.now().toUtc(),
      value: readDouble(map, 'value'),
      unit: _nullableString(map['unit']),
      note: _nullableString(map['note']),
      metadata: metadata is Map
          ? Map<String, dynamic>.from(metadata)
          : const <String, dynamic>{},
    );
  }

  final String type;
  final DateTime occurredAt;
  final double? value;
  final String? unit;
  final String? note;
  final Map<String, dynamic> metadata;

  String get label => switch (type) {
    'feeding' => '餵食',
    'water' => '換水',
    'weight' => '體重',
    'length' => '身長',
    'poop' => '排便',
    'shed' => '蛻皮',
    'activity' => '活動',
    'medical' => '醫療',
    'note' => '備註',
    'custom' => '自訂',
    _ => type,
  };

  String? get food => _nullableString(metadata['food']);

  String? get detail {
    if (value != null) {
      final number = value == value!.roundToDouble()
          ? value!.toInt().toString()
          : value!.toStringAsFixed(1);
      return '$number${unit == null ? '' : ' $unit'}';
    }
    return note;
  }
}

class PublicResidentRelative {
  const PublicResidentRelative({
    required this.relation,
    required this.isPublic,
    required this.name,
    required this.speciesLabel,
    required this.avatarColor,
    required this.avatarPattern,
    required this.token,
  });

  factory PublicResidentRelative.fromMap(Map<String, dynamic> map) {
    return PublicResidentRelative(
      relation: readString(map, 'relation', 'parent'),
      isPublic: map['public'] == true,
      name: _nullableString(map['name']),
      speciesLabel: _nullableString(map['speciesLabel']),
      avatarColor: _nullableString(map['avatarColor']),
      avatarPattern: _nullableString(map['avatarPattern']),
      token: _nullableString(map['token']),
    );
  }

  final String relation;
  final bool isPublic;
  final String? name;
  final String? speciesLabel;
  final String? avatarColor;
  final String? avatarPattern;
  final String? token;

  bool get canOpen => isPublic && token != null;
}

class PublicResident {
  const PublicResident({
    required this.profile,
    required this.records,
    required this.parents,
    required this.children,
  });

  factory PublicResident.fromMap(Map<String, dynamic> map) {
    final resident = map['resident'];
    final relatives = map['relatives'];
    final parentList = relatives is Map ? relatives['parents'] : null;
    final childList = relatives is Map ? relatives['children'] : null;
    return PublicResident(
      profile: PublicResidentProfile.fromMap(
        resident is Map ? Map<String, dynamic>.from(resident) : const {},
      ),
      records: _mapList(map['records'])
          .map(PublicResidentRecord.fromMap)
          .toList(growable: false),
      parents: _mapList(parentList)
          .map(PublicResidentRelative.fromMap)
          .toList(growable: false),
      children: _mapList(childList)
          .map(PublicResidentRelative.fromMap)
          .toList(growable: false),
    );
  }

  final PublicResidentProfile profile;
  final List<PublicResidentRecord> records;
  final List<PublicResidentRelative> parents;
  final List<PublicResidentRelative> children;

  String publicUrl(String token) =>
      'https://heartfelt-sherbet-c689e3.netlify.app/r/$token';
}

List<Map<String, dynamic>> _mapList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList(growable: false);
}

String? _nullableString(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
