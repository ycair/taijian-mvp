import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/supabase/supabase_rest_client.dart';

void main() {
  test('select sends apikey and bearer token and decodes rows', () async {
    late http.Request captured;
    final client = SupabaseRestClient(
      baseUrl: 'https://example.supabase.co',
      apiKey: 'sb_publishable_test',
      tokenProvider: () => 'token-123',
      httpClient: MockClient((request) async {
        captured = request;
        return http.Response.bytes(
          utf8.encode(
            jsonEncode([
              {'id': 'u1', 'display_name': '小苔'},
            ]),
          ),
          200,
        );
      }),
    );

    final rows = await client.select('profiles', query: 'select=*&id=eq.u1');

    expect(rows, [
      {'id': 'u1', 'display_name': '小苔'},
    ]);
    expect(captured.url.path, '/rest/v1/profiles');
    expect(captured.url.query, 'select=*&id=eq.u1');
    expect(captured.headers['apikey'], 'sb_publishable_test');
    expect(captured.headers['authorization'], 'Bearer token-123');
  });

  test('callFunction can be unauthenticated for line-login', () async {
    late http.Request captured;
    final client = SupabaseRestClient(
      baseUrl: 'https://example.supabase.co',
      apiKey: 'sb_publishable_test',
      tokenProvider: () => 'token-123',
      httpClient: MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'ok': true, 'token': 'jwt'}), 200);
      }),
    );

    final body = await client.callFunction('line-login', {
      'idToken': 'line-id-token',
    }, authenticated: false);

    expect(body['token'], 'jwt');
    expect(captured.url.path, '/functions/v1/line-login');
    expect(captured.headers['apikey'], 'sb_publishable_test');
    expect(captured.headers.containsKey('authorization'), isFalse);
    expect(captured.body, jsonEncode({'idToken': 'line-id-token'}));
  });

  test('getFunction sends query parameters and bearer token', () async {
    late http.Request captured;
    final client = SupabaseRestClient(
      baseUrl: 'https://example.supabase.co',
      apiKey: 'sb_publishable_test',
      tokenProvider: () => 'token-123',
      httpClient: MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'ok': true, 'entries': []}), 200);
      }),
    );

    final body = await client.getFunction(
      'journal-public',
      query: {'feed': '1', 'limit': '20'},
    );

    expect(body['ok'], isTrue);
    expect(captured.method, 'GET');
    expect(captured.url.path, '/functions/v1/journal-public');
    expect(captured.url.queryParameters, {'feed': '1', 'limit': '20'});
    expect(captured.headers['apikey'], 'sb_publishable_test');
    expect(captured.headers['authorization'], 'Bearer token-123');
  });

  test('rpc posts JSON to PostgREST and decodes rows', () async {
    late http.Request captured;
    final client = SupabaseRestClient(
      baseUrl: 'https://example.supabase.co',
      apiKey: 'sb_publishable_test',
      tokenProvider: () => 'token-123',
      httpClient: MockClient((request) async {
        captured = request;
        return http.Response.bytes(
          utf8.encode(
            jsonEncode([
              {'edge_id': 'e1', 'accessible': true},
            ]),
          ),
          200,
        );
      }),
    );

    final rows = await client.rpc('lineage_for_animal', {
      'p_animal_id': 'a1',
    });

    expect(rows, [
      {'edge_id': 'e1', 'accessible': true},
    ]);
    expect(captured.url.path, '/rest/v1/rpc/lineage_for_animal');
    expect(captured.headers['authorization'], 'Bearer token-123');
    expect(captured.body, jsonEncode({'p_animal_id': 'a1'}));
  });

  test('HTTP errors expose status, PostgREST code, and auth state', () async {
    final client = SupabaseRestClient(
      baseUrl: 'https://example.supabase.co',
      apiKey: 'sb_publishable_test',
      tokenProvider: () => 'expired',
      httpClient: MockClient(
        (_) async => http.Response(
          jsonEncode({'code': '42501', 'message': 'permission denied'}),
          401,
        ),
      ),
    );

    await expectLater(
      client.select('profiles'),
      throwsA(
        isA<SupabaseApiException>()
            .having((error) => error.statusCode, 'statusCode', 401)
            .having((error) => error.code, 'code', '42501')
            .having((error) => error.message, 'message', 'permission denied')
            .having((error) => error.isAuthError, 'isAuthError', isTrue),
      ),
    );
  });
}
