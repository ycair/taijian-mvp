import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/species.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';

/// Reads the curated species catalog. Falls back to the bundled catalog when
/// the app is offline or running against the mock stack.
class SpeciesRepository {
  const SpeciesRepository(this._rest);

  final SupabaseRestClient? _rest;

  Future<List<Species>> fetchAll() async {
    final rest = _rest;
    if (rest == null) return speciesList;
    try {
      final rows = await rest.select(
        'species',
        query: 'select=*&active=eq.true&order=sort_order.asc',
      );
      if (rows.isEmpty) return speciesList;
      return rows
          .map((row) => _speciesFromRow(snakeToCamelMap(row)))
          .where((species) => species.id.isNotEmpty)
          .toList(growable: false);
    } catch (_) {
      return speciesList;
    }
  }

  static Species _speciesFromRow(Map<String, dynamic> row) {
    return Species(
      id: readString(row, 'id'),
      name: readString(row, 'name'),
      kingdom: readString(row, 'kingdom', 'animalia'),
      category: readString(row, 'category', 'other'),
      defaultColor: readString(row, 'defaultColor', '#7C9A76'),
      defaultPattern: readString(row, 'defaultPattern', 'solid'),
    );
  }
}

final speciesRepositoryProvider = Provider<SpeciesRepository>((ref) {
  return SpeciesRepository(ref.watch(appDependenciesProvider).rest);
});

final speciesCatalogProvider = FutureProvider<List<Species>>((ref) {
  return ref.watch(speciesRepositoryProvider).fetchAll();
});
