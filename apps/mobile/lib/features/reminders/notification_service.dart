import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../core/time/app_time.dart';
import 'notification_plan.dart';

class NotificationPreferencesStore {
  static const _key = 'local_notifications_enabled';

  Future<bool> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_key) ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<void> save(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, enabled);
  }
}

class LocalNotificationService {
  LocalNotificationService({FlutterLocalNotificationsPlugin? plugin})
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;
  bool _permissionRequested = false;

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    _initialized = true;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestSoundPermission: false,
            requestBadgePermission: false,
            requestProvisionalPermission: false,
            defaultPresentAlert: true,
            defaultPresentBanner: true,
            defaultPresentList: true,
            defaultPresentSound: true,
          ),
          macOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestSoundPermission: false,
            requestBadgePermission: false,
          ),
        ),
      );
    } catch (error) {
      debugPrint('Local notifications initialize failed: $error');
    }
  }

  Future<bool> requestPermission() async {
    await _ensureInitialized();
    if (!Platform.isIOS && !Platform.isMacOS) return true;
    if (_permissionRequested) return true;
    _permissionRequested = true;
    try {
      if (Platform.isIOS) {
        final implementation = _plugin.resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin>();
        return await implementation?.requestPermissions(
              alert: true,
              badge: true,
              sound: true,
            ) ??
            false;
      }
      final implementation = _plugin.resolvePlatformSpecificImplementation<
          MacOSFlutterLocalNotificationsPlugin>();
      return await implementation?.requestPermissions(
            alert: true,
            badge: true,
            sound: true,
          ) ??
          false;
    } catch (error) {
      debugPrint('Local notifications permission failed: $error');
      return false;
    }
  }

  Future<void> cancelAll() async {
    await _ensureInitialized();
    try {
      await _plugin.cancelAll();
    } catch (error) {
      debugPrint('Local notifications cancel failed: $error');
    }
  }

  Future<void> sync(List<PlannedNotification> plan) async {
    await _ensureInitialized();
    await _plugin.cancelAll();
    for (final item in plan) {
      try {
        await _plugin.zonedSchedule(
          id: item.id,
          title: item.title,
          body: item.body,
          scheduledDate: tz.TZDateTime.from(
            item.scheduledAt,
            locationFor(item.timezone),
          ),
          notificationDetails: const NotificationDetails(
            android: AndroidNotificationDetails(
              'care_reminders',
              '照護提醒',
              channelDescription: '苔間的照護提醒',
              importance: Importance.high,
              priority: Priority.high,
            ),
            iOS: DarwinNotificationDetails(
              presentAlert: true,
              presentBadge: true,
              presentSound: true,
            ),
          ),
          androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
          payload: item.payload,
          matchDateTimeComponents: switch (item.repeat) {
            NotificationRepeat.daily => DateTimeComponents.time,
            NotificationRepeat.weekly => DateTimeComponents.dayOfWeekAndTime,
            NotificationRepeat.none => null,
          },
        );
      } catch (error) {
        debugPrint('Local notification schedule failed (${item.id}): $error');
      }
    }
  }
}

final notificationPreferencesStoreProvider = Provider<NotificationPreferencesStore>(
  (ref) => NotificationPreferencesStore(),
);

final notificationServiceProvider = Provider<LocalNotificationService>(
  (ref) => LocalNotificationService(),
);

class NotificationSettingsController extends AsyncNotifier<bool> {
  @override
  Future<bool> build() {
    return ref.watch(notificationPreferencesStoreProvider).load();
  }

  Future<bool> setEnabled(bool enabled) async {
    final store = ref.read(notificationPreferencesStoreProvider);
    final service = ref.read(notificationServiceProvider);
    if (enabled) {
      final granted = await service.requestPermission();
      if (!granted) return false;
    } else {
      await service.cancelAll();
    }
    await store.save(enabled);
    state = AsyncData(enabled);
    return true;
  }
}

final notificationSettingsProvider =
    AsyncNotifierProvider<NotificationSettingsController, bool>(
  NotificationSettingsController.new,
);
