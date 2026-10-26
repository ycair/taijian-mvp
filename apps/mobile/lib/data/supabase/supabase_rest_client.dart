import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class SupabaseApiException implements Exception {
  const SupabaseApiException({
    required this.statusCode,
    required this.code,
    required this.message,
  });

  final int statusCode;
  final String code;
  final String message;

  bool get isAuthError => statusCode == 401;

  @override
  String toString() => 'SupabaseApiException($statusCode/$code): $message';
}

class SupabaseRestClient {
  SupabaseRestClient({
    required this.baseUrl,
    required this.apiKey,
    required this.tokenProvider,
    this.onUnauthorized,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 15),
  }) : _http = httpClient ?? http.Client(),
       _baseUrl = baseUrl.endsWith('/')
           ? baseUrl.substring(0, baseUrl.length - 1)
           : baseUrl;

  final String baseUrl;
  final String apiKey;
  final String? Function() tokenProvider;
  final Future<String?> Function()? onUnauthorized;
  final Duration timeout;
  final http.Client _http;
  final String _baseUrl;

  Future<List<Map<String, dynamic>>> select(
    String table, {
    String? query,
  }) async {
    final uri = Uri.parse(
      '$_baseUrl/rest/v1/$table${query == null || query.isEmpty ? '' : '?$query'}',
    );
    final response = await _authorized(
      () => _http.get(uri, headers: _headers()),
    );
    final decoded = _decode(response);
    if (decoded is! List) {
      throw const SupabaseApiException(
        statusCode: 200,
        code: 'INVALID_RESPONSE',
        message: 'Expected a JSON array from PostgREST',
      );
    }
    return decoded
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
  }

  Future<List<Map<String, dynamic>>> rpc(
    String name,
    Map<String, dynamic> body,
  ) async {
    final response = await _authorized(
      () => _http.post(
        Uri.parse('$_baseUrl/rest/v1/rpc/$name'),
        headers: _headers(json: true),
        body: jsonEncode(body),
      ),
    );
    final decoded = _decode(response);
    if (decoded is! List) {
      throw const SupabaseApiException(
        statusCode: 200,
        code: 'INVALID_RESPONSE',
        message: 'Expected a JSON array from an RPC',
      );
    }
    return decoded
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
  }

  Future<void> uploadStorageObject(
    String bucket,
    String path,
    List<int> bytes, {
    required String contentType,
  }) async {
    final response = await _authorized(
      () => _http.post(
        Uri.parse('$_baseUrl/storage/v1/object/$bucket/${_storagePath(path)}'),
        headers: {
          ..._headers(json: false),
          'content-type': contentType,
          'x-upsert': 'true',
        },
        body: bytes,
      ),
    );
    _decode(response);
  }

  Future<void> deleteStorageObject(String bucket, String path) async {
    final response = await _authorized(
      () => _http.delete(
        Uri.parse('$_baseUrl/storage/v1/object/$bucket/${_storagePath(path)}'),
        headers: _headers(),
      ),
    );
    _decode(response);
  }

  Future<String?> signedStorageUrl(String bucket, String path) async {
    final response = await _authorized(
      () => _http.post(
        Uri.parse('$_baseUrl/storage/v1/object/sign/$bucket/${_storagePath(path)}'),
        headers: _headers(json: true),
        body: jsonEncode({'expiresIn': 3600}),
      ),
    );
    final decoded = _decode(response);
    if (decoded is! Map) return null;
    final signed = decoded['signedURL'] ?? decoded['signedUrl'];
    if (signed is! String || signed.isEmpty) return null;
    return '$_baseUrl/storage/v1$signed';
  }

  static String _storagePath(String path) =>
      path.split('/').map(Uri.encodeComponent).join('/');

  Future<Map<String, dynamic>> callFunction(
    String name,
    Map<String, dynamic> body, {
    bool authenticated = true,
  }) async {
    final response = await (authenticated
        ? _authorized(
            () => _http.post(
              Uri.parse('$_baseUrl/functions/v1/$name'),
              headers: _headers(authenticated: authenticated, json: true),
              body: jsonEncode(body),
            ),
          )
        : _send(
            () => _http.post(
              Uri.parse('$_baseUrl/functions/v1/$name'),
              headers: _headers(authenticated: authenticated, json: true),
              body: jsonEncode(body),
            ),
          ));
    final decoded = _decode(response);
    if (decoded is! Map) {
      throw const SupabaseApiException(
        statusCode: 200,
        code: 'INVALID_RESPONSE',
        message: 'Expected a JSON object from the function',
      );
    }
    return Map<String, dynamic>.from(decoded);
  }

  Map<String, String> _headers({bool authenticated = true, bool json = false}) {
    final token = authenticated ? tokenProvider() : null;
    return {
      'apikey': apiKey,
      'accept': 'application/json',
      if (json) 'content-type': 'application/json',
      if (token != null && token.isNotEmpty) 'authorization': 'Bearer $token',
    };
  }

  Future<http.Response> _authorized(
    Future<http.Response> Function() request,
  ) async {
    final response = await _send(request);
    if (response.statusCode != 401 || onUnauthorized == null) return response;

    String? refreshed;
    try {
      refreshed = await onUnauthorized!();
    } catch (_) {
      return response;
    }
    if (refreshed == null || refreshed.isEmpty) return response;
    return await _send(request);
  }

  Future<http.Response> _send(Future<http.Response> Function() request) async {
    try {
      return await request().timeout(timeout);
    } on TimeoutException {
      throw const SupabaseApiException(
        statusCode: 0,
        code: 'NETWORK',
        message: 'Supabase request timed out',
      );
    } on http.ClientException catch (error) {
      throw SupabaseApiException(
        statusCode: 0,
        code: 'NETWORK',
        message: error.message,
      );
    }
  }

  dynamic _decode(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.bodyBytes.isEmpty
          ? null
          : jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      decoded = null;
    }
    if (response.statusCode >= 200 && response.statusCode < 300) return decoded;

    final map = decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : const <String, dynamic>{};
    throw SupabaseApiException(
      statusCode: response.statusCode,
      code: map['code'] as String? ?? 'HTTP_${response.statusCode}',
      message: map['message'] as String? ?? 'Supabase request failed',
    );
  }
}
