import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';

class RecordAnalyticsRequest {
  const RecordAnalyticsRequest({
    required this.animalId,
    required this.from,
    required this.to,
  });

  final String? animalId;
  final DateTime from;
  final DateTime to;

  @override
  bool operator ==(Object other) =>
      other is RecordAnalyticsRequest &&
      other.animalId == animalId &&
      other.from == from &&
      other.to == to;

  @override
  int get hashCode => Object.hash(animalId, from, to);
}

class RecordAnalyticsRepository {
  RecordAnalyticsRepository({
    required this.rest,
    required this.householdId,
    required this.timezone,
  });

  final SupabaseRestClient? rest;
  final String? householdId;
  final String timezone;

  Future<RecordAnalytics> fetch(RecordAnalyticsRequest request) async {
    final client = rest;
    if (client == null || householdId == null) return const RecordAnalytics();
    final rows = await client.rpc('record_analytics', {
      'p_household_id': householdId,
      'p_animal_id': request.animalId,
      'p_from': request.from.toUtc().toIso8601String(),
      'p_to': request.to.toUtc().toIso8601String(),
      'p_timezone': timezone,
    });
    if (rows.isEmpty) return const RecordAnalytics();
    final row = Map<String, dynamic>.from(rows.first as Map);
    return RecordAnalytics.fromRow(snakeToCamelMap(row));
  }
}

final recordAnalyticsRepositoryProvider = Provider<RecordAnalyticsRepository>((ref) {
  return RecordAnalyticsRepository(
    rest: ref.watch(appDependenciesProvider).rest,
    householdId: ref.watch(householdIdProvider),
    timezone: ref.watch(householdTimezoneProvider),
  );
});

final recordAnalyticsProvider = FutureProvider.family<RecordAnalytics, RecordAnalyticsRequest>((
  ref,
  request,
) {
  ref.watch(householdIdProvider);
  ref.watch(householdTimezoneProvider);
  final repository = ref.watch(recordAnalyticsRepositoryProvider);
  final remote = repository.fetch(request);
  if (repository.rest != null) return remote;
  final records = ref.watch(recordsProvider).value ?? const <CareRecord>[];
  return RecordAnalytics.fromRecords(
    records: records,
    from: request.from,
    to: request.to,
    animalId: request.animalId,
  );
});
