import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/providers.dart';
import 'package:mobile/data/outbox/outbox_database.dart';

void main() {
  OutboxEntry entry({
    required String type,
    required String status,
    required String payload,
  }) {
    return OutboxEntry(
      commandId: '018f4f7e-0000-7000-8000-0000000000aa',
      uid: 'u1',
      type: type,
      payloadJson: payload,
      status: status,
      attempts: 0,
      createdAt: DateTime.utc(2026, 10, 25),
    );
  }

  test('only pending or sending task.complete rows become overlays', () {
    final keys = pendingTaskCompletionKeysFrom([
      entry(
        type: 'task.complete',
        status: OutboxStatus.pending,
        payload: '{"reminderId":"r1","dueDate":"2026-10-25"}',
      ),
      entry(
        type: 'task.complete',
        status: OutboxStatus.sending,
        payload: '{"reminderId":"r2","dueDate":"2026-10-25"}',
      ),
      entry(
        type: 'task.complete',
        status: OutboxStatus.failed,
        payload: '{"reminderId":"r3","dueDate":"2026-10-25"}',
      ),
      entry(
        type: 'record.create',
        status: OutboxStatus.pending,
        payload: '{"reminderId":"r4","dueDate":"2026-10-25"}',
      ),
      entry(
        type: 'task.complete',
        status: OutboxStatus.pending,
        payload: 'not-json',
      ),
    ]);

    expect(keys, {'r1:2026-10-25', 'r2:2026-10-25'});
  });
}
