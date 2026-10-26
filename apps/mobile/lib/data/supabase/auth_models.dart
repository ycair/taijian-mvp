class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.sessionId,
    required this.userId,
    required this.profile,
  });

  factory AuthSession.fromResponse(Map<String, dynamic> response) {
    final access = response['accessToken'];
    final refresh = response['refreshToken'];
    final session = response['sessionId'];
    final userId = response['userId'];
    final profile = response['profile'];
    if (access is! String ||
        refresh is! String ||
        session is! String ||
        userId is! String ||
        profile is! Map) {
      throw const FormatException('invalid auth response');
    }
    return AuthSession(
      accessToken: access,
      refreshToken: refresh,
      sessionId: session,
      userId: userId,
      profile: Map<String, dynamic>.from(profile),
    );
  }

  final String accessToken;
  final String refreshToken;
  final String sessionId;
  final String userId;
  final Map<String, dynamic> profile;
}
