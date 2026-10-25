import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/models/models.dart';

/// Bridges the auth stream to GoRouter without rebuilding the router.
///
/// GoRouter listens to [notifyListeners] and re-runs redirect; the router and
/// its navigator keys stay alive across loading → signed-in transitions.
class AuthRouteRefresh extends ChangeNotifier {
  AuthRouteRefresh({
    required Stream<AppUser?> changes,
    AppUser? initialUser,
  }) : _user = initialUser {
    _subscription = changes.listen(
      (user) {
        _user = user;
        _settled = true;
        notifyListeners();
      },
      onError: (_) {
        _user = null;
        _settled = true;
        notifyListeners();
      },
    );
  }

  late final StreamSubscription<AppUser?> _subscription;
  AppUser? _user;
  bool _settled = false;

  AppUser? get user => _user;

  /// True only while the initial auth state is unknown and no user is cached.
  bool get loading => !_settled && _user == null;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
