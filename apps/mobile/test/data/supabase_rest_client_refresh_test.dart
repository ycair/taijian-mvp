import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/supabase/supabase_rest_client.dart';

void main() {
  test('a 401 triggers one refresh and retries with the new token', () async {
    var token = 'old-token';
    var refreshes = 0;
    final authHeaders = <String?>[];
    final client = SupabaseRestClient(
      baseUrl: 'https://example.supabase.co',
      apiKey: 'sb_publishable_test',
      tokenProvider: () => token,
      onUnauthorized: () async {
        refreshes += 1;
        token = 'new-token';
        return token;
      },
      httpClient: MockClient((request) async {
        authHeaders.add(request.headers['authorization']);
        if (authHeaders.length == 1) {
          return http.Response('{"code":"42501","message":"expired"}', 401);
        }
        return http.Response.bytes(utf8.encode('[{"id":"u1"}]'), 200);
      }),
    );

    final rows = await client.select('profiles');

    expect(rows.single['id'], 'u1');
    expect(refreshes, 1);
    expect(authHeaders, ['Bearer old-token', 'Bearer new-token']);
  });

  test('a failed refresh does not loop or retry', () async {
    var requests = 0;
    var refreshes = 0;
    final client = SupabaseRestClient(
      baseUrl: 'https://example.supabase.co',
      apiKey: 'sb_publishable_test',
      tokenProvider: () => 'expired',
      onUnauthorized: () async {
        refreshes += 1;
        return null;
      },
      httpClient: MockClient((_) async {
        requests += 1;
        return http.Response('{"code":"42501","message":"expired"}', 401);
      }),
    );

    await expectLater(
      client.select('profiles'),
      throwsA(isA<SupabaseApiException>().having((e) => e.isAuthError, 'auth', isTrue)),
    );
    expect(requests, 1);
    expect(refreshes, 1);
  });

  test('unauthenticated function calls never attempt refresh', () async {
    var refreshes = 0;
    final client = SupabaseRestClient(
      baseUrl: 'https://example.supabase.co',
      apiKey: 'sb_publishable_test',
      tokenProvider: () => 'token',
      onUnauthorized: () async {
        refreshes += 1;
        return 'new-token';
      },
      httpClient: MockClient((_) async => http.Response('{"ok":true}', 200)),
    );

    await client.callFunction('line-login', {'idToken': 'x'}, authenticated: false);
    expect(refreshes, 0);
  });
}
