import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';

class Proposal {
  const Proposal({
    required this.id,
    required this.title,
    required this.body,
    required this.status,
    required this.authorName,
    required this.voteCount,
    required this.voted,
    required this.createdAt,
  });

  factory Proposal.fromMap(Map<String, dynamic> map) {
    return Proposal(
      id: readString(map, 'id'),
      title: readString(map, 'title'),
      body: readString(map, 'body'),
      status: readString(map, 'status', 'open'),
      authorName: readString(map, 'authorName', '苔友'),
      voteCount: readInt(map, 'voteCount'),
      voted: map['voted'] == true,
      createdAt: readDate(map, 'createdAt') ?? DateTime.now().toUtc(),
    );
  }

  final String id;
  final String title;
  final String body;
  final String status;
  final String authorName;
  final int voteCount;
  final bool voted;
  final DateTime createdAt;

  String get statusLabel => switch (status) {
    'in_progress' => '進行中',
    'adopted' => '已採納',
    'completed' => '已完成',
    _ => '開放附議',
  };
}

class ProposalsRepository {
  ProposalsRepository({required this.rest, required this.commands});

  final SupabaseRestClient? rest;
  final CommandService commands;

  Future<List<Proposal>> fetchAll() async {
    final client = rest;
    if (client == null) return const [];
    final rows = await client.rpc('proposals_list', {});
    return rows.map((row) => Proposal.fromMap(snakeToCamelMap(row))).toList(growable: false);
  }

  Future<void> create({required String title, required String body}) async {
    await commands.submit('proposal.create', {'title': title.trim(), 'body': body.trim()});
  }

  Future<void> vote(Proposal proposal) async {
    await commands.submit('proposal.vote', {'proposalId': proposal.id});
  }
}

final proposalsRepositoryProvider = Provider<ProposalsRepository>((ref) {
  return ProposalsRepository(
    rest: ref.watch(appDependenciesProvider).rest,
    commands: ref.watch(commandServiceProvider),
  );
});

final proposalsProvider = FutureProvider<List<Proposal>>((ref) {
  return ref.watch(proposalsRepositoryProvider).fetchAll();
});
