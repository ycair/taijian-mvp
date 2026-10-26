import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';

class TransferRepository {
  TransferRepository({
    required this.commands,
    required this.rest,
    required this.householdId,
  });

  final CommandService commands;
  final SupabaseRestClient? rest;
  final String? householdId;

  Future<List<AnimalTransfer>> fetchAll() async {
    final client = rest;
    if (client == null) return const [];
    final rows = await client.rpc('list_animal_transfers', {});
    return rows
        .map((row) => snakeToCamelMap(row))
        .map(AnimalTransfer.fromMap)
        .toList(growable: false);
  }

  Future<void> createOwn({
    required Animal animal,
    required String targetHouseholdId,
  }) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'transfer.create',
      {
        'animalIds': [animal.id],
        'transferType': 'own',
        'targetHouseholdId': targetHouseholdId,
      },
      householdId: householdId,
    );
  }

  Future<void> createOther({
    required Animal animal,
    required String targetUserId,
    String? note,
  }) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'transfer.create',
      {
        'animalIds': [animal.id],
        'transferType': 'other',
        'targetUserId': targetUserId.trim(),
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
      householdId: householdId,
    );
  }

  Future<void> accept({
    required AnimalTransfer transfer,
    required String targetHouseholdId,
  }) async {
    await commands.submit(
      'transfer.accept',
      {
        'transferId': transfer.id,
        'targetHouseholdId': targetHouseholdId,
      },
      householdId: targetHouseholdId,
    );
  }

  Future<void> decline(AnimalTransfer transfer) async {
    await commands.submit('transfer.decline', {'transferId': transfer.id});
  }

  Future<void> cancel(AnimalTransfer transfer) async {
    await commands.submit(
      'transfer.cancel',
      {'transferId': transfer.id},
      householdId: householdId,
    );
  }
}

final transferRepositoryProvider = Provider<TransferRepository>((ref) {
  return TransferRepository(
    commands: ref.watch(commandServiceProvider),
    rest: ref.watch(appDependenciesProvider).rest,
    householdId: ref.watch(householdIdProvider),
  );
});

final transfersProvider = FutureProvider<List<AnimalTransfer>>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(transferRepositoryProvider).fetchAll();
});

final ownedHouseholdsProvider = FutureProvider<List<Household>>((ref) async {
  final user = ref.watch(appUserProvider).value;
  final rest = ref.watch(appDependenciesProvider).rest;
  if (user == null || user.householdIds.isEmpty || rest == null) return const [];
  final ids = user.householdIds.map(Uri.encodeQueryComponent).join(',');
  final rows = await rest.select(
    'households',
    query: 'select=*&id=in.($ids)&deleted_at=is.null&order=name.asc',
  );
  return rows.map(householdFromSupabase).toList(growable: false);
});
