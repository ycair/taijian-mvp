import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/data/supabase/supabase_mappers.dart';

void main() {
  test('snakeToCamelMap converts nested keys', () {
    final converted = snakeToCamelMap({
      'default_household_id': 'h1',
      'schedule': {
        'kind': 'weekly',
        'times': ['08:30'],
        'every_n_days': 2,
      },
      'profiles': [
        {'display_name': '小苔'},
      ],
    });

    expect(converted['defaultHouseholdId'], 'h1');
    expect(converted['schedule'], {
      'kind': 'weekly',
      'times': ['08:30'],
      'everyNDays': 2,
    });
    expect(converted['profiles'], [
      {'displayName': '小苔'},
    ]);
  });

  test('maps a Supabase profile and memberships to AppUser', () {
    final user = appUserFromSupabase(
      {
        'id': 'u1',
        'display_name': '小苔',
        'avatar_url': 'https://example.com/a.png',
        'timezone': 'Asia/Taipei',
        'default_household_id': 'h2',
      },
      [
        {'household_id': 'h1'},
        {'household_id': 'h2'},
      ],
    );

    expect(user.uid, 'u1');
    expect(user.displayName, '小苔');
    expect(user.householdIds, ['h1', 'h2']);
    expect(user.defaultHouseholdId, 'h2');
    expect(user.isMock, isFalse);
  });

  test('maps household, animal, record, reminder, and completion rows', () {
    final household = householdFromSupabase({
      'id': 'h1',
      'name': '苔間小屋',
      'owner_id': 'u1',
      'timezone': 'Asia/Taipei',
      'owner_count': 1,
      'member_count': 2,
      'revision': 4,
    });
    expect(household.ownerUid, 'u1');
    expect(household.memberCount, 2);
    expect(household.revision, 4);

    final animal = animalFromSupabase({
      'id': 'a1',
      'household_id': 'h1',
      'name': '阿肥',
      'species': 'leopard-gecko',
      'species_label': '豹紋守宮',
      'avatar_color': '#7C9A76',
      'avatar_pattern': 'spots',
      'status': 'memorial',
      'revision': 2,
      'adoption_date': '2024-02-03',
      'memorial_at': '2026-10-26T01:02:03.000Z',
      'memorial_note': '謝謝你陪我們。',
    });
    expect(animal.householdId, 'h1');
    expect(animal.displaySpecies, '豹紋守宮');
    expect(animal.avatarPattern, 'spots');
    expect(animal.adoptionDate, '2024-02-03');
    expect(animal.isMemorial, isTrue);
    expect(animal.memorialNote, '謝謝你陪我們。');

    final record = recordFromSupabase({
      'id': 'r1',
      'household_id': 'h1',
      'animal_id': 'a1',
      'type': 'weight',
      'occurred_at': '2026-10-26T01:02:03.000Z',
      'value': 68,
      'unit': 'g',
      'source': 'ios',
      'revision': 1,
    });
    expect(record.type, RecordType.weight);
    expect(record.value, 68);

    final reminder = reminderFromSupabase({
      'id': 'm1',
      'household_id': 'h1',
      'animal_id': 'a1',
      'title': '餵食',
      'type': 'feeding',
      'schedule': {
        'kind': 'daily',
        'times': ['08:30'],
      },
      'timezone': 'Asia/Taipei',
      'enabled': true,
      'revision': 0,
      'next_due_at': '2026-10-26T00:30:00.000Z',
      'last_changed_fields': ['enabled'],
    });
    expect(reminder.schedule.time, '08:30');
    expect(reminder.nextDueAt, isNotNull);
    expect(reminder.lastChangedFields, ['enabled']);

    final completion = completionFromSupabase({
      'reminder_id': 'm1',
      'due_date': '2026-10-26',
      'completed_by': 'u1',
      'completed_by_name': '小苔',
      'completed_at': '2026-10-26T00:31:00.000Z',
    });
    expect(completion.key, 'm1:2026-10-26');
    expect(completion.completedByName, '小苔');
  });

  test('maps a household member with embedded profile', () {
    final member = memberFromSupabase({
      'user_id': 'u1',
      'role': 'owner',
      'profiles': {
        'display_name': '小苔',
        'avatar_url': 'https://example.com/a.png',
      },
    });
    expect(member.uid, 'u1');
    expect(member.role, MemberRole.owner);
    expect(member.displayName, '小苔');
  });
}
