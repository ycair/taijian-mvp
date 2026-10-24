import 'dart:developer' as developer;

import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import '../../core/config/app_config.dart';

class FirebaseBootstrap {
  FirebaseBootstrap({required this.config});

  final AppConfig config;

  Future<PushService> initialize() async {
    await Firebase.initializeApp();

    if (config.enableAppCheck) {
      try {
        await FirebaseAppCheck.instance.activate(
          providerApple: config.appCheckDebugToken.isEmpty
              ? const AppleAppAttestWithDeviceCheckFallbackProvider()
              : AppleDebugProvider(debugToken: config.appCheckDebugToken),
        );
      } catch (error) {
        // A simulator/dev build without App Attest must still be able to boot;
        // the server decides whether App Check is enforced.
        developer.log('App Check activation skipped: $error', name: 'taijian.appcheck');
      }
    }

    final push = PushService();
    await push.initialize();
    return push;
  }
}

/// FCM registration for the iOS client.
///
/// APNs is not required for mock mode or the simulator; a missing APNs token is
/// logged and treated as "push unavailable", never as a boot failure.
class PushService {
  String? token;
  String? apnsToken;

  Future<void> initialize() async {
    final messaging = FirebaseMessaging.instance;
    try {
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      developer.log(
        'FCM permission: ${settings.authorizationStatus.name}',
        name: 'taijian.push',
      );
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      messaging.onRegistered.listen((value) {
        token = value;
        developer.log('FCM registration refreshed: $value', name: 'taijian.push');
      });
      FirebaseMessaging.onMessage.listen((message) {
        developer.log(
          'FCM foreground message: ${message.messageId}',
          name: 'taijian.push',
        );
      });
      await messaging.register();
      developer.log('FCM registration requested', name: 'taijian.push');
      try {
        apnsToken = await messaging.getAPNSToken();
        developer.log('APNs token: $apnsToken', name: 'taijian.push');
      } catch (error) {
        developer.log('APNs token unavailable (simulator or missing capability): $error', name: 'taijian.push');
      }
    } catch (error) {
      developer.log('FCM initialization skipped: $error', name: 'taijian.push');
    }
  }
}
