import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/journal/journal_models.dart';

void main() {
  test('journal cover falls back to first photo and parses captions', () {
    final entry = JournalEntry.fromMap({
      'id': 'j1',
      'householdId': 'h1',
      'title': '第一次蛻皮',
      'body': '完整的皮。',
      'journalDate': '2026-10-26',
      'animalIds': ['a1'],
      'photos': [
        {'path': 'h1/j1/a.jpg', 'caption': '蛻皮後'},
        {'path': 'h1/j1/b.jpg', 'caption': ''},
      ],
      'coverPath': null,
      'revision': 0,
      'createdBy': 'u1',
      'createdAt': '2026-10-26T00:00:00Z',
    });
    expect(entry.photos, hasLength(2));
    expect(entry.photos.first.caption, '蛻皮後');
    expect(entry.effectiveCoverPath, 'h1/j1/a.jpg');
    expect(entry.animalIds, ['a1']);
  });
}
