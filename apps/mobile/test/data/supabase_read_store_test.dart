import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/supabase/supabase_read_store.dart';
import 'package:mobile/data/supabase/supabase_rest_client.dart';

void main() {
  SupabaseReadStore store(
    Future<http.Response> Function(http.Request) handler, {
    Duration pollInterval = const Duration(hours: 1),
  }) {
    return SupabaseReadStore(
      SupabaseRestClient(
        baseUrl: 'https://example.supabase.co',
        apiKey: 'sb_publishable_test',
        tokenProvider: () => 'token',
        httpClient: MockClient(handler),
      ),
      pollInterval: pollInterval,
    );
  }

  test('watchUser joins profile and household memberships', () async {
    final urls = <Uri>[];
    final readStore = store((request) async {
      urls.add(request.url);
      if (request.url.path.endsWith('/profiles')) {
        return http.Response.bytes(
          utf8.encode(
            jsonEncode([
              {
                'id': 'u1',
                'display_name': '小苔',
                'timezone': 'Asia/Taipei',
                'default_household_id': 'h2',
              },
            ]),
          ),
          200,
        );
      }
      return http.Response.bytes(
        utf8.encode(
          jsonEncode([
            {'household_id': 'h1'},
            {'household_id': 'h2'},
          ]),
        ),
        200,
      );
    });

    final user = await readStore.watchUser('u1').first;

    expect(user?.displayName, '小苔');
    expect(user?.householdIds, ['h1', 'h2']);
    expect(user?.defaultHouseholdId, 'h2');
    expect(urls, hasLength(2));
    expect(urls.any((url) => url.path.endsWith('/profiles')), isTrue);
    expect(urls.any((url) => url.path.endsWith('/household_members')), isTrue);
  });

  test(
    'watchAnimals and watchCompletions use household and date filters',
    () async {
      final urls = <Uri>[];
      final readStore = store((request) async {
        urls.add(request.url);
        if (request.url.path.endsWith('/animals')) {
          return http.Response.bytes(
            utf8.encode(
              jsonEncode([
                {
                  'id': 'a1',
                  'household_id': 'h1',
                  'name': '阿肥',
                  'species': 'leopard-gecko',
                  'species_label': '豹紋守宮',
                  'avatar_color': '#7C9A76',
                  'status': 'active',
                  'revision': 1,
                },
              ]),
            ),
            200,
          );
        }
        return http.Response.bytes(
          utf8.encode(
            jsonEncode([
              {
                'reminder_id': 'm1',
                'due_date': '2026-10-26',
                'completed_by': 'u1',
                'completed_by_name': '小苔',
              },
            ]),
          ),
          200,
        );
      });

      final animals = await readStore.watchAnimals('h1').first;
      final completions = await readStore
          .watchCompletions('h1', from: '2026-10-20', to: '2026-10-26')
          .first;

      expect(animals.single.name, '阿肥');
      expect(completions.single.key, 'm1:2026-10-26');
      expect(urls.first.query, contains('household_id=eq.h1'));
      expect(urls.first.query, contains('order=name.asc'));
      expect(urls.last.query, contains('due_date=gte.2026-10-20'));
      expect(urls.last.query, contains('due_date=lte.2026-10-26'));
    },
  );

  test(
    'watchMembers and watchReminders map embedded profile and schedule',
    () async {
      final readStore = store((request) async {
        if (request.url.path.endsWith('/household_members')) {
          return http.Response.bytes(
            utf8.encode(
              jsonEncode([
                {
                  'user_id': 'u1',
                  'role': 'owner',
                  'profiles': {'display_name': '小苔', 'avatar_url': null},
                },
              ]),
            ),
            200,
          );
        }
        return http.Response.bytes(
          utf8.encode(
            jsonEncode([
              {
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
              },
            ]),
          ),
          200,
        );
      });

      final members = await readStore.watchMembers('h1').first;
      final reminders = await readStore
          .watchReminders('h1', animalId: 'a1')
          .first;

      expect(members.single.displayName, '小苔');
      expect(reminders.single.schedule.time, '08:30');
    },
  );

  test('retries polling after a transient error instead of stopping', () async {
    var calls = 0;
    final readStore = store((_) async {
      calls += 1;
      if (calls == 1) {
        return http.Response.bytes(
          utf8.encode(jsonEncode({'code': 'NETWORK', 'message': 'temporary'})),
          503,
        );
      }
      return http.Response.bytes(
        utf8.encode(
          jsonEncode([
            {
              'id': 'a1',
              'household_id': 'h1',
              'name': '阿肥',
              'species': 'leopard-gecko',
              'species_label': '豹紋守宮',
              'avatar_color': '#7C9A76',
              'status': 'active',
              'revision': 1,
            },
          ]),
        ),
        200,
      );
    }, pollInterval: const Duration(milliseconds: 1));

    final animals = await readStore
        .watchAnimals('h1')
        .handleError((Object _) {})
        .first;

    expect(calls, greaterThanOrEqualTo(2));
    expect(animals.single.name, '阿肥');
  });
}
