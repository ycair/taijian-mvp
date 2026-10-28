import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/journal/journal_quota.dart';

void main() {
  test('entry cap limits selection', () {
    expect(remainingPhotoSlots(draftCount: 4, pendingCount: 4, quotaRemaining: 60), 1);
  });

  test('pending photos consume monthly quota before upload', () {
    expect(remainingPhotoSlots(draftCount: 2, pendingCount: 2, quotaRemaining: 3), 1);
  });

  test('no slots when quota is exhausted', () {
    expect(remainingPhotoSlots(draftCount: 0, pendingCount: 0, quotaRemaining: 0), 0);
    expect(remainingPhotoSlots(draftCount: 0, pendingCount: 2, quotaRemaining: 2), 0);
  });

  test('missing quota falls back to the free-tier limit', () {
    expect(remainingPhotoSlots(draftCount: 0, pendingCount: 0, quotaRemaining: null), 5);
  });
}
