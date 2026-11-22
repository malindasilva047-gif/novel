import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter_facebook_auth/flutter_facebook_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';

class AuthSession {
  const AuthSession({
    this.id,
    required this.method,
    required this.email,
    required this.displayName,
    this.photoUrl,
    this.isNewUser = false,
    this.accountStatusMessage,
  });

  final int? id;
  final String method;
  final String email;
  final String displayName;
  final String? photoUrl;
  final bool isNewUser;
  final String? accountStatusMessage;

  bool get isGoogle => method == 'google';
  bool get isFacebook => method == 'facebook';
  bool get isGuest => method == 'guest';
  bool get isEmail => method == 'email';

  AuthSession copyWith({String? photoUrl}) => AuthSession(
    id: id,
    method: method,
    email: email,
    displayName: displayName,
    photoUrl: photoUrl ?? this.photoUrl,
    isNewUser: isNewUser,
    accountStatusMessage: accountStatusMessage,
  );
}

/// Thrown when the backend refuses login (ban / suspend / deleted).
class AuthBlockedException implements Exception {
  AuthBlockedException(this.message);
  final String message;
  @override
  String toString() => message;
}

class AuthService {
  // Public OAuth client ID used as the server audience for Google tokens.
  // The Android OAuth client still must match the package name and debug SHA-1.
  static const String _defaultGoogleWebClientId =
      '470949991659-avk11lvc5sv1ffietga62f8h591t7ijc.apps.googleusercontent.com';
  static const String _googleClientIdEnv = String.fromEnvironment(
    'GOOGLE_CLIENT_ID',
    defaultValue: _defaultGoogleWebClientId,
  );
  static const String _facebookAppId = String.fromEnvironment(
    'FACEBOOK_APP_ID',
    defaultValue: '',
  );

  AuthService({required ApiService apiService, GoogleSignIn? googleSignIn})
    : _apiService = apiService,
      _googleSignIn =
          googleSignIn ??
          (_googleClientIdEnv.isNotEmpty
              ? GoogleSignIn(
                  scopes: const ['email', 'profile'],
                  serverClientId: _googleClientIdEnv,
                )
              : GoogleSignIn(scopes: const ['email', 'profile']));

  static const String _methodKey = 'auth_method';
  static const String _idKey = 'auth_id';
  static const String _emailKey = 'auth_email';
  static const String _displayNameKey = 'auth_display_name';
  static const String _photoUrlKey = 'auth_photo_url';
  static const String _tokenKey = 'auth_token';
  static const String _deviceIdKey = 'auth_device_id';

  final ApiService _apiService;
  final GoogleSignIn _googleSignIn;
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();
  int _sessionOperation = 0;

  Future<String?> _readSessionToken(SharedPreferences prefs) async {
    final secureToken = await _secureStorage.read(key: _tokenKey);
    if (secureToken != null && secureToken.isNotEmpty) return secureToken;

    final legacyToken = prefs.getString(_tokenKey);
    if (legacyToken == null || legacyToken.isEmpty) return null;
    await _secureStorage.write(key: _tokenKey, value: legacyToken);
    await prefs.remove(_tokenKey);
    return legacyToken;
  }

  String _resolveSessionMethod(String savedMethod, Map<String, dynamic> me) {
    final provider = (me['provider'] ?? '').toString().trim().toLowerCase();
    if (provider == 'google') return 'google';
    if (provider == 'facebook') return 'facebook';
    if (provider == 'guest' || me['is_guest'] == true) return 'guest';
    if (provider == 'email' || provider == 'password') return 'email';
    return savedMethod;
  }

  String _resolveOfflineSessionMethod(String savedMethod, String email) {
    if (savedMethod != 'guest') return savedMethod;
    final normalizedEmail = email.trim().toLowerCase();
    final isGuestAddress =
        normalizedEmail == 'guest@novel.app' ||
        (normalizedEmail.startsWith('guest_') &&
            normalizedEmail.endsWith('@novel.app'));
    if (isGuestAddress) return 'guest';
    // Older app builds could leave a stale "guest" method beside a real
    // account email. Never apply guest-only restrictions to that account.
    return normalizedEmail.endsWith('@gmail.com') ? 'google' : 'email';
  }

