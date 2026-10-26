import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';

void main() {
  test('parses analytics row with measurements, attention, and recent records', () {
    final analytics = RecordAnalytics.fromRow({
      'total': 6,
      'activeDays': 4,
      'counts': {'weight': 2, 'length': 1, 'feeding': 1},
      'measurements': [
        {
          'type': 'weight',
          'label': '體重',
          'unit': 'g',
          'date': '2026-10-01',
          'value': 62.4,
          'occurredAt': '2026-10-01T02:00:00Z',
        },
      ],
      'attention': {
        'medical': 1,
        'refusedFeedings': 1,
        'abnormalActivity': 0,
      },
      'recent': [
        {
          'id': 'r1',
          'householdId': 'h1',
          'animalId': 'a1',
          'animalName': '阿肥',
          'type': 'feeding',
          'occurredAt': '2026-10-01T02:00:00Z',
          'metadata': {'refused': true},
          'revision': 2,
        },
      ],
    });

    expect(analytics.total, 6);
    expect(analytics.activeDays, 4);
    expect(analytics.countFor(RecordType.weight), 2);
    expect(analytics.measurements.single.value, 62.4);
    expect(analytics.hasAttention, isTrue);
    expect(analytics.recent.single.summary, '拒食');
    expect(analytics.recent.single.animalName, '阿肥');
  });

  test('record summaries expose care context', () {
    final record = CareRecord(
      id: 'r1',
      householdId: 'h1',
      animalId: 'a1',
      type: RecordType.activity,
      occurredAt: DateTime.utc(2026, 10, 1),
      metadata: const {'activityLevel': 'low'},
      createdBy: 'u1',
      revision: 1,
    );
    expect(record.summary, '活動力偏低');
    expect(record.isAbnormalActivity, isTrue);
    expect(record.canModify(uid: 'u1', isOwner: false), isTrue);
    expect(record.canModify(uid: 'u2', isOwner: false), isFalse);

    final feeding = CareRecord(
      id: 'r2',
      householdId: 'h1',
      animalId: 'a1',
      type: RecordType.feeding,
      occurredAt: DateTime.utc(2026, 10, 1),
      metadata: const {'food': '蟋蟀', 'quantity': 3},
      revision: 0,
    );
    expect(feeding.summary, '蟋蟀 · 3 隻／份');
  });
}
