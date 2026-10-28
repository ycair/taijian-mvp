import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/command_result.dart';
import '../../data/command/command_api.dart';
import '../../data/supabase/supabase_rest_client.dart';
import 'public_journal_models.dart';

class PublicJournalException implements Exception {
  const PublicJournalException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => message;
}

class PublicJournalRepository {
  PublicJournalRepository({
    required this.rest,
    required this.commands,
    required this.uid,
  });

  final SupabaseRestClient? rest;
  final CommandService commands;
  final String? uid;

  Future<List<PublicJournalEntry>> fetchFeed({int limit = 20, bool followingOnly = false}) async {
    final client = rest;
    if (client == null) return const [];
    final response = await client.getFunction(
      'journal-public',
      query: {
        'feed': '1',
        'limit': '$limit',
        if (followingOnly) 'following': '1',
      },
    );
    if (response['ok'] != true) {
      throw PublicJournalException(
        response['code'] as String? ?? 'INTERNAL',
        response['message'] as String? ?? '讀取公開旅程失敗。',
      );
    }
    final entries = response['entries'];
    if (entries is! List) return const [];
    return entries
        .whereType<Map>()
        .map((row) => PublicJournalEntry.fromMap(Map<String, dynamic>.from(row)))
        .toList(growable: false);
  }

  Future<PublicJournalEntry> fetchEntry(String token) async {
    final client = rest;
    if (client == null) {
      throw const PublicJournalException('NOT_FOUND', '找不到這篇旅程。');
    }
    final response = await client.getFunction(
      'journal-public',
      query: {'token': token},
    );
    if (response['ok'] != true) {
      throw PublicJournalException(
        response['code'] as String? ?? 'INTERNAL',
        response['message'] as String? ?? '找不到這篇旅程。',
      );
    }
    final entry = response['entry'];
    if (entry is! Map) {
      throw const PublicJournalException('NOT_FOUND', '找不到這篇旅程。');
    }
    return PublicJournalEntry.fromMap(Map<String, dynamic>.from(entry));
  }

  Future<CommandResult> toggleLike(String entryId) {
    return _runNow('journal.like', {'entryId': entryId});
  }

  Future<CommandResult> toggleFollow(String userId) {
    return _runNow('profile.follow', {'userId': userId});
  }

  Future<CommandResult> toggleBlock(String userId) {
    return _runNow('profile.block', {'userId': userId});
  }

  Future<CommandResult> addComment(String entryId, String body) {
    return _runNow('journal.comment.create', {
      'entryId': entryId,
      'body': body.trim(),
    });
  }

  Future<CommandResult> reportEntry(String entryId, String reason) {
    return _runNow('journal.report.create', {
      'entryId': entryId,
      'reason': reason.trim(),
    });
  }

  Future<List<ModerationReport>> fetchReports({String status = 'open'}) async {
    final result = await _runNow('journal.report.list', {'status': status});
    if (!result.ok) {
      throw PublicJournalException(
        result.code ?? 'INTERNAL',
        result.message ?? '讀取檢舉失敗。',
      );
    }
    final reports = result.data?['reports'];
    if (reports is! List) return const [];
    return reports
        .whereType<Map>()
        .map((row) => ModerationReport.fromMap(Map<String, dynamic>.from(row)))
        .toList(growable: false);
  }

  Future<CommandResult> resolveReport(String reportId, String status) {
    return _runNow('journal.report.resolve', {
      'reportId': reportId,
      'status': status,
    });
  }

  Future<bool> isAdmin() async {
    final client = rest;
    final userId = uid;
    if (client == null || userId == null) return false;
    try {
      final rows = await client.select(
        'profiles',
        query:
            'select=is_admin&id=eq.${Uri.encodeQueryComponent(userId)}&limit=1',
      );
      return rows.isNotEmpty && rows.first['is_admin'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<CommandResult> _runNow(String type, Map<String, dynamic> payload) {
    return commands.runNow(type, payload, commandId: newCommandId());
  }
}

final publicJournalRepositoryProvider = Provider<PublicJournalRepository>((ref) {
  return PublicJournalRepository(
    rest: ref.watch(appDependenciesProvider).rest,
    commands: ref.watch(commandServiceProvider),
    uid: ref.watch(currentUserProvider)?.uid,
  );
});

final isAdminProvider = FutureProvider<bool>((ref) {
  ref.watch(currentUserProvider);
  return ref.watch(publicJournalRepositoryProvider).isAdmin();
});
