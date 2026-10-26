import '../../core/models/command_result.dart';
import '../command/command_api.dart';
import 'supabase_rest_client.dart';

class SupabaseCommandApi implements CommandApi {
  SupabaseCommandApi(this._client, {required this.appVersion});

  final SupabaseRestClient _client;
  final String appVersion;

  @override
  Future<CommandResult> executeCommand(
    String type,
    Map<String, dynamic> payload, {
    required String commandId,
    String? householdId,
    int? baseRevision,
  }) async {
    try {
      final response = await _client.callFunction('execute-command', {
        'commandId': commandId,
        'type': type,
        // ignore: use_null_aware_elements
        if (householdId != null) 'householdId': householdId,
        // ignore: use_null_aware_elements
        if (baseRevision != null) 'baseRevision': baseRevision,
        'payload': payload,
        'client': {'platform': 'ios', 'appVersion': appVersion},
      });
      return CommandResult.fromMap(commandId, response);
    } on SupabaseApiException catch (error) {
      if (error.isAuthError) {
        throw CommandApiException(
          '登入已過期，請重新登入。',
          code: 'UNAUTHENTICATED',
          retryable: false,
        );
      }
      throw CommandApiException(
        error.message,
        code: error.code == 'NETWORK' ? 'NETWORK' : 'INTERNAL',
        retryable: error.statusCode >= 500 || error.statusCode == 0,
      );
    }
  }
}
