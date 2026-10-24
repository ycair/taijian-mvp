import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'outbox_database.g.dart';

class OutboxEntries extends Table {
  TextColumn get commandId => text()();
  TextColumn get uid => text()();
  TextColumn get type => text()();
  TextColumn get householdId => text().nullable()();
  TextColumn get targetId => text().nullable()();
  IntColumn get baseRevision => integer().nullable()();
  TextColumn get payloadJson => text()();
  TextColumn get status => text().withDefault(const Constant(OutboxStatus.pending))();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  TextColumn get conflictJson => text().nullable()();
  IntColumn get conflictRevision => integer().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {commandId};
}

abstract final class OutboxStatus {
  static const pending = 'pending';
  static const sending = 'sending';
  static const conflict = 'conflict';
  static const failed = 'failed';

  static const active = [pending, conflict, failed];
}

@DriftDatabase(tables: [OutboxEntries])
class OutboxDatabase extends _$OutboxDatabase {
  OutboxDatabase() : super(driftDatabase(name: 'taijian_outbox'));

  OutboxDatabase.withExecutor(super.executor);

  @override
  int get schemaVersion => 1;
}
