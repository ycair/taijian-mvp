import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/journal/public_journal_models.dart';
import 'package:mobile/features/journal/public_resident_models.dart';

void main() {
  test('public journal entry parses photos, residents, and comments', () {
    final entry = PublicJournalEntry.fromMap({
      'id': 'entry-1',
      'title': '曬太陽',
      'body': '今天很放鬆',
      'journalDate': '2026-10-28T00:00:00.000Z',
      'authorId': 'author-1',
      'authorName': '小苔',
      'shareToken': 'token-1',
      'photos': [
        {'path': 'a.jpg', 'caption': '午后', 'url': 'https://example.com/a.jpg'},
        {'path': '', 'caption': 'ignored', 'url': null},
      ],
      'residents': [
        {'name': '阿龜', 'speciesLabel': '赫曼陸龜', 'avatarColor': '#7C9A76', 'token': 'resident-1'},
      ],
      'likeCount': 3,
      'liked': true,
      'following': false,
      'blocked': false,
      'commentCount': 1,
      'comments': [
        {
          'id': 'comment-1',
          'body': '好可愛',
          'createdAt': '2026-10-28T10:00:00.000Z',
          'authorName': '苔友',
        },
      ],
    });

    expect(entry.dateLabel, '2026-10-28');
    expect(entry.photos, hasLength(1));
    expect(entry.photos.single.caption, '午后');
    expect(entry.coverUrl, 'https://example.com/a.jpg');
    expect(entry.residents.single.speciesLabel, '赫曼陸龜');
    expect(entry.comments.single.body, '好可愛');
    expect(entry.publicUrl, contains('/s/token-1'));
  });

  test('copyWith updates social state without losing content', () {
    final entry = PublicJournalEntry.fromMap({
      'id': 'entry-1',
      'title': '標題',
      'journalDate': '2026-10-28',
      'authorId': 'author-1',
      'authorName': '小苔',
      'shareToken': 'token-1',
    });

    final updated = entry.copyWith(liked: true, likeCount: 4, following: true);
    expect(updated.liked, isTrue);
    expect(updated.likeCount, 4);
    expect(updated.following, isTrue);
    expect(updated.title, '標題');
    expect(updated.authorName, '小苔');
  });

  test('public resident parses records and private relatives stay masked', () {
    final resident = PublicResident.fromMap({
      'resident': {
        'name': 'cache',
        'species': 'ball-python',
        'speciesLabel': '球蟒',
        'morph': '橘夢淡彩派',
        'sex': 'male',
        'avatarColor': '#C7B198',
        'avatarPattern': 'gradient',
        'status': 'active',
      },
      'records': [
        {
          'type': 'feeding',
          'occurredAt': '2026-10-26T12:44:00.000Z',
          'value': null,
          'unit': null,
          'note': null,
          'metadata': {'food': '蟋蟀'},
        },
      ],
      'relatives': {
        'parents': [
          {
            'relation': 'parent',
            'public': true,
            'name': '公開父',
            'speciesLabel': '球蟒',
            'avatarColor': '#7C9A76',
            'avatarPattern': 'solid',
            'token': 'parent-token',
          },
        ],
        'children': [
          {
            'relation': 'child',
            'public': false,
            'name': null,
            'speciesLabel': null,
            'avatarColor': null,
            'avatarPattern': null,
            'token': null,
          },
        ],
      },
    });

    expect(resident.profile.name, 'cache');
    expect(resident.profile.sexLabel, '公');
    expect(resident.records.single.label, '餵食');
    expect(resident.records.single.food, '蟋蟀');
    expect(resident.parents.single.canOpen, isTrue);
    expect(resident.children.single.canOpen, isFalse);
    expect(resident.children.single.name, isNull);
  });

  test('moderation report labels and fallback title', () {
    final report = ModerationReport.fromMap({
      'id': 'report-1',
      'reason': '不當內容',
      'status': 'reviewed',
      'createdAt': '2026-10-28T10:00:00.000Z',
      'reporterName': '苔友',
    });

    expect(report.statusLabel, '已處理');
    expect(report.displayTitle, '已刪除的旅程');
  });
}
