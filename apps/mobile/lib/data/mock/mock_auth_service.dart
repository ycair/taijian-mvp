import 'dart:async';

import '../../core/models/models.dart';
import '../../data/mock/mock_store.dart';
import '../../features/auth/auth_service.dart';

class MockAuthService implements AuthService {
  MockAuthService({required this.store, bool startSignedIn = true})
    : _current = startSignedIn ? store.users[MockSeed.ownerUid] : null;

  final MockStore store;
  final StreamController<AppUser?> _controller = StreamController<AppUser?>.broadcast();
  AppUser? _current;

  @override
  AppUser? get currentUser => _current;

  @override
  Stream<AppUser?> authStateChanges() async* {
    yield _current;
    yield* _controller.stream;
  }

  @override
  Future<AppUser> signInWithApple() => _signIn();

  @override
  Future<AppUser> signInWithGoogle() => _signIn();

  Future<AppUser> _signIn() async {
    await Future<void>.delayed(const Duration(milliseconds: 220));
    final user = store.users[MockSeed.ownerUid] ??
        const AppUser(uid: MockSeed.ownerUid, displayName: '小苔', isMock: true);
    _current = user;
    _controller.add(user);
    return user;
  }

  @override
  Future<void> signOut() async {
    await Future<void>.delayed(const Duration(milliseconds: 120));
    _current = null;
    _controller.add(null);
  }

  @override
  Future<bool> openLineLink() async => false;

  void dispose() => _controller.close();
}
