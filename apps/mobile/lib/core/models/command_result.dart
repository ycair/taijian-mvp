class CommandResult {
  const CommandResult({
    required this.ok,
    required this.commandId,
    this.revision,
    this.data,
    this.code,
    this.message,
    this.current,
    this.currentRevision,
    this.lastChangedFields = const [],
    this.serverTime,
  });

  factory CommandResult.success({
    required String commandId,
    int? revision,
    Map<String, dynamic>? data,
  }) {
    return CommandResult(
      ok: true,
      commandId: commandId,
      revision: revision,
      data: data,
    );
  }

  factory CommandResult.failure({
    required String commandId,
    required String code,
    required String message,
    Map<String, dynamic>? current,
    int? currentRevision,
    List<String> lastChangedFields = const [],
  }) {
    return CommandResult(
      ok: false,
      commandId: commandId,
      code: code,
      message: message,
      current: current,
      currentRevision: currentRevision,
      lastChangedFields: lastChangedFields,
    );
  }

  factory CommandResult.fromMap(String commandId, Map<String, dynamic> map) {
    final ok = map['ok'] == true;
    final data = map['data'];
    final current = map['current'];
    return CommandResult(
      ok: ok,
      commandId: (map['commandId'] as String?) ?? commandId,
      revision: (map['revision'] as num?)?.toInt(),
      data: data is Map ? Map<String, dynamic>.from(data) : null,
      code: map['code'] as String?,
      message: map['message'] as String?,
      current: current is Map ? Map<String, dynamic>.from(current) : null,
      currentRevision: (map['currentRevision'] as num?)?.toInt(),
      lastChangedFields: (map['lastChangedFields'] as List?)?.whereType<String>().toList() ?? const [],
      serverTime: map['serverTime'] as String?,
    );
  }

  final bool ok;
  final String commandId;
  final int? revision;
  final Map<String, dynamic>? data;
  final String? code;
  final String? message;
  final Map<String, dynamic>? current;
  final int? currentRevision;
  final List<String> lastChangedFields;
  final String? serverTime;

  bool get isConflict => !ok && code == 'CONFLICT';
}

/// A transport-level problem (offline, timeout, auth) that is safe to retry.
class CommandApiException implements Exception {
  const CommandApiException(this.message, {this.code = 'NETWORK', this.retryable = true});

  final String message;
  final String code;
  final bool retryable;

  @override
  String toString() => 'CommandApiException($code): $message';
}

String commandErrorMessage(CommandResult result, {String fallback = '操作失敗，請稍後再試。'}) {
  return errorMessageForCode(result.code, fallback: result.message ?? fallback);
}

String errorMessageForCode(String? code, {String fallback = '操作失敗，請稍後再試。'}) {
  return switch (code) {
    'VALIDATION_ERROR' => '資料格式不正確，請檢查後再試。',
    'UNAUTHENTICATED' => '登入已過期，請重新登入。',
    'FORBIDDEN' => '你沒有執行這個操作的權限。',
    'NOT_FOUND' => '找不到這筆資料，可能已被刪除。',
    'CONFLICT' => '這筆資料剛被其他人更新。',
    'RATE_LIMITED' => '操作太頻繁，請稍後再試。',
    'DUPLICATE_ID' => '這筆資料已經存在。',
    'IDEMPOTENCY_MISMATCH' => '操作識別碼衝突，請重新整理後再試。',
    'LINE_ALREADY_LINKED' => '這個 LINE 帳號已連結其他帳號。',
    'LAST_OWNER' => '家庭至少需要保留一位屋主。',
    'INVITE_EXPIRED' => '邀請已過期，請重新建立。',
    'INVITE_USED' => '邀請已被使用。',
    'INTERNAL' => '系統暫時無法處理，請稍後再試。',
    'NETWORK' => '網路連線不穩定，稍後會自動重試。',
    _ => fallback,
  };
}
