import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_service.dart';
import 'local_notification_service.dart';

Future<void> _ensureFirebaseInitialized() async {
  if (Firebase.apps.isEmpty) await Firebase.initializeApp();
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await _ensureFirebaseInitialized();
  // FCM notification payloads are displayed by Android while backgrounded.
  // Render data-only messages ourselves so they also reach the system tray.
  if (message.notification != null) return;
  await LocalNotificationService.instance.initialize();
  final title = (message.data['title'] ?? 'Wingsaga').toString();
  final body = (message.data['body'] ?? message.data['message'] ?? '')
      .toString();
  if (body.trim().isEmpty) return;
  await LocalNotificationService.instance.show(
    id: message.messageId?.hashCode ?? DateTime.now().millisecondsSinceEpoch,
    title: title,
    body: body,
  );
}

class FirebasePushService {
  FirebasePushService._();

  static final FirebasePushService instance = FirebasePushService._();
  static Future<void> initializeFirebase() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    await _ensureFirebaseInitialized();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  }

  FirebaseMessaging get _messaging => FirebaseMessaging.instance;
  StreamSubscription<String>? _tokenSubscription;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  ApiService? _api;
  bool _initialized = false;
  Future<void>? _initializationInFlight;
  Future<NotificationSettings>? _permissionRequestInFlight;

  Future<void> initialize(ApiService api) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    _api = api;
    await (_initializationInFlight ??= _initializeOnce()).whenComplete(() {
      if (!_initialized) _initializationInFlight = null;
    });

    final permission = await _requestNotificationPermission();
    if (permission.authorizationStatus == AuthorizationStatus.denied) return;
    final token = await _messaging.getToken();
    if (token != null && token.isNotEmpty) await _registerToken(token);
  }

  Future<void> _initializeOnce() async {
    if (_initialized) return;
    await initializeFirebase();
    await LocalNotificationService.instance.initialize();
    _foregroundSubscription = FirebaseMessaging.onMessage.listen((message) {
      final notification = message.notification;
      final title = notification?.title ?? message.data['title']?.toString();
      final body =
          notification?.body ??
          message.data['body']?.toString() ??
          message.data['message']?.toString();
      if (body == null || body.trim().isEmpty) return;
      unawaited(
        LocalNotificationService.instance.show(
          id:
              message.messageId?.hashCode ??
              DateTime.now().millisecondsSinceEpoch,
          title: (title == null || title.trim().isEmpty) ? 'Wingsaga' : title,
          body: body,
        ),
      );
    });
    _tokenSubscription = _messaging.onTokenRefresh.listen(_registerToken);
    _initialized = true;
  }

  Future<NotificationSettings> _requestNotificationPermission() async {
    final current = await _messaging.getNotificationSettings();
    if (current.authorizationStatus != AuthorizationStatus.notDetermined) {
      return current;
    }

    final request = _permissionRequestInFlight ??= _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    try {
      return await request;
    } finally {
      if (identical(_permissionRequestInFlight, request)) {
        _permissionRequestInFlight = null;
      }
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      await _api?.registerPushToken(token);
    } catch (error) {
      debugPrint('Could not register Wingsaga push token: $error');
    }
  }

  Future<void> unregisterCurrentToken() async {
    try {
      final token = await _messaging.getToken();
      if (token != null && token.isNotEmpty) {
        await _api?.unregisterPushToken(token);
      }
    } catch (error) {
      debugPrint('Could not unregister Wingsaga push token: $error');
    }
  }

  Future<void> dispose() async {
    await _tokenSubscription?.cancel();
    await _foregroundSubscription?.cancel();
  }
}
