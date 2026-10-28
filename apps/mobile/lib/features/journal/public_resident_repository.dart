import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/supabase/supabase_rest_client.dart';
import 'public_resident_models.dart';

class PublicResidentException implements Exception {
  const PublicResidentException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => message;
}

class PublicResidentRepository {
  PublicResidentRepository({required this.rest});

  final SupabaseRestClient? rest;

  Future<PublicResident> fetch(String token) async {
    final client = rest;
    if (client == null) {
      throw const PublicResidentException('NOT_FOUND', '找不到這位居民。');
    }
    final response = await client.getFunction(
      'resident-public',
      query: {'token': token},
    );
    if (response['ok'] != true) {
      throw PublicResidentException(
        response['code'] as String? ?? 'INTERNAL',
        response['message'] as String? ?? '找不到這位居民。',
      );
    }
    return PublicResident.fromMap(response);
  }
}

final publicResidentRepositoryProvider = Provider<PublicResidentRepository>((ref) {
  return PublicResidentRepository(rest: ref.watch(appDependenciesProvider).rest);
});
