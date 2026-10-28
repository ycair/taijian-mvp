import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/providers.dart';
import '../../data/supabase/supabase_mappers.dart';
import '../../data/supabase/supabase_rest_client.dart';
import 'journal_models.dart';

class JournalRepository {
  JournalRepository({
    required this.rest,
    required this.commands,
    required this.householdId,
    required this.uid,
  });

  final SupabaseRestClient? rest;
  final CommandService commands;
  final String? householdId;
  final String? uid;

  static const bucket = 'journal-photos';

  Future<List<JournalEntry>> fetchEntries() async {
    final client = rest;
    final household = householdId;
    if (client == null || household == null) return const [];
    final rows = await client.select(
      'journal_entries',
      query: 'select=*&household_id=eq.${Uri.encodeQueryComponent(household)}&deleted_at=is.null&order=journal_date.desc',
    );
    return rows.map((row) => JournalEntry.fromMap(snakeToCamelMap(row))).toList(growable: false);
  }

  Future<JournalPhoto> uploadPhoto(String entryId, XFile file) async {
    final client = rest;
    final household = householdId;
    if (client == null || household == null) throw StateError('No household');
    final bytes = await file.readAsBytes();
    final extension = _extension(file.path, file.mimeType);
    final path = '$household/$entryId/${DateTime.now().microsecondsSinceEpoch}.$extension';
    await client.uploadStorageObject(
      bucket,
      path,
      bytes,
      contentType: file.mimeType ?? 'image/jpeg',
    );
    return JournalPhoto(path: path);
  }

  Future<String?> photoUrl(String path) async {
    final client = rest;
    if (client == null) return null;
    return client.signedStorageUrl(bucket, path);
  }

  Future<void> deletePhoto(String path) async {
    final client = rest;
    if (client == null) return;
    try {
      await client.deleteStorageObject(bucket, path);
    } catch (_) {
      // The database row is the source of truth; an orphaned object is safe.
    }
  }

  Future<JournalPhotoQuota> fetchPhotoQuota() async {
    final client = rest;
    if (client == null) return const JournalPhotoQuota(used: 0, limit: 60, month: '');
    final rows = await client.rpc('journal_photo_quota', {});
    if (rows.isEmpty) return const JournalPhotoQuota(used: 0, limit: 60, month: '');
    return JournalPhotoQuota.fromMap(snakeToCamelMap(rows.first));
  }

  Future<void> create({
    required String journalId,
    required String title,
    required String body,
    required String journalDate,
    required List<String> animalIds,
    required List<JournalPhoto> photos,
    String? coverPath,
    String visibility = 'household',
  }) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'journal.create',
      {
        'journalId': journalId,
        'title': title.trim(),
        'body': body.trim(),
        'journalDate': journalDate,
        'animalIds': animalIds,
        'photos': photos.map((photo) => photo.toMap()).toList(),
        'coverPath': ?coverPath,
        'visibility': visibility,
      },
      householdId: householdId,
      baseRevision: 0,
      targetId: 'journal:$journalId',
    );
  }

  Future<void> update({
    required JournalEntry entry,
    required String title,
    required String body,
    required String journalDate,
    required List<String> animalIds,
    required List<JournalPhoto> photos,
    String? coverPath,
    String visibility = 'household',
  }) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'journal.update',
      {
        'journalId': entry.id,
        'title': title.trim(),
        'body': body.trim(),
        'journalDate': journalDate,
        'animalIds': animalIds,
        'photos': photos.map((photo) => photo.toMap()).toList(),
        'coverPath': ?coverPath,
        'visibility': visibility,
      },
      householdId: householdId,
      baseRevision: entry.revision,
      targetId: 'journal:${entry.id}',
    );
  }

  Future<void> delete(JournalEntry entry) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'journal.delete',
      {'journalId': entry.id},
      householdId: householdId,
      baseRevision: entry.revision,
      targetId: 'journal:${entry.id}',
    );
  }

  Future<List<File>> localFiles(List<XFile> files) async => [for (final file in files) File(file.path)];

  static String _extension(String path, String? mimeType) {
    if (mimeType == 'image/png') return 'png';
    if (mimeType == 'image/webp') return 'webp';
    if (mimeType == 'image/heic') return 'heic';
    final extension = path.split('.').last.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'heic'].contains(extension) ? extension : 'jpg';
  }
}

final journalRepositoryProvider = Provider<JournalRepository>((ref) {
  return JournalRepository(
    rest: ref.watch(appDependenciesProvider).rest,
    commands: ref.watch(commandServiceProvider),
    householdId: ref.watch(householdIdProvider),
    uid: ref.watch(currentUserProvider)?.uid,
  );
});

final journalEntriesProvider = FutureProvider<List<JournalEntry>>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(journalRepositoryProvider).fetchEntries();
});

final journalEntryProvider = Provider.family<AsyncValue<JournalEntry?>, String>((ref, id) {
  return ref.watch(journalEntriesProvider).whenData((entries) {
    for (final entry in entries) {
      if (entry.id == id) return entry;
    }
    return null;
  });
});

final journalPhotoUrlProvider = FutureProvider.family<String?, String>((ref, path) {
  return ref.watch(journalRepositoryProvider).photoUrl(path);
});


final journalPhotoQuotaProvider = FutureProvider<JournalPhotoQuota>((ref) {
  ref.watch(householdIdProvider);
  return ref.watch(journalRepositoryProvider).fetchPhotoQuota();
});
