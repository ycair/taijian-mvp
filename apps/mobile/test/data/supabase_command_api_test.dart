import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/models/command_result.dart';
import 'package:mobile/data/supabase/supabase_command_api.dart';
import 'package:mobile/data/supabase/supabase_rest_client.dart';

void main() {
  SupabaseCommandApi api(Future<http.Response> Function(http.Request) handler) {
    return SupabaseCommandApi(
      SupabaseRestClient(
        baseUrl: 'https://example.supabase.co',
        apiKey: 'sb_publishable_test',
        tokenProvider: () => 'token',
        httpClient: MockClient(handler),
      ),
      appVersion: '1.0.0',
    );
  }

  test('sends the command envelope and maps a successful result', () async {
    late http.Request captured;
    final commandApi = api((request) async {
      captured = request;
      return http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'ok': true,
            'commandId': 'cmd-1',
            'revision': 3,
            'data': {'recordId': 'r1'},
          }),
        ),
        200,
      );
    });

    final result = await commandApi.executeCommand(
      'record.create',
      {
        'animalId': 'a1',
        'type': 'weight',
        'occurredAt': '2026-10-26T00:00:00Z',
      },
      commandId: 'cmd-1',
      householdId: 'h1',
      baseRevision: 2,
    );

    expect(result.ok, isTrue);
    expect(result.revision, 3);
    expect(result.data?['recordId'], 'r1');
    final body = jsonDecode(captured.body) as Map<String, dynamic>;
    expect(captured.url.path, '/functions/v1/execute-command');
    expect(body['commandId'], 'cmd-1');
    expect(body['type'], 'record.create');
    expect(body['householdId'], 'h1');
    expect(body['baseRevision'], 2);
    expect((body['client'] as Map)['platform'], 'ios');
  });

  test('maps a business conflict without throwing', () async {
    final commandApi = api(
      (_) async => http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'ok': false,
            'commandId': 'cmd-2',
            'code': 'CONFLICT',
            'message': 'conflict',
            'currentRevision': 4,
            'lastChangedFields': ['name'],
          }),
        ),
        200,
      ),
    );

    final result = await commandApi.executeCommand(
      'animal.update',
      {'name': '阿肥'},
      commandId: 'cmd-2',
      householdId: 'h1',
      baseRevision: 3,
    );

    expect(result.ok, isFalse);
    expect(result.isConflict, isTrue);
    expect(result.currentRevision, 4);
  });

  test(
    'maps HTTP auth failure to a non-retryable CommandApiException',
    () async {
      final commandApi = api(
        (_) async => http.Response.bytes(
          utf8.encode(
            jsonEncode({'code': '42501', 'message': 'permission denied'}),
          ),
          401,
        ),
      );

      await expectLater(
        commandApi.executeCommand('record.create', {}, commandId: 'cmd-3'),
        throwsA(
          isA<CommandApiException>()
              .having((error) => error.code, 'code', 'UNAUTHENTICATED')
              .having((error) => error.retryable, 'retryable', isFalse),
        ),
      );
    },
  );
}
