import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/time/app_time.dart';
import 'package:mobile/data/mock/mock_command_api.dart';
import 'package:mobile/data/mock/mock_store.dart';

void main() {
  setUpAll(initializeTimeZones);

  late MockStore store;
  late MockCommandApi api;

  setUp(() {
    store = MockStore.seeded(now: DateTime.utc(2026, 10, 25, 4, 30));
    api = MockCommandApi(
      store: store,
      uid: () => MockSeed.ownerUid,
      latency: Duration.zero,
    );
  });

  tearDown(() => store.dispose());

  final occurredAt = DateTime.now().toUtc().toIso8601String();

  Map<String, dynamic> recordPayload({String type = 'feeding', String note = '吃了三隻蟋蟀'}) => {
    'recordId': '018f4f7e-0000-7000-8000-000000000020',
    'animalId': 'animal_afa',
    'type': type,
    'occurredAt': occurredAt,
    'note': note,
  };

  test('same recordId and payload is an idempotent replay', () async {
    final first = await api.executeCommand(
      'record.create',
      recordPayload(),
      commandId: '018f4f7e-0000-7000-8000-000000000021',
      householdId: MockSeed.householdId,
    );
    final second = await api.executeCommand(
      'record.create',
      recordPayload(),
      commandId: '018f4f7e-0000-7000-8000-000000000022',
      householdId: MockSeed.householdId,
    );

    expect(first.ok, isTrue);
    expect(second.ok, isTrue);
    expect(second.data?['alreadyExists'], isTrue);
    expect(store.records.where((record) => record.id == first.data?['recordId']), hasLength(1));
  });

  test('reusing a recordId with a different payload is DUPLICATE_ID', () async {
    await api.executeCommand(
      'record.create',
      recordPayload(),
      commandId: '018f4f7e-0000-7000-8000-000000000023',
      householdId: MockSeed.householdId,
    );
    final duplicate = await api.executeCommand(
      'record.create',
      recordPayload(note: '不同的內容'),
      commandId: '018f4f7e-0000-7000-8000-000000000024',
      householdId: MockSeed.householdId,
    );

    expect(duplicate.ok, isFalse);
    expect(duplicate.code, 'DUPLICATE_ID');
  });

  test('an unknown record type is rejected, not converted to note', () async {
    final result = await api.executeCommand(
      'record.create',
      recordPayload(type: 'mystery'),
      commandId: '018f4f7e-0000-7000-8000-000000000025',
      householdId: MockSeed.householdId,
    );

    expect(result.ok, isFalse);
    expect(result.code, 'VALIDATION_ERROR');
    expect(store.records.where((record) => record.type.name == 'note'), isEmpty);
    expect(store.records.where((record) => record.id == '018f4f7e-0000-7000-8000-000000000020'), isEmpty);
  });

  test('caretaker cannot archive or delete an animal', () async {
    final caretakerApi = MockCommandApi(
      store: store,
      uid: () => MockSeed.caretakerUid,
      latency: Duration.zero,
    );
    final animal = store.animals['animal_afa']!;

    final archive = await caretakerApi.executeCommand(
      'animal.archive',
      {'animalId': animal.id},
      commandId: '018f4f7e-0000-7000-8000-000000000026',
      householdId: MockSeed.householdId,
      baseRevision: animal.revision,
    );
    final delete = await caretakerApi.executeCommand(
      'animal.delete',
      {'animalId': animal.id},
      commandId: '018f4f7e-0000-7000-8000-000000000027',
      householdId: MockSeed.householdId,
      baseRevision: animal.revision,
    );

    expect(archive.code, 'FORBIDDEN');
    expect(delete.code, 'FORBIDDEN');
    expect(store.animals[animal.id], isNotNull);
  });
}
