import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/command_result.dart';

class InviteResult {
  const InviteResult({required this.token, this.expiresAt});

  final String token;
  final DateTime? expiresAt;
}

class HouseholdRepository {
  HouseholdRepository({
    required this.commands,
    required this.householdId,
  });

  final CommandService commands;
  final String? householdId;

  Future<CommandResult> create({
    required String name,
    required String timezone,
    required String commandId,
  }) {
    return commands.runNow(
      'household.create',
      {'name': name, 'timezone': timezone},
      commandId: commandId,
    );
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

  Future<InviteResult> createInvite({required String commandId}) async {
    final id = householdId;
    if (id == null) throw StateError('No household');
    final result = await commands.runNow(
      'member.invite',
      {'role': 'caretaker', 'expiresInDays': 7},
      commandId: commandId,
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

  Future<void> updateMemberRole({required String userId, required String role}) async {
    final id = householdId;
    if (id == null) throw StateError('No household');
    await commands.submit(
      'member.updateRole',
      {'userId': userId, 'role': role},
      householdId: id,
    );
  }

  Future<void> removeMember(String userId) async {
    final id = householdId;
    if (id == null) throw StateError('No household');
    await commands.submit('member.remove', {'userId': userId}, householdId: id);
  }

  Future<void> leaveHousehold() async {
    final id = householdId;
    if (id == null) throw StateError('No household');
    await commands.submit('member.leave', {}, householdId: id);
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
    householdId: ref.watch(householdIdProvider),
  );
});

final householdRevisionProvider = Provider<int>(
  (ref) => ref.watch(householdProvider).value?.revision ?? 0,
);
