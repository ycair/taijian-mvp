import '../../core/models/models.dart';

class JournalPhoto {
  const JournalPhoto({required this.path, this.caption = ''});

  factory JournalPhoto.fromMap(Map<String, dynamic> map) {
    return JournalPhoto(
      path: readString(map, 'path'),
      caption: readString(map, 'caption'),
    );
  }

  final String path;
  final String caption;

  Map<String, dynamic> toMap() => {'path': path, 'caption': caption};
}

class JournalEntry {
  const JournalEntry({
    required this.id,
    required this.householdId,
    required this.title,
    required this.body,
    required this.journalDate,
    required this.animalIds,
    required this.photos,
    required this.coverPath,
    required this.revision,
    required this.createdBy,
    required this.createdAt,
    this.visibility = 'household',
    this.shareToken,
    this.publishedAt,
  });

  factory JournalEntry.fromMap(Map<String, dynamic> map) {
    final rawPhotos = map['photos'];
    final photos = rawPhotos is List
        ? rawPhotos
              .whereType<Map>()
              .map((photo) => JournalPhoto.fromMap(Map<String, dynamic>.from(photo)))
              .where((photo) => photo.path.isNotEmpty)
              .toList(growable: false)
        : const <JournalPhoto>[];
    return JournalEntry(
      id: readString(map, 'id'),
      householdId: readString(map, 'householdId'),
      title: readString(map, 'title'),
      body: readString(map, 'body'),
      journalDate: readString(map, 'journalDate'),
      animalIds: readStringList(map, 'animalIds'),
      photos: photos,
      coverPath: readString(map, 'coverPath').isEmpty ? null : readString(map, 'coverPath'),
      revision: readInt(map, 'revision'),
      createdBy: readString(map, 'createdBy'),
      createdAt: readDate(map, 'createdAt') ?? DateTime.now().toUtc(),
      visibility: readString(map, 'visibility', 'household'),
      shareToken: readString(map, 'shareToken').isEmpty ? null : readString(map, 'shareToken'),
      publishedAt: readDate(map, 'publishedAt'),
    );
  }

  final String id;
  final String householdId;
  final String title;
  final String body;
  final String journalDate;
  final List<String> animalIds;
  final List<JournalPhoto> photos;
  final String? coverPath;
  final int revision;
  final String createdBy;
  final DateTime createdAt;
  final String visibility;
  final String? shareToken;
  final DateTime? publishedAt;

  String? get effectiveCoverPath {
    if (coverPath != null && photos.any((photo) => photo.path == coverPath)) return coverPath;
    return photos.isEmpty ? null : photos.first.path;
  }

  JournalEntry copyWith({
    String? title,
    String? body,
    String? journalDate,
    List<String>? animalIds,
    List<JournalPhoto>? photos,
    String? coverPath,
    int? revision,
    String? visibility,
    String? shareToken,
  }) {
    return JournalEntry(
      id: id,
      householdId: householdId,
      title: title ?? this.title,
      body: body ?? this.body,
      journalDate: journalDate ?? this.journalDate,
      animalIds: animalIds ?? this.animalIds,
      photos: photos ?? this.photos,
      coverPath: coverPath ?? this.coverPath,
      revision: revision ?? this.revision,
      visibility: visibility ?? this.visibility,
      shareToken: shareToken ?? this.shareToken,
      createdBy: createdBy,
      createdAt: createdAt,
      publishedAt: publishedAt,
    );
  }
}


extension JournalVisibility on JournalEntry {
  String get visibilityLabel => switch (visibility) {
    'link' => '僅連結可見',
    'public' => '公開',
    _ => '家庭可見',
  };

  String? get publicUrl => shareToken == null
      ? null
      : 'https://heartfelt-sherbet-c689e3.netlify.app/s/$shareToken';
}
