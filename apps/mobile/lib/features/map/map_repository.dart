import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';
import 'map_models.dart';

class MapRepository {
  MapRepository({required this.rest, required this.commands, required this.householdId});

  final SupabaseRestClient? rest;
  final CommandService commands;
  final String? householdId;

  static const _fallbackZones = <MapZone>[
    MapZone(id: 'fallback-yard', name: '苔庭', x: .06, y: .08, w: .38, h: .34, color: '#EEF4E8', revision: 0),
    MapZone(id: 'fallback-water', name: '水盆', x: .55, y: .09, w: .36, h: .30, color: '#DDEAF0', revision: 0),
    MapZone(id: 'fallback-hide', name: '躲藏', x: .10, y: .55, w: .34, h: .34, color: '#F4E5C8', revision: 0),
    MapZone(id: 'fallback-bask', name: '曬台', x: .55, y: .50, w: .35, h: .36, color: '#F7DFC8', revision: 0),
  ];

  Future<List<MapZone>> fetchZones() async {
    final client = rest;
    final household = householdId;
    if (client == null || household == null) return _fallbackZones;
    final rows = await client.select(
      'map_zones',
      query: 'select=*&household_id=eq.${Uri.encodeQueryComponent(household)}&deleted_at=is.null&order=sort_order.asc',
    );
    return rows.map((row) => MapZone.fromMap(snakeToCamelMap(row))).toList(growable: false);
  }

  Future<Map<String, AnimalPosition>> fetchPositions() async {
    final client = rest;
    final household = householdId;
    if (client == null || household == null) return const {};
    final rows = await client.select(
      'animal_positions',
      query: 'select=*&household_id=eq.${Uri.encodeQueryComponent(household)}',
    );
    return {
      for (final row in rows)
        if (row['animal_id'] is String)
          row['animal_id'] as String: AnimalPosition.fromMap(snakeToCamelMap(row)),
    };
  }

  Future<void> ensureDefaults() async {
    if (householdId == null) return;
    await commands.submit('map.ensureDefaults', {}, householdId: householdId);
  }

  Future<void> move(String animalId, double x, double y) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'map.move',
      {'animalId': animalId, 'x': x, 'y': y},
      householdId: householdId,
    );
  }

  Future<void> addZone(String name) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'map.zone.create',
      {'name': name, 'x': 0.36, 'y': 0.36, 'w': 0.28, 'h': 0.24, 'color': '#EEF4E8'},
      householdId: householdId,
    );
  }

  Future<void> deleteZone(MapZone zone) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'map.zone.delete',
      {'zoneId': zone.id},
      householdId: householdId,
      baseRevision: zone.revision,
    );
  }
}

final mapRepositoryProvider = Provider<MapRepository>((ref) {
  return MapRepository(
    rest: ref.watch(appDependenciesProvider).rest,
    commands: ref.watch(commandServiceProvider),
    householdId: ref.watch(householdIdProvider),
  );
});

final mapZonesProvider = FutureProvider<List<MapZone>>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(mapRepositoryProvider).fetchZones();
});

final mapPositionsProvider = FutureProvider<Map<String, AnimalPosition>>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(mapRepositoryProvider).fetchPositions();
});