  String _acceptSessionToken(Map<String, dynamic> payload) {
    final token = payload['token']?.toString().trim() ?? '';
    if (token.isEmpty || token.toLowerCase() == 'null') {
      throw Exception(
        'The server did not return a session token. Please try again.',
      );
    }
    _apiService.setAuthToken(token);
    return token;
  }

  Future<String> _deviceId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_deviceIdKey);
    if (id == null || id.length < 16) {
      final rnd = Random.secure();
      id = List.generate(32, (_) => rnd.nextInt(16).toRadixString(16)).join();
      await prefs.setString(_deviceIdKey, id);
    }
    return id;
  }

  bool _isRejectedSessionError(Object error) {
    final message = error.toString().toLowerCase();
    return message.contains('session revoked') ||
        message.contains('session expired') ||
        message.contains('token expired') ||
        message.contains('invalid user token') ||
        message.contains('missing user token') ||
        message.contains('account not found');
  }

  String _friendlyAuthError(Object e) {
    final raw = e.toString();
    final lower = raw.toLowerCase();
    if (lower.contains('banned')) {
      return 'This account is banned. Contact support if you believe this is a mistake.';
    }
    if (lower.contains('suspended')) {
      return 'This account is temporarily suspended. Try again later or contact support.';
    }
    if (lower.contains('deleted')) {
      return 'This account has been deleted by an administrator.';
    }
    if (lower.contains('session revoked')) {
      return 'Your session was ended (security). Please sign in again.';
    }
    if (lower.contains('invalid email or password') ||
        lower.contains('invalid email or password')) {
      return 'Invalid email or password.';
    }
    if (lower.contains('already exists')) {
      return 'An account with this email already exists. Sign in instead.';
    }
    if (lower.contains('403')) {
      return raw.replaceFirst(RegExp(r'^Exception:\s*'), '');
    }
    return raw.replaceFirst(RegExp(r'^Exception:\s*'), '');
  }

  /// Restore session only if the server still accepts the token.
  /// Banned / suspended / revoked sessions are cleared immediately.

  /// Pull latest profile from /api/me into local session (after onboarding).
  Future<AuthSession?> refreshSessionFromServer() async {
    final operation = _sessionOperation;
    final prefs = await SharedPreferences.getInstance();
    final methodName = prefs.getString(_methodKey);
    final token = await _readSessionToken(prefs);
    if (methodName == null || token == null || token.isEmpty) return null;
    _apiService.setAuthToken(token);
    try {
      final me = await _apiService.fetchMeStrict();
      if (operation != _sessionOperation) return null;
      if (me.isEmpty || me['id'] == null) {
        await _clearLocalSession(keepDeviceId: true);
        return null;
      }
      if (me['display_name'] != null) {
        await prefs.setString(_displayNameKey, me['display_name'].toString());
      }
      final photo = (me['photo_url'] ?? me['avatar_url'] ?? '').toString();
      if (photo.isNotEmpty) {
        await prefs.setString(_photoUrlKey, photo);
      }
      if (me['id'] is num) {
        await prefs.setInt(_idKey, (me['id'] as num).toInt());
      }
      if (me['email'] != null) {
        await prefs.setString(_emailKey, me['email'].toString());
      }
      final resolvedMethod = _resolveSessionMethod(methodName, me);
      if (resolvedMethod != methodName) {
        await prefs.setString(_methodKey, resolvedMethod);
      }
      return AuthSession(
        id: prefs.getInt(_idKey),
        method: resolvedMethod,
        email: prefs.getString(_emailKey) ?? me['email']?.toString() ?? '',
        displayName:
            prefs.getString(_displayNameKey) ??
            me['display_name']?.toString() ??
            'Reader',
        photoUrl: prefs.getString(_photoUrlKey) ?? photo,
      );
    } catch (error) {
      if (operation != _sessionOperation) return null;
      if (_isRejectedSessionError(error)) {
        await _clearLocalSession(keepDeviceId: true);
      }
      return null;
    }
  }

  Future<AuthSession?> restoreSession() async {
    final operation = _sessionOperation;
    final prefs = await SharedPreferences.getInstance();
    final method = prefs.getString(_methodKey);
    if (method == null || method.isEmpty) {
      return null;
    }

    final token = await _readSessionToken(prefs);
    if (token == null || token.isEmpty) {
      await _clearLocalSession(keepDeviceId: true);
      return null;
    }

    _apiService.setAuthToken(token);
    try {
      final me = await _apiService.fetchMeStrict();
      if (operation != _sessionOperation) return null;
      if (me.isEmpty || me['id'] == null) {
        await _clearLocalSession(keepDeviceId: true);
        return null;
      }
      if (me['email'] != null) {
        await prefs.setString(_emailKey, me['email'].toString());
      }
      if (me['display_name'] != null) {
        await prefs.setString(_displayNameKey, me['display_name'].toString());
      }
      if (me['id'] is num) {
        await prefs.setInt(_idKey, (me['id'] as num).toInt());
      }
      final resolvedMethod = _resolveSessionMethod(method, me);
      if (resolvedMethod != method) {
        await prefs.setString(_methodKey, resolvedMethod);
      }
      final serverPhoto = (me['photo_url'] ?? me['avatar_url'] ?? '')
          .toString();
      if (serverPhoto.isNotEmpty) {
        await prefs.setString(_photoUrlKey, serverPhoto);
      }
      return AuthSession(
        id: prefs.getInt(_idKey),
        method: resolvedMethod,
        email: prefs.getString(_emailKey) ?? me['email']?.toString() ?? '',
        displayName:
            prefs.getString(_displayNameKey) ??
            me['display_name']?.toString() ??
            'Reader',
        photoUrl: prefs.getString(_photoUrlKey) ?? serverPhoto,
      );
    } on AuthBlockedException {
      if (operation != _sessionOperation) return null;
      await signOut();
      rethrow;
    } catch (e) {
      if (operation != _sessionOperation) return null;
      final msg = e.toString().toLowerCase();
      if (msg.contains('banned') ||
          msg.contains('suspended') ||
          msg.contains('deleted')) {
        await signOut();
        throw AuthBlockedException(_friendlyAuthError(e));
      }
      // Hard session failures: revoked, expired, invalid token → clear local session
      if (_isRejectedSessionError(e)) {
        await signOut();
        return null;
      }
      // Transient network / cold-start: keep offline session so user is not
      // bounced to Login on every brief outage. Next API call revalidates.
      final email = prefs.getString(_emailKey) ?? '';
      final displayName = prefs.getString(_displayNameKey) ?? email;
      final offlineMethod = _resolveOfflineSessionMethod(method, email);
      if (email.isEmpty && method != 'guest') {
        await _clearLocalSession(keepDeviceId: true);
        return null;
      }
      return AuthSession(
        id: prefs.getInt(_idKey),
        method: offlineMethod,
        email: email.isEmpty ? 'guest@novel.app' : email,
        displayName: displayName.isEmpty
            ? (offlineMethod == 'guest' ? 'Guest' : email)
            : displayName,
        photoUrl: prefs.getString(_photoUrlKey),
      );
    }
  }

  Future<AuthSession> signInWithGoogle() async {
    _sessionOperation++;
    GoogleSignInAccount? user;
    try {
      user = await _googleSignIn.signIn();
    } catch (error) {
      throw Exception(_friendlyGoogleSignInError(error));
    }
    if (user == null) {
      throw Exception('Google sign-in was cancelled.');
    }
    final auth = await user.authentication;
    if (auth.idToken == null && auth.accessToken == null) {
      throw Exception(
        'Google sign-in returned no token. Configure GOOGLE_CLIENT_ID when building the app.',
      );
    }
    try {
      final payload = await _apiService.verifyGoogleSignIn(
        idToken: auth.idToken,
        accessToken: auth.accessToken,
      );
      _acceptSessionToken(payload);
      final session = AuthSession(
        id: payload['id'] is num ? (payload['id'] as num).toInt() : null,
        method: 'google',
        email: payload['email']?.toString() ?? user.email,
        displayName:
            payload['display_name']?.toString() ??
            user.displayName ??
            user.email,
        photoUrl: payload['photo_url']?.toString() ?? user.photoUrl,
        isNewUser: payload['is_new_user'] == true,
        accountStatusMessage: payload['account_status_message']?.toString(),
      );
      await _persistSession(session);
      return session;
    } catch (e) {
      try {
        await _googleSignIn.signOut();
      } catch (_) {}
      throw Exception(_friendlyAuthError(e));
    }
  }

  Future<AuthSession> signInWithFacebook() async {
    _sessionOperation++;
    if (_facebookAppId.isEmpty) {
      throw Exception(
        'Facebook sign-in needs Wingsaga’s Facebook App ID. Configure FACEBOOK_APP_ID and rebuild the APK.',
      );
    }
    try {
      final result = await FacebookAuth.instance.login(
        permissions: const ['email', 'public_profile'],
      );
      if (result.status == LoginStatus.cancelled) {
        throw Exception('Facebook sign-in was cancelled.');
      }
      if (result.status != LoginStatus.success || result.accessToken == null) {
        throw Exception(
          result.message ?? 'Facebook sign-in could not be completed.',
        );
      }
      final payload = await _apiService.verifyFacebookSignIn(
        accessToken: result.accessToken!.tokenString,
      );
      _acceptSessionToken(payload);
      final session = AuthSession(
        id: payload['id'] is num ? (payload['id'] as num).toInt() : null,
        method: 'facebook',
        email: payload['email']?.toString() ?? '',
        displayName: payload['display_name']?.toString() ?? 'Reader',
        photoUrl: payload['photo_url']?.toString(),
        isNewUser: payload['is_new_user'] == true,
      );
      await _persistSession(session);
      return session;
    } catch (error) {
      try {
        await FacebookAuth.instance.logOut();
      } catch (_) {}
      rethrow;
    }
  }

  String _friendlyGoogleSignInError(Object error) {
    final message = error.toString();
    final lower = message.toLowerCase();
    if (lower.contains('statuscode=10') ||
        lower.contains('developer_error') ||
        lower.contains('sign_in_failed')) {
      return 'Google sign-in is not enabled for this release yet. In Google Cloud Console, create an Android OAuth client for package com.example.novel_mobile_app with SHA-1 98:3A:B9:03:17:FF:49:2A:BB:BC:E0:F2:B3:B1:F0:7F:67:74:DB:12. Save it, wait a few minutes, then try again. You do not need to reinstall this app.';
    }
    if (lower.contains('network')) {
      return 'Google sign-in needs an active internet connection.';
    }
    return message.replaceFirst(RegExp(r'^Exception:\s*'), '');
  }

  /// Username or email + password. [mode] is `login` or `register`.
  Future<AuthSession> signInWithEmail(
    String email, {
    required String password,
    String mode = 'login',
    String? displayName,
  }) async {
    _sessionOperation++;
    final ident = email.trim();
    if (ident.isEmpty) {
      throw Exception('Enter username or email.');
    }
    if (password.isEmpty) {
      throw Exception('Enter your password.');
    }
    try {
      final payload = await _apiService.verifyEmailSignIn(
        ident,
        password: password,
        mode: mode,
        displayName: displayName,
        username: ident,
      );
      _acceptSessionToken(payload);
      final id = payload['user_id'] is num
          ? (payload['user_id'] as num).toInt()
          : (payload['id'] is num ? (payload['id'] as num).toInt() : null);
      final session = AuthSession(
        id: id,
        method: 'email',
        email:
            payload['email']?.toString() ?? (ident.contains('@') ? ident : ''),
        displayName:
            payload['display_name']?.toString() ??
            payload['username']?.toString() ??
            ident,
        accountStatusMessage: payload['account_status_message']?.toString(),
      );
      await _persistSession(session);
      return session;
    } catch (e) {
      throw Exception(_friendlyAuthError(e));
    }
  }

  Future<AuthSession> signInAsGuest() async {
    _sessionOperation++;
    final deviceId = await _deviceId();
    try {
      final payload = await _apiService.verifyGuestSignIn(deviceId: deviceId);
      _acceptSessionToken(payload);
      final session = AuthSession(
        id: payload['id'] is num ? (payload['id'] as num).toInt() : null,
        method: 'guest',
        email: payload['email']?.toString() ?? 'guest@novel.app',
        displayName: payload['display_name']?.toString() ?? 'Guest',
        photoUrl: payload['photo_url']?.toString(),
      );
      await _persistSession(session);
      return session;
    } catch (e) {
      throw Exception(_friendlyAuthError(e));
    }
  }

  Future<void> signOut() async {
    _sessionOperation++;
    await _apiService.revokeCurrentSession();
    try {
      await _googleSignIn.signOut();
    } catch (_) {}
    try {
      await FacebookAuth.instance.logOut();
    } catch (_) {}
    _apiService.setAuthToken(null);
    await _clearLocalSession(keepDeviceId: true);
  }

  Future<void> _clearLocalSession({required bool keepDeviceId}) async {
    final prefs = await SharedPreferences.getInstance();
    final deviceId = keepDeviceId ? prefs.getString(_deviceIdKey) : null;
    final userId = prefs.getInt(_idKey);

    await prefs.remove(_methodKey);
    await prefs.remove(_idKey);
    await prefs.remove(_emailKey);
    await prefs.remove(_displayNameKey);
    await prefs.remove(_photoUrlKey);
    await prefs.remove(_tokenKey);
    await _secureStorage.delete(key: _tokenKey);
    _apiService.setAuthToken(null);

    // Drop user-scoped local search history so the next account cannot see it.
    try {
      final keys = prefs.getKeys().toList();
      for (final k in keys) {
        final isSearch =
            k.startsWith('search_hist_') || k.startsWith('search_results_');
        final isContinue = k.startsWith('continue_reading_v1');
        if (!isSearch && !isContinue) continue;
        if (userId != null && k.contains('_u$userId')) {
          await prefs.remove(k);
        } else if (userId == null &&
            (k.endsWith('_guest') || k.contains('_d'))) {
          await prefs.remove(k);
        }
        // Also remove legacy unscoped keys from older builds.
        if (k == 'continue_reading_v1' ||
            k == 'search_hist_title_v1' ||
            k == 'search_hist_tag_v1' ||
            k == 'search_hist_profile_v1' ||
            k == 'search_results_title_v1' ||
            k == 'search_results_tag_v1' ||
            k == 'search_results_profile_v1') {
          await prefs.remove(k);
        }
      }
    } catch (_) {}

    if (deviceId != null) {
      await prefs.setString(_deviceIdKey, deviceId);
    }
  }

  Future<void> _persistSession(AuthSession session) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_methodKey, session.method);
    final token = _apiService.authTokenForPersistence;
    if (token != null && token.isNotEmpty) {
      await _secureStorage.write(key: _tokenKey, value: token);
    } else {
      await _secureStorage.delete(key: _tokenKey);
      await prefs.remove(_tokenKey);
    }
    if (session.id != null) {
      await prefs.setInt(_idKey, session.id!);
    } else {
      await prefs.remove(_idKey);
    }
    await prefs.setString(_emailKey, session.email);
    await prefs.setString(_displayNameKey, session.displayName);
    if (session.photoUrl != null && session.photoUrl!.isNotEmpty) {
      await prefs.setString(_photoUrlKey, session.photoUrl!);
    } else {
      await prefs.remove(_photoUrlKey);
    }
  }

  Future<void> updateProfilePhoto(String photoUrl) async {
    final prefs = await SharedPreferences.getInstance();
    final value = photoUrl.trim();
    if (value.isEmpty) {
      await prefs.remove(_photoUrlKey);
    } else {
      await prefs.setString(_photoUrlKey, value);
    }
  }
}
