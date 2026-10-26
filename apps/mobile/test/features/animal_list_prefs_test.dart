import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/animals/animal_list_prefs.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('persists groups, assignments, order, and sort per uid and household', () async {
    final store = AnimalListPrefsStore();
    const prefs = AnimalListPrefs(
      groups: ['最愛', '觀察中'],
      animalGroups: {'a1': '最愛', 'a2': '觀察中'},
      order: ['a2', 'a1'],
      sortMode: 'custom',
    );

    await store.save(uid: 'u1', householdId: 'h1', prefs: prefs);
    final loaded = await store.load(uid: 'u1', householdId: 'h1');
    expect(loaded.groups, ['最愛', '觀察中']);
    expect(loaded.animalGroups['a2'], '觀察中');
    expect(loaded.order, ['a2', 'a1']);
    expect(loaded.sortMode, 'custom');

    final other = await store.load(uid: 'u2', householdId: 'h1');
    expect(other.groups, isEmpty);
    final otherHousehold = await store.load(uid: 'u1', householdId: 'h2');
    expect(otherHousehold.groups, isEmpty);
  });

  test('malformed stored JSON falls back to defaults', () async {
    SharedPreferences.setMockInitialValues({
      AnimalListPrefsStore.keyFor('u1', 'h1'): '{bad json',
    });
    final loaded = await AnimalListPrefsStore().load(uid: 'u1', householdId: 'h1');
    expect(loaded.groups, isEmpty);
    expect(loaded.sortMode, 'custom');
  });
}
