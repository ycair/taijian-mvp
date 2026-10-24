import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/command_result.dart';
import '../auth/auth_service.dart';

class InviteResult {
  const InviteResult({required this.token, this.expiresAt});

  final String token;
  final DateTime? expiresAt;
}

class HouseholdRepository {
  HouseholdRepository({
    required this.commands,
    required this.auth,
    required this.householdId,
  });

  final CommandService commands;
  final AuthService auth;
  final String? householdId;

  Future<CommandResult> create({required String name, required String timezone}) {
    return commands.runNow('household.create', {'name': name, 'timezone': timezone});
  }

  Future<void> updateName({required String name, required int revision}) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'household.update',
      {'name': name},
      householdId: householdId,
      baseRevision: revision,
      targetId: 'household:$householdId',
    );
  }

  Future<void> updateTimezone({required String timezone, required int revision}) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'household.update',
      {'timezone': timezone},
      householdId: householdId,
      baseRevision: revision,
      targetId: 'household:$householdId',
    );
  }

  Future<InviteResult> createInvite() async {
    final id = householdId;
    if (id == null) throw StateError('No household');
    final result = await commands.runNow(
      'member.invite',
      {'role': 'caretaker', 'expiresInDays': 7},
      householdId: id,
    );
    if (!result.ok) {
      throw CommandException(result.message ?? commandErrorMessage(result));
    }
    final token = result.data?['token'] as String?;
    if (token == null || token.isEmpty) {
      throw const CommandException('邀請建立失敗，請稍後再試。');
    }
    return InviteResult(token: token, expiresAt: result.data?['expiresAt'] == null
        ? null
        : DateTime.tryParse(result.data!['expiresAt'] as String));
  }

  Future<void> updateProfile({
    String? displayName,
    String? timezone,
    String? defaultHouseholdId,
  }) async {
    final payload = <String, dynamic>{
      'displayName': ?displayName,
      'timezone': ?timezone,
      'defaultHouseholdId': ?defaultHouseholdId,
    };
    if (payload.isEmpty) return;
    await commands.submit('user.updateProfile', payload);
  }

  Future<void> setDefaultHousehold(String id) {
    return updateProfile(defaultHouseholdId: id);
  }
}

class CommandException implements Exception {
  const CommandException(this.message);

  final String message;

  @override
  String toString() => message;
}

final householdRepositoryProvider = Provider<HouseholdRepository>((ref) {
  return HouseholdRepository(
    commands: ref.watch(commandServiceProvider),
    auth: ref.watch(authServiceProvider),
    householdId: ref.watch(householdIdProvider),
  );
});

final householdRevisionProvider = Provider<int>(
  (ref) => ref.watch(householdProvider).value?.revision ?? 0,
);
