import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/animals/animal_detail_screen.dart';
import '../features/animals/animals_screen.dart';
import '../features/animals/new_animal_screen.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/household/create_household_screen.dart';
import '../features/records/records_screen.dart';
import '../features/reminders/reminder_form_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/today/today_screen.dart';
import 'auth_refresh.dart';
import 'providers.dart';
import 'shell.dart';

/// Stable for the app's lifetime; the router is created once and auth changes
/// are delivered through [AuthRouteRefresh] instead of rebuilding it.
final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authServiceProvider);
  final refresh = AuthRouteRefresh(
    changes: auth.authStateChanges(),
    initialUser: auth.currentUser,
  );
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/',
    debugLogDiagnostics: false,
    refreshListenable: refresh,
    redirect: (context, state) {
      final location = state.matchedLocation;
      if (refresh.loading) {
        return location == '/splash' ? null : '/splash';
      }
      if (refresh.user == null) {
        return location == '/signin' ? null : '/signin';
      }
      if (location == '/signin' || location == '/splash') return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/signin',
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: '/household/new',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const CreateHouseholdScreen(),
      ),
      GoRoute(
        path: '/reminders/new',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => ReminderFormScreen(
          animalId: state.uri.queryParameters['animalId'],
        ),
      ),
      GoRoute(
        path: '/reminders/:reminderId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => ReminderFormScreen(
          reminderId: state.pathParameters['reminderId'],
          animalId: state.uri.queryParameters['animalId'],
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/', builder: (context, state) => const TodayScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/animals',
                builder: (context, state) => const AnimalsScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (context, state) => const NewAnimalScreen(),
                  ),
                  GoRoute(
                    path: ':animalId',
                    builder: (context, state) => AnimalDetailScreen(
                      animalId: state.pathParameters['animalId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/records', builder: (context, state) => const RecordsScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/settings', builder: (context, state) => const SettingsScreen()),
            ],
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('找不到頁面')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('找不到這個頁面：${state.uri}'),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => context.go('/'), child: const Text('回到今日')),
            ],
          ),
        ),
      ),
    ),
  );
});
