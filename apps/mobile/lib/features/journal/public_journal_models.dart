import '../../core/models/models.dart';

class PublicJournalPhoto {
  const PublicJournalPhoto({
    required this.path,
    required this.caption,
    required this.url,
  });

  factory PublicJournalPhoto.fromMap(Map<String, dynamic> map) {
    return PublicJournalPhoto(
      path: readString(map, 'path'),
      caption: readString(map, 'caption'),
      url: _nullableString(map['url']),
    );
  }

  final String path;
  final String caption;
  final String? url;
}

class PublicJournalResident {
  const PublicJournalResident({
    required this.name,
    required this.speciesLabel,
    required this.avatarColor,
    required this.token,
  });

  factory PublicJournalResident.fromMap(Map<String, dynamic> map) {
    return PublicJournalResident(
      name: readString(map, 'name', '居民'),
      speciesLabel: _nullableString(map['speciesLabel']),
      avatarColor: readString(map, 'avatarColor', '#7C9A76'),
      token: readString(map, 'token'),
    );
  }

  final String name;
  final String? speciesLabel;
  final String avatarColor;
  final String token;

  String get publicUrl => 'https://heartfelt-sherbet-c689e3.netlify.app/r/$token';
}

class PublicJournalComment {
  const PublicJournalComment({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.authorName,
  });

  factory PublicJournalComment.fromMap(Map<String, dynamic> map) {
    return PublicJournalComment(
      id: readString(map, 'id'),
      body: readString(map, 'body'),
      createdAt: readDate(map, 'createdAt') ?? DateTime.now().toUtc(),
      authorName: readString(map, 'authorName', '苔友'),
    );
  }

  final String id;
  final String body;
  final DateTime createdAt;
  final String authorName;
}

class PublicJournalEntry {
  const PublicJournalEntry({
    required this.id,
    required this.title,
    required this.body,
    required this.journalDate,
    required this.authorId,
    required this.authorName,
    required this.authorAvatar,
    required this.shareToken,
    required this.publishedAt,
    required this.photos,
    required this.coverUrl,
    required this.residents,
    required this.likeCount,
    required this.liked,
    required this.following,
    required this.blocked,
    required this.commentCount,
    required this.comments,
  });

  factory PublicJournalEntry.fromMap(Map<String, dynamic> map) {
    final photos = _mapList(map['photos'])
        .map(PublicJournalPhoto.fromMap)
        .where((photo) => photo.path.isNotEmpty)
        .toList(growable: false);
    final firstPhotoUrl = photos.isEmpty ? null : photos.first.url;
    return PublicJournalEntry(
      id: readString(map, 'id'),
      title: readString(map, 'title'),
      body: readString(map, 'body'),
      journalDate: readString(map, 'journalDate'),
      authorId: readString(map, 'authorId'),
      authorName: readString(map, 'authorName', '苔友'),
      authorAvatar: _nullableString(map['authorAvatar']),
      shareToken: readString(map, 'shareToken'),
      publishedAt: readDate(map, 'publishedAt'),
      photos: photos,
      coverUrl: _nullableString(map['coverUrl']) ?? firstPhotoUrl,
      residents: _mapList(map['residents'])
          .map(PublicJournalResident.fromMap)
          .toList(growable: false),
      likeCount: readInt(map, 'likeCount'),
      liked: map['liked'] == true,
      following: map['following'] == true,
      blocked: map['blocked'] == true,
      commentCount: readInt(map, 'commentCount'),
      comments: _mapList(map['comments'])
          .map(PublicJournalComment.fromMap)
          .toList(growable: false),
    );
  }

  final String id;
  final String title;
  final String body;
  final String journalDate;
  final String authorId;
  final String authorName;
  final String? authorAvatar;
  final String shareToken;
  final DateTime? publishedAt;
  final List<PublicJournalPhoto> photos;
  final String? coverUrl;
  final List<PublicJournalResident> residents;
  final int likeCount;
  final bool liked;
  final bool following;
  final bool blocked;
  final int commentCount;
  final List<PublicJournalComment> comments;

  String get dateLabel => journalDate.split('T').first;

  String get publicUrl =>
      'https://heartfelt-sherbet-c689e3.netlify.app/s/$shareToken';

  PublicJournalEntry copyWith({
    int? likeCount,
    bool? liked,
    bool? following,
    bool? blocked,
    int? commentCount,
    List<PublicJournalComment>? comments,
  }) {
    return PublicJournalEntry(
      id: id,
      title: title,
      body: body,
      journalDate: journalDate,
      authorId: authorId,
      authorName: authorName,
      authorAvatar: authorAvatar,
      shareToken: shareToken,
      publishedAt: publishedAt,
      photos: photos,
      coverUrl: coverUrl,
      residents: residents,
      likeCount: likeCount ?? this.likeCount,
      liked: liked ?? this.liked,
      following: following ?? this.following,
      blocked: blocked ?? this.blocked,
      commentCount: commentCount ?? this.commentCount,
      comments: comments ?? this.comments,
    );
  }
}

class ModerationReport {
  const ModerationReport({
    required this.id,
    required this.entryId,
    required this.commentId,
    required this.reason,
    required this.status,
    required this.createdAt,
    required this.reporterName,
    required this.entryTitle,
    required this.shareToken,
    required this.commentBody,
    required this.targetAuthorName,
  });

  factory ModerationReport.fromMap(Map<String, dynamic> map) {
    return ModerationReport(
      id: readString(map, 'id'),
      entryId: _nullableString(map['entryId']),
      commentId: _nullableString(map['commentId']),
      reason: readString(map, 'reason'),
      status: readString(map, 'status', 'open'),
      createdAt: readDate(map, 'createdAt') ?? DateTime.now().toUtc(),
      reporterName: readString(map, 'reporterName', '苔友'),
      entryTitle: _nullableString(map['entryTitle']),
      shareToken: _nullableString(map['shareToken']),
      commentBody: _nullableString(map['commentBody']),
      targetAuthorName: _nullableString(map['targetAuthorName']),
    );
  }

  final String id;
  final String? entryId;
  final String? commentId;
  final String reason;
  final String status;
  final DateTime createdAt;
  final String reporterName;
  final String? entryTitle;
  final String? shareToken;
  final String? commentBody;
  final String? targetAuthorName;

  String get statusLabel => switch (status) {
    'reviewed' => '已處理',
    'dismissed' => '已忽略',
    _ => '待處理',
  };

  String get displayTitle =>
      entryTitle ?? (commentId != null ? '留言檢舉' : '已刪除的旅程');
}

List<Map<String, dynamic>> _mapList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList(growable: false);
}

String? _nullableString(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
