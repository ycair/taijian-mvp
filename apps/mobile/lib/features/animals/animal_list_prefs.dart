import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AnimalListPrefs {
  const AnimalListPrefs({
    this.groups = const [],
    this.animalGroups = const {},
    this.order = const [],
    this.sortMode = 'custom',
  });

  factory AnimalListPrefs.fromJson(Map<String, dynamic> json) {
    final groups = _stringList(json['groups']);
    final order = _stringList(json['order']);
    final rawGroups = json['animalGroups'];
    final animalGroups = <String, String>{};
    if (rawGroups is Map) {
      for (final entry in rawGroups.entries) {
        if (entry.key is String && entry.value is String) {
          animalGroups[entry.key as String] = entry.value as String;
        }
      }
    }
    final sortMode = json['sortMode'] is String ? json['sortMode'] as String : 'custom';
    return AnimalListPrefs(
      groups: groups,
      animalGroups: animalGroups,
      order: order,
      sortMode: ['custom', 'name'].contains(sortMode) ? sortMode : 'custom',
    );
  }

  final List<String> groups;
  final Map<String, String> animalGroups;
  final List<String> order;
  final String sortMode;

  Map<String, dynamic> toJson() => {
    'groups': groups,
    'animalGroups': animalGroups,
    'order': order,
    'sortMode': sortMode,
  };

  AnimalListPrefs copyWith({
    List<String>? groups,
    Map<String, String>? animalGroups,
    List<String>? order,
    String? sortMode,
  }) {
    return AnimalListPrefs(
      groups: groups ?? this.groups,
      animalGroups: animalGroups ?? this.animalGroups,
      order: order ?? this.order,
      sortMode: sortMode ?? this.sortMode,
    );
  }

  static List<String> _stringList(Object? value) {
    if (value is! List) return const [];
    return value.whereType<String>().where((item) => item.trim().isNotEmpty).toList(growable: false);
  }
}

class AnimalListPrefsStore {
  static String keyFor(String uid, String? householdId) =>
      'animal_list:${uid.isEmpty ? 'anonymous' : uid}:${householdId ?? 'none'}';

  Future<AnimalListPrefs> load({
    required String uid,
    required String? householdId,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(keyFor(uid, householdId));
      if (raw == null || raw.isEmpty) return const AnimalListPrefs();
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return const AnimalListPrefs();
      return AnimalListPrefs.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      return const AnimalListPrefs();
    }
  }

  Future<void> save({
    required String uid,
    required String? householdId,
    required AnimalListPrefs prefs,
  }) async {
    final store = await SharedPreferences.getInstance();
    await store.setString(keyFor(uid, householdId), jsonEncode(prefs.toJson()));
  }
}

final animalListPrefsStoreProvider = Provider<AnimalListPrefsStore>(
  (ref) => AnimalListPrefsStore(),
);
