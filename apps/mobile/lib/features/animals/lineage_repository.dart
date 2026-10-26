import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';

class LineageRepository {
  LineageRepository({required this.commands, required this.rest, required this.householdId});

  final CommandService commands;
  final SupabaseRestClient? rest;
  final String? householdId;

  Future<LineageGraph> fetch(String animalId) async {
    final client = rest;
    if (client == null) return const LineageGraph();
    final rows = await client.rpc('lineage_for_animal', {'p_animal_id': animalId});
    return LineageGraph.fromRows(
      rows.map((row) => snakeToCamelMap(row)).toList(growable: false),
    );
  }

  Future<void> add({required String parentId, required String childId}) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'lineage.add',
      {'parentId': parentId, 'childId': childId},
      householdId: householdId,
    );
  }

  Future<void> remove(LineageRelative relative) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'lineage.remove',
      {'edgeId': relative.edgeId},
      householdId: householdId,
    );
  }
}

final lineageRepositoryProvider = Provider<LineageRepository>((ref) {
  return LineageRepository(
    commands: ref.watch(commandServiceProvider),
    rest: ref.watch(appDependenciesProvider).rest,
    householdId: ref.watch(householdIdProvider),
  );
});

final lineageProvider = FutureProvider.family<LineageGraph, String>((ref, animalId) {
  ref.watch(householdIdProvider);
  return ref.watch(lineageRepositoryProvider).fetch(animalId);
});
