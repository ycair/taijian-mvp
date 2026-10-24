import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../core/models/command_result.dart';
import 'command_api.dart';

class FirebaseCommandApi implements CommandApi {
  FirebaseCommandApi({
    FirebaseFunctions? functions,
    FirebaseAuth? auth,
    this.appVersion = '1.0.0',
  }) : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'asia-east1'),
       _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFunctions _functions;
  final FirebaseAuth _auth;
  final String appVersion;

  @override
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) async {
    if (_auth.currentUser == null) {
      throw const CommandApiException('Sign in required', code: 'UNAUTHENTICATED');
    }

    final callable = _functions.httpsCallable(
      'executeCommand',
      options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
    );

    try {
      final response = await callable.call<dynamic>({
        'commandId': commandId,
        'type': type,
        'payload': payload,
        'householdId': ?householdId,
        'baseRevision': ?baseRevision,
        'client': {'platform': 'ios', 'appVersion': appVersion},
      });
      final raw = response.data;
      if (raw is Map) {
        return CommandResult.fromMap(commandId, Map<String, dynamic>.from(raw));
      }
      throw const CommandApiException('Malformed command response', code: 'INTERNAL');
    } on FirebaseFunctionsException catch (error) {
      final code = switch (error.code) {
        'unauthenticated' => 'UNAUTHENTICATED',
        'permission-denied' => 'FORBIDDEN',
        'invalid-argument' => 'VALIDATION_ERROR',
        'not-found' => 'NOT_FOUND',
        'resource-exhausted' => 'RATE_LIMITED',
        'failed-precondition' => 'CONFLICT',
        'unavailable' || 'deadline-exceeded' => 'NETWORK',
        _ => 'INTERNAL',
      };
      final retryable = code == 'NETWORK' || code == 'INTERNAL';
      throw CommandApiException(
        error.message ?? 'executeCommand failed',
        code: code,
        retryable: retryable,
      );
    } on FirebaseException catch (error) {
      throw CommandApiException(error.message ?? 'Firebase error', code: 'NETWORK');
    } catch (error) {
      if (error is CommandApiException) rethrow;
      throw CommandApiException(
        'Network error: ${error is Exception ? error.toString() : 'unknown'}',
      );
    }
  }
}

/// Kept for debugging: the exact JSON sent over the callable.
String encodeCommandEnvelope({
  required String commandId,
  required String type,
  required Map<String, dynamic> payload,
  String? householdId,
  int? baseRevision,
  String platform = 'ios',
  String appVersion = '1.0.0',
}) {
  return jsonEncode({
    'commandId': commandId,
    'type': type,
    'payload': payload,
    'householdId': ?householdId,
    'baseRevision': ?baseRevision,
    'client': {'platform': platform, 'appVersion': appVersion},
  });
}
