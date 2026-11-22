import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/app_bootstrap.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiRequestException implements Exception {
  const ApiRequestException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

class ApiService {
  ApiService();

  // Keep one client for the lifetime of the app so API calls reuse TLS and
  // TCP connections instead of paying a new handshake for every request.
  static final http.Client _httpClient = http.Client();

  String? _authToken;
  Future<void> Function(String message)? onSessionRejected;

  String? get authTokenForPersistence => _authToken;

  /// Last successful bootstrap — survive sleep / failed refresh (never show empty app).
  static AppBootstrap? _cachedBootstrap;
  static const _diskBootstrapKey = 'novelhub_bootstrap_json_v1';

  static List<Map<String, dynamic>>? _tagsMemoryCache;
  static DateTime? _tagsMemoryCacheAt;
  static const _tagsMemoryTtl = Duration(minutes: 10);

  Map<String, dynamic>? _meMemoryCache;
  DateTime? _meMemoryCacheAt;
  Future<Map<String, dynamic>>? _meInFlight;
  final Map<int, Map<String, dynamic>> _profileMemoryCache = {};
  final Map<int, DateTime> _profileMemoryCacheAt = {};
  final Map<int, Future<Map<String, dynamic>>> _profileInFlight = {};
  static const _profileMemoryTtl = Duration(seconds: 30);
  Map<String, dynamic>? _preferencesMemoryCache;
  DateTime? _preferencesMemoryCacheAt;
  Future<Map<String, dynamic>>? _preferencesInFlight;
  static const _preferencesMemoryTtl = Duration(minutes: 2);

  static String? _versionMemoryCache;
  static DateTime? _versionMemoryCacheAt;
  static const _versionMemoryTtl = Duration(seconds: 2);

  // The shell badge and the notifications screen ask for the same payloads.
  // Share recent/in-flight responses so they do not multiply backend queries.
  static const _notificationsMemoryTtl = Duration(seconds: 10);
  Future<List<Map<String, dynamic>>>? _notificationsInFlight;
  Future<List<Map<String, dynamic>>>? _adminNotificationsInFlight;
  List<Map<String, dynamic>>? _notificationsMemoryCache;
  List<Map<String, dynamic>>? _adminNotificationsMemoryCache;
  DateTime? _notificationsMemoryCacheAt;
  DateTime? _adminNotificationsMemoryCacheAt;
  String? _notificationsCacheToken;
  String? _adminNotificationsCacheToken;

  Future<AppBootstrap?> loadDiskBootstrap() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_diskBootstrapKey);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final boot = AppBootstrap.fromMap(Map<String, dynamic>.from(decoded));
      if (boot.discoverBooks.isEmpty && boot.recentlyUpdated.isEmpty) {
        return null;
      }
      _cachedBootstrap = boot;
      return boot;
    } catch (_) {
      return null;
    }
  }

  Future<void> _saveDiskBootstrap(Map<String, dynamic> raw) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_diskBootstrapKey, jsonEncode(raw));
    } catch (_) {}
  }

  void setAuthToken(String? token) {
    if (_authToken != token) {
      _notificationsInFlight = null;
      _adminNotificationsInFlight = null;
      _notificationsMemoryCache = null;
      _adminNotificationsMemoryCache = null;
      _notificationsMemoryCacheAt = null;
      _adminNotificationsMemoryCacheAt = null;
      _notificationsCacheToken = null;
      _adminNotificationsCacheToken = null;
      _meMemoryCache = null;
      _meMemoryCacheAt = null;
      _meInFlight = null;
      _profileMemoryCache.clear();
      _profileMemoryCacheAt.clear();
      _profileInFlight.clear();
      _preferencesMemoryCache = null;
      _preferencesMemoryCacheAt = null;
      _preferencesInFlight = null;
    }
    _authToken = token;
  }

  /// Primary production backend hosted on Contabo. Override anytime with:
  ///   --dart-define=API_BASE_URL=https://other-host.example
  static const String _productionApiBaseUrl = 'https://wingsaga.com';
  static const String _fallbackApiBaseUrl = 'https://novel-v7.vercel.app';

  static const String _overrideApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  String get _baseUrl {
    if (_overrideApiBaseUrl.isNotEmpty) {
      return _overrideApiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    }

    if (kDebugMode) {
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
        const emulatorUrl = 'http://10.0.2.2:8000';
        debugPrint(
          'ApiService: Android debug default base URL is $emulatorUrl.\n'
          'Physical device? pass --dart-define=API_BASE_URL=http://<PC_IP>:8000\n'
          'To hit production from debug: --dart-define=API_BASE_URL=https://wingsaga.com',
        );
        return emulatorUrl;
      }
      return 'http://127.0.0.1:8000';
    }

    // Release APK → Contabo backend
    return _productionApiBaseUrl.replaceAll(RegExp(r'/+$'), '');
  }

  Map<String, String> get _authHeaders {
    if (_authToken == null || _authToken!.isEmpty) {
      return const <String, String>{};
    }
    return <String, String>{'Authorization': 'Bearer $_authToken'};
  }

  /// Host fallback: only used in release when the primary host fails.
  /// In debug we never fall back to production — that was causing Google
  /// "Not Found" and empty Discover when local backend was down or misconfigured.
  Future<http.Response> _requestWithHostFallback(
    Future<http.Response> Function(String baseUrl) request,
    Duration timeout,
  ) async {
    try {
      final response = await request(_baseUrl).timeout(timeout);
      await _handleSessionRejection(response);
      return response;
    } on http.ClientException {
      if (kDebugMode || _overrideApiBaseUrl.isNotEmpty) {
        rethrow;
      }
      final response = await request(_fallbackApiBaseUrl).timeout(timeout);
      await _handleSessionRejection(response);
      return response;
    } on TimeoutException {
      if (kDebugMode || _overrideApiBaseUrl.isNotEmpty) {
        rethrow;
      }
      final response = await request(_fallbackApiBaseUrl).timeout(timeout);
      await _handleSessionRejection(response);
      return response;
    }
  }

  Future<void> _handleSessionRejection(http.Response response) async {
    if (_authToken == null || _authToken!.isEmpty) return;
    final body = response.body.toLowerCase();
    final rejected =
        response.statusCode == 401 ||
        (response.statusCode == 403 &&
            (body.contains('banned') ||
                body.contains('suspended') ||
                body.contains('deleted')));
    if (!rejected) return;
    final message = _authErrorBody(response);
    final callback = onSessionRejected;
    if (callback != null) {
      await callback(message);
    } else {
      setAuthToken(null);
    }
  }

  Future<http.Response> _get(
    String path, {
    Duration timeout = const Duration(seconds: 30),
  }) {
    return _requestWithHostFallback(
      (baseUrl) =>
          _httpClient.get(Uri.parse('$baseUrl$path'), headers: _authHeaders),
      timeout,
    );
  }

  String resolveAssetUrl(String path) {
    final trimmed = path.trim();
    if (trimmed.isEmpty) return trimmed;
    final normalized = trimmed.replaceAll('\\', '/');
    if (normalized.startsWith('data:')) return normalized;

    if (normalized.startsWith('//')) {
      return _resolveAbsoluteAsset(Uri.parse('https:$normalized'));
    }
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return _resolveAbsoluteAsset(Uri.tryParse(normalized));
    }

    final clean = normalized.split('?').first.split('#').first;
    if (clean.contains('story_card_images/')) {
      final filename = clean.split('/').last;
      return filename.isEmpty ? '' : '$_baseUrl/uploads/$filename';
    }
    if (clean.startsWith('/api/')) return '$_baseUrl$clean';
    if (clean.startsWith('/uploads/')) return '$_baseUrl$clean';
    if (clean.startsWith('uploads/')) return '$_baseUrl/$clean';

    final isWindowsPath = RegExp(r'^[A-Za-z]:/').hasMatch(clean);
    final isBareFilename =
        !clean.contains('/') &&
        RegExp(r'\.[a-z0-9]{2,5}$', caseSensitive: false).hasMatch(clean);
    if (isWindowsPath || isBareFilename) {
      final filename = clean.split('/').last;
      return filename.isEmpty ? '' : '$_baseUrl/uploads/$filename';
    }
    return '$_baseUrl${clean.startsWith('/') ? clean : '/$clean'}';
  }

  String _resolveAbsoluteAsset(Uri? uri) {
    if (uri == null) return '';
    if (const {
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
    }.contains(uri.host.toLowerCase())) {
      return '$_baseUrl${uri.path}${uri.hasQuery ? '?${uri.query}' : ''}${uri.hasFragment ? '#${uri.fragment}' : ''}';
    }
    return uri.toString();
  }

  Future<http.Response> _post(
    String path,
    Object body, {
    Duration timeout = const Duration(seconds: 45),
  }) {
    return _requestWithHostFallback(
      (baseUrl) => _httpClient.post(
        Uri.parse('$baseUrl$path'),
        headers: {'Content-Type': 'application/json', ..._authHeaders},
        body: jsonEncode(body),
      ),
      timeout,
    );
  }

  Future<http.Response> _put(
    String path,
    Object body, {
    Duration timeout = const Duration(seconds: 45),
  }) {
    return _requestWithHostFallback(
      (baseUrl) => _httpClient.put(
        Uri.parse('$baseUrl$path'),
        headers: {'Content-Type': 'application/json', ..._authHeaders},
        body: jsonEncode(body),
      ),
      timeout,
    );
  }

  Future<http.Response> _delete(
    String path, {
    Duration timeout = const Duration(seconds: 45),
  }) {
    return _requestWithHostFallback(
      (baseUrl) =>
          _httpClient.delete(Uri.parse('$baseUrl$path'), headers: _authHeaders),
      timeout,
    );
  }

  void _ensureSuccessResponse(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiRequestException(
        response.statusCode,
        _responseErrorMessage(response),
      );
    }
  }

  String _responseErrorMessage(http.Response response) {
    try {
      final payload = jsonDecode(response.body);
      if (payload is Map && payload['detail'] != null) {
        return payload['detail'].toString();
      }
      if (payload is Map && payload['message'] != null) {
        return payload['message'].toString();
      }
    } on FormatException {
      // Some proxies return a plain-text error body.
    }
    final body = response.body.trim();
    return body.isEmpty ? 'Request failed. Please try again.' : body;
  }

  Future<AppBootstrap> fetchBootstrap() {
    return _bootstrapInFlight ??= _fetchBootstrapNetwork().whenComplete(() {
      _bootstrapInFlight = null;
    });
  }

  Future<AppBootstrap>? _bootstrapInFlight;

  Future<AppBootstrap> _fetchBootstrapNetwork() async {
    // Allow for a cold serverless start, but don't leave the first screen
    // blocked for multiple minutes when the database is unhealthy.
    Object? lastError;
    for (var attempt = 1; attempt <= 2; attempt++) {
      try {
        final response = await _get(
          '/api/bootstrap',
          timeout: const Duration(seconds: 20),
        );
        if (response.statusCode >= 200 && response.statusCode < 300) {
          final decoded = jsonDecode(response.body);
          if (decoded is Map<String, dynamic>) {
            final boot = AppBootstrap.fromMap(decoded);
            // Only cache non-empty home data so we never "stick" on blank shell
            if (boot.discoverBooks.isNotEmpty ||
                boot.recentlyUpdated.isNotEmpty) {
              _cachedBootstrap = boot;
              unawaited(_saveDiskBootstrap(decoded));
            }
            debugPrint(
              'bootstrap OK from $_baseUrl '
              'recently_updated=${boot.recentlyUpdated.length} '
              'discover=${boot.discoverBooks.length}',
            );
            return boot;
          }
        }
        debugPrint(
          'bootstrap HTTP ${response.statusCode} from $_baseUrl: '
          '${response.body.length > 300 ? response.body.substring(0, 300) : response.body}',
        );
        lastError = 'HTTP ${response.statusCode}';
      } catch (e, st) {
        lastError = e;
        debugPrint('bootstrap error (attempt $attempt) from $_baseUrl: $e');
        if (attempt == 1) {
          debugPrint('retrying bootstrap after cold-start...');
          await Future<void>.delayed(const Duration(milliseconds: 500));
          continue;
        }
        debugPrint('$st');
      }
    }
    debugPrint('bootstrap giving up: $lastError');
    // Prefer last good data over empty fallback (fixes blank app after sleep/comments)
    if (_cachedBootstrap != null) {
      debugPrint('bootstrap: returning cached home data');
      return _cachedBootstrap!;
    }
    return AppBootstrap.fromMap(_fallbackData);
  }

  Future<String> fetchContentVersion() async {
    final now = DateTime.now();
    if (_versionMemoryCache != null &&
        _versionMemoryCacheAt != null &&
        now.difference(_versionMemoryCacheAt!) < _versionMemoryTtl) {
      return _versionMemoryCache!;
    }
    try {
      final response = await _get(
        '/api/content/version',
        timeout: const Duration(seconds: 5),
      );
      if (response.statusCode == 200) {
        final payload = jsonDecode(response.body) as Map<String, dynamic>;
        final v = payload['value']?.toString() ?? '';
        _versionMemoryCache = v;
        _versionMemoryCacheAt = now;
        return v;
      }
    } catch (_) {}
    return _versionMemoryCache ?? '';
  }

  Future<List<BookCardModel>> fetchRecommendations() async {
    try {
      final response = await _get(
        '/api/recommendations',
        timeout: const Duration(seconds: 12),
      );
      if (response.statusCode != 200) return const [];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final items = payload['items'];
      if (items is! List) return const [];
      return items
          .whereType<Map>()
          .map((item) => BookCardModel.fromMap(Map<String, dynamic>.from(item)))
          .where((book) => book.id > 0 && book.title.trim().isNotEmpty)
          .toList();
    } catch (error) {
      debugPrint('fetchRecommendations: $error');
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> fetchRelatedRecommendations(
    int bookId,
  ) async {
    try {
      final response = await _get(
        '/api/recommendations?book_id=$bookId&limit=12',
        timeout: const Duration(seconds: 12),
      );
      if (response.statusCode != 200) return const [];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final items = payload['items'];
      if (items is! List) return const [];
      return items
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .where((book) => (book['id'] as num?)?.toInt() != bookId)
          .toList();
    } catch (error) {
      debugPrint('fetchRelatedRecommendations: $error');
      return const [];
    }
  }

  Future<Map<String, dynamic>> fetchMe() {
    final now = DateTime.now();
    if (_meMemoryCache != null &&
        _meMemoryCacheAt != null &&
        now.difference(_meMemoryCacheAt!) < const Duration(seconds: 30)) {
      return Future.value(Map<String, dynamic>.from(_meMemoryCache!));
    }
    return _meInFlight ??= _fetchMeNetwork().whenComplete(() {
      _meInFlight = null;
    });
  }

  Future<Map<String, dynamic>> refreshMe() => _fetchMeNetwork();

  Future<Map<String, dynamic>> _fetchMeNetwork() async {
    try {
      final response = await _get(
        '/api/me',
        timeout: const Duration(seconds: 12),
      );
      if (response.statusCode == 200) {
        final result = Map<String, dynamic>.from(
          jsonDecode(response.body) as Map,
        );
        _meMemoryCache = result;
        _meMemoryCacheAt = DateTime.now();
        return result;
      }
    } catch (_) {}
    return const <String, dynamic>{};
  }

  /// Raises on 401/403 so AuthService can force logout after ban/suspend.
  Future<Map<String, dynamic>> fetchMeStrict() async {
    final response = await _get(
      '/api/me',
      timeout: const Duration(seconds: 30),
    );
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception(_authErrorBody(response));
  }

  Future<Map<String, dynamic>> fetchProfile(int userId) async {
    final now = DateTime.now();
    final cached = _profileMemoryCache[userId];
    final cachedAt = _profileMemoryCacheAt[userId];
    if (cached != null &&
        cachedAt != null &&
        now.difference(cachedAt) < _profileMemoryTtl) {
      return Map<String, dynamic>.from(cached);
    }
    final existing = _profileInFlight[userId];
    if (existing != null) return existing;
    final request = _fetchProfileNetwork(userId);
    _profileInFlight[userId] = request;
    return request.whenComplete(() => _profileInFlight.remove(userId));
  }

  Future<Map<String, dynamic>> refreshProfile(int userId) =>
      _fetchProfileNetwork(userId);

  Future<Map<String, dynamic>> _fetchProfileNetwork(int userId) async {
    try {
      final response = await _get(
        '/api/users/$userId',
        timeout: const Duration(seconds: 12),
      );
      if (response.statusCode == 200) {
        final result = Map<String, dynamic>.from(
          jsonDecode(response.body) as Map,
        );
        _profileMemoryCache[userId] = result;
        _profileMemoryCacheAt[userId] = DateTime.now();
        return result;
      }
    } catch (_) {}
    return const <String, dynamic>{};
  }

  Future<Map<String, dynamic>> uploadWriterImage(
    Uint8List bytes,
    String filename,
  ) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$_baseUrl/api/write/upload-image'),
    );
    request.headers.addAll(_authHeaders);
    request.files.add(
      http.MultipartFile.fromBytes('file', bytes, filename: filename),
    );
    final streamed = await request.send().timeout(const Duration(seconds: 45));
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode == 401) {
      throw Exception('Sign in required to upload a cover image');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    final map = jsonDecode(response.body) as Map<String, dynamic>;
    final path = (map['path'] ?? map['url'] ?? '').toString();
    if (path.isEmpty) {
      throw Exception('Cover upload returned empty path');
    }
    return map;
  }

  Future<Map<String, dynamic>> uploadUserImage(
    Uint8List bytes,
    String filename,
  ) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$_baseUrl/api/me/upload-image'),
    );
    request.headers.addAll(_authHeaders);
    request.files.add(
      http.MultipartFile.fromBytes('file', bytes, filename: filename),
    );
    final streamed = await request.send().timeout(const Duration(seconds: 45));
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode == 401) {
      throw Exception('Sign in required to upload a profile image');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateMe(Map<String, dynamic> payload) async {
    // Editing a profile is a single update; onboarding has its own retry and
    // completion checks, which can misread an older profile as a saved edit.
    final response = await _put(
      '/api/me',
      payload,
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    final decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      throw const FormatException('Invalid response from /api/me');
    }
    final result = Map<String, dynamic>.from(decoded);
    _meMemoryCache = result;
    _meMemoryCacheAt = DateTime.now();
    final id = int.tryParse(result['id']?.toString() ?? '');
    if (id != null) {
      _profileMemoryCache.remove(id);
      _profileMemoryCacheAt.remove(id);
    }
    return result;
  }

  Future<Map<String, dynamic>> uploadSupportAttachment(
    Uint8List bytes,
    String filename,
  ) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$_baseUrl/api/support/upload-attachment'),
    );
    request.headers.addAll(_authHeaders);
    request.files.add(
      http.MultipartFile.fromBytes('file', bytes, filename: filename),
    );
    final streamed = await request.send().timeout(const Duration(seconds: 45));
    final response = await http.Response.fromStream(streamed);
    _ensureSuccessResponse(response);
    final payload = jsonDecode(response.body);
    if (payload is! Map) {
      throw const FormatException(
        'Invalid response from /api/support/upload-attachment',
      );
    }
    final result = Map<String, dynamic>.from(payload);
    if ((result['path'] ?? '').toString().trim().isEmpty) {
      throw const FormatException(
        'Support attachment upload returned an empty path',
      );
    }
    return result;
  }

  /// Admin / system announcements from the dedicated notifications endpoint.
  Future<List<Map<String, dynamic>>> fetchAdminNotifications() async {
    final now = DateTime.now();
    final cached = _adminNotificationsMemoryCache;
    final cachedAt = _adminNotificationsMemoryCacheAt;
    if (cached != null &&
        _adminNotificationsCacheToken == _authToken &&
        cachedAt != null &&
        now.difference(cachedAt) < _notificationsMemoryTtl) {
      return _copyNotificationItems(cached);
    }
    final pending = _adminNotificationsInFlight;
    if (pending != null) return _copyNotificationItems(await pending);
    final requestToken = _authToken;
    final request = _fetchAdminNotificationsFromApi();
    _adminNotificationsInFlight = request;
    try {
      final items = await request;
      if (_authToken == requestToken) {
        _adminNotificationsMemoryCache = _copyNotificationItems(items);
        _adminNotificationsMemoryCacheAt = DateTime.now();
        _adminNotificationsCacheToken = requestToken;
      }
      return _copyNotificationItems(items);
    } finally {
      if (identical(_adminNotificationsInFlight, request)) {
        _adminNotificationsInFlight = null;
      }
    }
  }

  Future<List<Map<String, dynamic>>> _fetchAdminNotificationsFromApi() async {
    final response = await _get(
      '/api/notifications/admin',
      timeout: const Duration(seconds: 12),
    );
    _ensureSuccessResponse(response);
    final payload = jsonDecode(response.body);
    if (payload is! Map || payload['items'] is! List) {
      throw const FormatException(
        'Invalid response from /api/notifications/admin',
      );
    }
    final items = (payload['items'] as List)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    return items;
  }

  static int _compareNotificationsNewestFirst(
    Map<String, dynamic> left,
    Map<String, dynamic> right,
  ) {
    DateTime? createdAt(Map<String, dynamic> item) {
      final raw = item['created_at'] ?? item['timestamp'] ?? item['date'];
      if (raw is num) {
        final value = raw.abs() < 1000000000000
            ? raw.toInt() * 1000
            : raw.toInt();
        return DateTime.fromMillisecondsSinceEpoch(value, isUtc: true);
      }
      return DateTime.tryParse(raw?.toString().trim() ?? '')?.toUtc();
    }

    final leftDate = createdAt(left);
    final rightDate = createdAt(right);
    if (leftDate != null && rightDate != null) {
      final byDate = rightDate.compareTo(leftDate);
      if (byDate != 0) return byDate;
    } else if (leftDate != null) {
      return -1;
    } else if (rightDate != null) {
      return 1;
    }

    // Keep notifications with equal or missing dates deterministic.
    final leftId = (left['id'] ?? '').toString();
    final rightId = (right['id'] ?? '').toString();
    final leftNumber = int.tryParse(
      RegExp(r'(\d+)$').firstMatch(leftId)?.group(1) ?? '',
    );
    final rightNumber = int.tryParse(
      RegExp(r'(\d+)$').firstMatch(rightId)?.group(1) ?? '',
    );
    if (leftNumber != null &&
        rightNumber != null &&
        leftNumber != rightNumber) {
      return rightNumber.compareTo(leftNumber);
    }
    return rightId.compareTo(leftId);
  }

  Future<List<Map<String, dynamic>>> fetchMyActivity() async {
    try {
      final response = await _get('/api/me/activity');
      if (response.statusCode != 200) return const [];
      final payload = jsonDecode(response.body);
      if (payload is Map && payload['items'] is List) {
        return (payload['items'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      return const [];
    } catch (e) {
      debugPrint('fetchMyActivity: $e');
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> fetchNotifications({String? tab}) async {
    final normalizedTab = tab?.trim() ?? '';
    if (normalizedTab.isEmpty) {
      final now = DateTime.now();
      final cached = _notificationsMemoryCache;
      final cachedAt = _notificationsMemoryCacheAt;
      if (cached != null &&
          _notificationsCacheToken == _authToken &&
          cachedAt != null &&
          now.difference(cachedAt) < _notificationsMemoryTtl) {
        return _copyNotificationItems(cached);
      }
      final pending = _notificationsInFlight;
      if (pending != null) return _copyNotificationItems(await pending);
      final requestToken = _authToken;
      final request = _fetchNotificationsFromApi();
      _notificationsInFlight = request;
      try {
        final items = await request;
        if (_authToken == requestToken) {
          _notificationsMemoryCache = _copyNotificationItems(items);
          _notificationsMemoryCacheAt = DateTime.now();
          _notificationsCacheToken = requestToken;
        }
        return _copyNotificationItems(items);
      } finally {
        if (identical(_notificationsInFlight, request)) {
          _notificationsInFlight = null;
        }
      }
    }
    return _fetchNotificationsFromApi(tab: normalizedTab);
  }

  Future<void> registerPushToken(String token) async {
    if (_authToken == null || _authToken!.isEmpty) return;
    final response = await _post('/api/push-tokens', {'token': token});
    _ensureSuccessResponse(response);
  }

  Future<void> unregisterPushToken(String token) async {
    if (_authToken == null || _authToken!.isEmpty) return;
    final response = await _post('/api/push-tokens/unregister', {'token': token});
    _ensureSuccessResponse(response);
  }

  Future<List<Map<String, dynamic>>> _fetchNotificationsFromApi({
    String? tab,
  }) async {
    final response = await _get(
      '/api/notifications${tab != null && tab.isNotEmpty ? '?tab=${Uri.encodeComponent(tab)}' : ''}',
      // The backend currently builds this feed from several DB queries; a
      // short timeout made valid notifications fail under normal DB latency.
      timeout: const Duration(seconds: 20),
    );
    _ensureSuccessResponse(response);
    final payload = jsonDecode(response.body);
    if (payload is! Map || payload['items'] is! List) {
      throw const FormatException('Invalid response from /api/notifications');
    }
    final items = (payload['items'] as List)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    items.sort(_compareNotificationsNewestFirst);
    return items;
  }

  List<Map<String, dynamic>> _copyNotificationItems(
    List<Map<String, dynamic>> items,
  ) => items.map((item) => Map<String, dynamic>.from(item)).toList();

  Future<List<Map<String, dynamic>>> fetchMySupportRequests() async {
    final response = await _get(
      '/api/support/requests',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    final payload = jsonDecode(response.body);
    if (payload is Map && payload['items'] is List) {
      return (payload['items'] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    if (payload is List) {
      return payload
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    throw const FormatException(
      'Support request history has an invalid format',
    );
  }

  Future<Map<String, dynamic>> submitSupportRequest(
    Map<String, dynamic> payload,
  ) async {
    final response = await _post(
      '/api/support/requests',
      payload,
      timeout: const Duration(seconds: 60),
    );
    _ensureSuccessResponse(response);
    final body = jsonDecode(response.body);
    if (body is Map) return Map<String, dynamic>.from(body);
    throw const FormatException(
      'Support request response has an invalid format',
    );
  }

  Future<Map<String, dynamic>> fetchUserPreferences({
    bool forceRefresh = false,
  }) {
    final now = DateTime.now();
    if (!forceRefresh &&
        _preferencesMemoryCache != null &&
        _preferencesMemoryCacheAt != null &&
        now.difference(_preferencesMemoryCacheAt!) < _preferencesMemoryTtl) {
      return Future.value(Map<String, dynamic>.from(_preferencesMemoryCache!));
    }
    return _preferencesInFlight ??= _fetchUserPreferencesNetwork().whenComplete(
      () => _preferencesInFlight = null,
    );
  }

  Future<Map<String, dynamic>> _fetchUserPreferencesNetwork() async {
    final response = await _get(
      '/api/me/preferences',
      timeout: const Duration(seconds: 12),
    );
    _ensureSuccessResponse(response);
    final body = jsonDecode(response.body);
    final result = body is Map<String, dynamic>
        ? body
        : body is Map
        ? Map<String, dynamic>.from(body)
        : throw const FormatException(
            'User preferences have an invalid format',
          );
    _preferencesMemoryCache = result;
    _preferencesMemoryCacheAt = DateTime.now();
    return Map<String, dynamic>.from(result);
  }

  Future<void> updateUserPreferences(Map<String, dynamic> patch) async {
    final response = await _put(
      '/api/me/preferences',
      patch,
      timeout: const Duration(seconds: 15),
    );
    _ensureSuccessResponse(response);
    final cached = _preferencesMemoryCache;
    if (cached != null) {
      for (final entry in patch.entries) {
        final existing = cached[entry.key];
        final value = entry.value;
        cached[entry.key] = existing is Map && value is Map
            ? <String, dynamic>{
                ...Map<String, dynamic>.from(existing),
                ...Map<String, dynamic>.from(value),
              }
            : value;
      }
      _preferencesMemoryCacheAt = DateTime.now();
    }
  }

  Future<Map<String, dynamic>> fetchReadingStats() async {
    try {
      final response = await _get(
        '/api/me/reading-stats',
        timeout: const Duration(seconds: 12),
      );
      if (response.statusCode == 200) {
        final body = jsonDecode(response.body);
        if (body is Map<String, dynamic>) return body;
        if (body is Map) return Map<String, dynamic>.from(body);
      }
    } catch (e) {
      debugPrint('fetchReadingStats: $e');
    }
    return {};
  }

  Future<Map<String, dynamic>> verifyGoogleSignIn({
    String? idToken,
    String? accessToken,
  }) async {
    // Cold start + Google tokeninfo can exceed 12s on Vercel.
    final response = await _post('/api/auth/google', {
      'id_token': idToken,
      'access_token': accessToken,
    }, timeout: const Duration(seconds: 45));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> verifyFacebookSignIn({
    required String accessToken,
  }) async {
    final response = await _post('/api/auth/facebook', {
      'access_token': accessToken,
    }, timeout: const Duration(seconds: 45));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  String _authErrorBody(http.Response response) {
    try {
      final body = jsonDecode(response.body);
      if (body is Map && body['detail'] != null) {
        return body['detail'].toString();
      }
    } catch (_) {}
    return 'Authentication failed (${response.statusCode})';
  }

  Future<Map<String, dynamic>> verifyEmailSignIn(
    String email, {
    required String password,
    String mode = 'login',
    String? displayName,
    String? username,
  }) async {
    if (mode == 'login') {
      // Primary: dedicated login (username OR email). Long timeout for cold start.
      try {
        final response = await _post('/api/auth/login', {
          'email': email,
          'password': password,
          if (username != null && username.trim().isNotEmpty)
            'username': username.trim(),
        }, timeout: const Duration(seconds: 60));
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return jsonDecode(response.body) as Map<String, dynamic>;
        }
        // Fall through to legacy email auth on 404 only
        if (response.statusCode != 404) {
          throw Exception(_authErrorBody(response));
        }
      } on Exception catch (e) {
        final msg = e.toString().toLowerCase();
        final isTimeout = msg.contains('timeout') || msg.contains('timed out');
        if (!isTimeout && !msg.contains('404')) rethrow;
        // Fallback below
      }
      // Legacy fallback: /api/auth/email
      final response = await _post('/api/auth/email', {
        'email': email,
        'password': password,
        'mode': 'login',
        if (username != null && username.trim().isNotEmpty)
          'username': username.trim(),
      }, timeout: const Duration(seconds: 60));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(_authErrorBody(response));
      }
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    final response = await _post('/api/auth/email', {
      'email': email,
      'password': password,
      'mode': mode,
      if (displayName != null && displayName.trim().isNotEmpty)
        'display_name': displayName.trim(),
      if (username != null && username.trim().isNotEmpty)
        'username': username.trim(),
    }, timeout: const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> registerAccount(
    Map<String, dynamic> payload,
  ) async {
    final response = await _post(
      '/api/auth/register',
      payload,
      timeout: const Duration(seconds: 45),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Revoke this bearer session on the server before local sign-out. This is
  /// best-effort so a temporary network issue never traps the user in a session.
  Future<void> revokeCurrentSession() async {
    try {
      await _post(
        '/api/auth/logout',
        const {},
        timeout: const Duration(seconds: 5),
      );
    } catch (_) {}
  }

  Future<void> deactivateMyAccount({required String password}) async {
    final response = await _post('/api/me/deactivate', {
      'password': password,
    }, timeout: const Duration(seconds: 30));
    _ensureSuccessResponse(response);
  }

  Future<Map<String, dynamic>> deleteMyAccount({
    required String password,
  }) async {
    final response = await _post('/api/me/delete', {
      'password': password,
    }, timeout: const Duration(seconds: 30));
    _ensureSuccessResponse(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> verifyEmail({
    required String token,
    String? email,
  }) async {
    final response = await _post('/api/auth/verify-email', {
      'token': token,
      if (email != null && email.isNotEmpty) 'email': email,
    }, timeout: const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> resendVerification(String email) async {
    final response = await _post('/api/auth/resend-verification', {
      'email': email,
    }, timeout: const Duration(seconds: 45));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> verifyGuestSignIn({String? deviceId}) async {
    final response = await _post('/api/auth/guest', <String, dynamic>{
      if (deviceId != null && deviceId.isNotEmpty) 'device_id': deviceId,
    }, timeout: const Duration(seconds: 45));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> searchStories({
    String query = '',
    String genre = '',
    double minRating = 0,
  }) async {
    try {
      final uri = Uri(
        path: '/api/search',
        queryParameters: {
          'query': query,
          'genre': genre,
          'min_rating': minRating.toString(),
        },
      );
      final response = await _get(
        '${uri.path}?${uri.query}',
        timeout: const Duration(seconds: 45),
      );
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final decoded = jsonDecode(response.body);
      if (decoded is List) {
        return decoded
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      if (decoded is Map<String, dynamic>) {
        final items = decoded['items'];
        if (items is List) {
          return items
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
      return const <Map<String, dynamic>>[];
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  /// Search users/authors for Profile search chip.
  Future<List<Map<String, dynamic>>> searchUsers({String query = ''}) async {
    try {
      final q = Uri.encodeQueryComponent(query.trim());
      final response = await _get(
        '/api/users/search?query=$q',
        timeout: const Duration(seconds: 10),
      );
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body);
      if (payload is Map<String, dynamic>) {
        final items = payload['items'];
        if (items is List) {
          return items
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
      if (payload is List) {
        return payload
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      return const <Map<String, dynamic>>[];
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<List<Map<String, dynamic>>> fetchLibraryEntries() async {
    try {
      final response = await _get(
        '/api/library',
        timeout: const Duration(seconds: 90),
      );
      if (response.statusCode != 200) {
        debugPrint('fetchLibraryEntries status=${response.statusCode}');
        return const <Map<String, dynamic>>[];
      }
      final decoded = jsonDecode(response.body);
      if (decoded is! Map) return const <Map<String, dynamic>>[];
      final payload = Map<String, dynamic>.from(decoded);
      final raw = payload['items'] ?? payload['library_entries'] ?? const [];
      if (raw is! List) return const <Map<String, dynamic>>[];
      final items = raw
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      debugPrint('fetchLibraryEntries count=${items.length}');
      return items;
    } catch (e) {
      debugPrint('fetchLibraryEntries error: $e');
      return const <Map<String, dynamic>>[];
    }
  }

  Future<List<Map<String, dynamic>>> fetchChatMessages() async {
    try {
      final response = await _get('/api/chat/messages');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<void> sendChatMessage(String message) async {
    final response = await _post('/api/chat/messages', {
      'message': message,
      'sender': 'user',
    }, timeout: const Duration(seconds: 10));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Unable to send message');
    }
  }

  Future<void> recordBookShare(int bookId) async {
    if (bookId <= 0) return;
    final response = await _post('/api/books/$bookId/share', const {});
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Unable to record share');
    }
  }

  Future<List<Map<String, dynamic>>> fetchMyReviews() async {
    try {
      final response = await _get('/api/me/reviews');
      _ensureSuccessResponse(response);
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final items = body['items'];
      if (items is! List) return const [];
      return items.map<Map<String, dynamic>>((raw) {
        final m = Map<String, dynamic>.from(raw as Map);
        final book = m['book'];
        if (book is Map) {
          final b = Map<String, dynamic>.from(book);
          m['book_id'] = m['book_id'] ?? b['id'];
          m['book_title'] = m['book_title'] ?? b['title'];
          m['book_author'] = m['book_author'] ?? b['author'];
          m['cover_path'] = m['cover_path'] ?? b['cover_path'];
        }
        return m;
      }).toList();
    } catch (_) {
      return const [];
    }
  }

  /// Update signed-in user profile (onboarding + settings).
  Future<void> linkEmailPassword({
    String? email,
    String? username,
    required String password,
  }) async {
    final response = await _post('/api/me/link-email', {
      if (email != null && email.trim().isNotEmpty) 'email': email.trim(),
      if (username != null && username.trim().isNotEmpty)
        'username': username.trim(),
      'password': password,
    }, timeout: const Duration(seconds: 60));
    _ensureSuccessResponse(response);
  }

  /// Warm the serverless instance (Vercel cold start) before a critical write.
  Future<void> wakeBackend({
    Duration timeout = const Duration(seconds: 25),
  }) async {
    try {
      await _get('/api/health', timeout: timeout);
    } catch (_) {
      try {
        await _get('/', timeout: timeout);
      } catch (_) {}
    }
  }

  /// Profile save on the persistent Contabo backend.
  Future<Map<String, dynamic>> updateMyProfile(
    Map<String, dynamic> payload,
  ) async {
    final response = await _put(
      '/api/me',
      payload,
      timeout: const Duration(seconds: 30),
    );
    _ensureSuccessResponse(response);
    final decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      throw const FormatException('Invalid response from /api/me');
    }
    return Map<String, dynamic>.from(decoded);
  }

  Future<void> addLibraryEntry(Map<String, dynamic> payload) async {
    final response = await _post(
      '/api/library',
      payload,
      timeout: const Duration(seconds: 90),
    );
    _ensureSuccessResponse(response);
  }

  Future<void> updateLibraryEntry(int id, Map<String, dynamic> payload) async {
    final response = await _put(
      '/api/library/$id',
      payload,
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
  }

  Future<void> deleteLibraryEntry(int id) async {
    final response = await _delete(
      '/api/library/$id',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
  }

  Future<List<Map<String, dynamic>>> fetchReadingLists() async {
    try {
      final response = await _get('/api/reading-lists');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<Map<String, dynamic>> createReadingList(
    Map<String, dynamic> payload,
  ) async {
    final response = await _post(
      '/api/reading-lists',
      payload,
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    try {
      return jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      return const <String, dynamic>{'ok': true};
    }
  }

  Future<Map<String, dynamic>> fetchReadingListDetail(int listId) async {
    final response = await _get('/api/reading-lists/$listId');
    _ensureSuccessResponse(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Convenience: returns only the items array from a reading list detail.
  Future<List<Map<String, dynamic>>> fetchReadingListItems(int listId) async {
    final detail = await fetchReadingListDetail(listId);
    final items = detail['items'];
    if (items is List) {
      return List<Map<String, dynamic>>.from(items);
    }
    return const <Map<String, dynamic>>[];
  }

  Future<int> addReadingListItem(int listId, int bookId) async {
    final response = await _post('/api/reading-lists/$listId/items', {
      'book_id': bookId,
    }, timeout: const Duration(seconds: 45));
    _ensureSuccessResponse(response);
    try {
      return ((jsonDecode(response.body) as Map)['id'] as num?)?.toInt() ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<void> removeReadingListItem(int listId, int itemId) async {
    final response = await _delete(
      '/api/reading-lists/$listId/items/$itemId',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
  }

  Future<void> deleteReadingList(int listId) async {
    final response = await _delete(
      '/api/reading-lists/$listId',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
  }

  Future<List<Map<String, dynamic>>> fetchWriterStories() async {
    try {
      // Backend list was 100s+ with N+1 serialize; timeout raised as safety net.
      final response = await _get(
        '/api/write/stories',
        timeout: const Duration(seconds: 60),
      );
      if (response.statusCode == 401 || response.statusCode == 403) {
        throw Exception(_authErrorBody(response));
      }
      if (response.statusCode != 200) {
        throw Exception(_authErrorBody(response));
      }
      final decoded = jsonDecode(response.body);
      if (decoded is List) {
        return decoded
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      if (decoded is Map) {
        final payload = Map<String, dynamic>.from(decoded);
        final items = payload['items'] ?? payload['stories'] ?? payload['data'];
        if (items is List) {
          return items
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
      return const <Map<String, dynamic>>[];
    } catch (e) {
      debugPrint('fetchWriterStories error: $e');
      rethrow;
    }
  }

  Future<Map<String, dynamic>> fetchStoryDetail(int storyId) async {
    final response = await _get('/api/books/$storyId');
    _ensureSuccessResponse(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> fetchBookReviews(int bookId) async {
    try {
      final response = await _get(
        '/api/books/$bookId/reviews',
        timeout: const Duration(seconds: 60),
      );
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<void> createBookReview(
    int bookId,
    Map<String, dynamic> payload,
  ) async {
    final response = await _post(
      '/api/books/$bookId/reviews',
      payload,
      timeout: const Duration(seconds: 90),
    );
    _ensureSuccessResponse(response);
  }

  Future<void> updateMyBookReview(
    int bookId,
    Map<String, dynamic> payload,
  ) async {
    final response = await _put(
      '/api/books/$bookId/reviews/mine',
      payload,
      timeout: const Duration(seconds: 90),
    );
    _ensureSuccessResponse(response);
  }

  Future<void> deleteMyBookReview(int bookId) async {
    final response = await _delete(
      '/api/books/$bookId/reviews/mine',
      timeout: const Duration(seconds: 90),
    );
    _ensureSuccessResponse(response);
  }

  /// Live chapter comments (Inkitt reader bottom-sheet).
  Future<List<Map<String, dynamic>>> fetchChapterComments({
    required int bookId,
    required int chapterNumber,
  }) async {
    final payload = await fetchChapterCommentsPayload(
      bookId: bookId,
      chapterNumber: chapterNumber,
    );
    return List<Map<String, dynamic>>.from(
      (payload['items'] as List<dynamic>? ?? const <dynamic>[]),
    );
  }

  Future<Map<String, dynamic>> fetchChapterCommentsPayload({
    required int bookId,
    required int chapterNumber,
  }) async {
    try {
      final response = await _get(
        '/api/books/$bookId/chapters/$chapterNumber/comments',
      );
      if (response.statusCode != 200) {
        return const <String, dynamic>{
          'items': <Map<String, dynamic>>[],
          'paragraph_counts': <String, int>{},
        };
      }
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return payload;
    } catch (_) {
      return const <String, dynamic>{
        'items': <Map<String, dynamic>>[],
        'paragraph_counts': <String, int>{},
      };
    }
  }

  Future<Map<String, dynamic>> postChapterComment({
    required int bookId,
    required int chapterNumber,
    required String body,
    int? paragraphIndex,
  }) async {
    final payload = <String, dynamic>{'body': body};
    if (paragraphIndex != null) {
      payload['paragraph_index'] = paragraphIndex;
    }
    final response = await _post(
      '/api/books/$bookId/chapters/$chapterNumber/comments',
      payload,
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      if (decoded['item'] is Map) {
        return Map<String, dynamic>.from(decoded['item'] as Map);
      }
      return decoded;
    }
    if (decoded is Map) {
      return Map<String, dynamic>.from(decoded);
    }
    return {'ok': true};
  }

  /// Chapter-level comments only (excludes paragraph comments).
  Future<List<Map<String, dynamic>>> fetchChapterOnlyComments({
    required int bookId,
    required int chapterNumber,
  }) async {
    final payload = await fetchChapterCommentsPayload(
      bookId: bookId,
      chapterNumber: chapterNumber,
    );
    final chapter = payload['chapter_items'];
    if (chapter is List) {
      return chapter
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    final items = payload['items'];
    if (items is! List) return const <Map<String, dynamic>>[];
    return items
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((c) {
          final pi = (c['paragraph_index'] as num?)?.toInt() ?? -1;
          return pi < 0;
        })
        .toList();
  }

  /// Whole-story comments (story detail page). Not chapter/paragraph.
  Future<List<Map<String, dynamic>>> fetchBookComments(int bookId) async {
    try {
      final response = await _get('/api/books/$bookId/comments');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body);
      if (payload is Map && payload['items'] is List) {
        return (payload['items'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      return const <Map<String, dynamic>>[];
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<Map<String, dynamic>> postBookComment({
    required int bookId,
    required String body,
  }) async {
    final response = await _post('/api/books/$bookId/comments', {'body': body});
    if (response.statusCode >= 400) {
      throw Exception(response.body);
    }
    final payload = jsonDecode(response.body);
    if (payload is Map<String, dynamic>) return payload;
    return {'ok': true};
  }

  Future<Map<String, dynamic>> updateChapterComment({
    required int commentId,
    required String body,
  }) async {
    final response = await _put('/api/chapter-comments/$commentId', {
      'body': body,
    });
    if (response.statusCode >= 400) {
      throw Exception(response.body);
    }
    final payload = jsonDecode(response.body);
    if (payload is Map<String, dynamic>) return payload;
    return {'ok': true};
  }

  Future<void> deleteChapterComment(int commentId) async {
    final response = await _delete('/api/chapter-comments/$commentId');
    if (response.statusCode >= 400) {
      throw Exception(response.body);
    }
  }

  Future<Map<String, dynamic>> toggleChapterCommentLike(int commentId) async {
    final response = await _post(
      '/api/chapter-comments/$commentId/like',
      const {},
      timeout: const Duration(seconds: 30),
    );
    _ensureSuccessResponse(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Chapter-end reaction counts + current user's selections.
  Future<Map<String, dynamic>> fetchChapterReactions({
    required int bookId,
    required int chapterNumber,
  }) async {
    try {
      final response = await _get(
        '/api/books/$bookId/chapters/$chapterNumber/reactions',
      );
      if (response.statusCode != 200) {
        return const <String, dynamic>{'counts': {}, 'mine': []};
      }
      return jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      return const <String, dynamic>{'counts': {}, 'mine': []};
    }
  }

  /// Toggle a reaction label for the current user.
  Future<Map<String, dynamic>> toggleChapterReaction({
    required int bookId,
    required int chapterNumber,
    required String label,
  }) async {
    final response = await _post(
      '/api/books/$bookId/chapters/$chapterNumber/reactions',
      {'label': label},
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> fetchUserStories(int userId) async {
    try {
      final response = await _get('/api/users/$userId/stories');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<void> blockUser(int userId) async {
    final response = await _post(
      '/api/users/$userId/block',
      {},
      timeout: const Duration(seconds: 30),
    );
    _ensureSuccessResponse(response);
  }

  Future<bool> fetchBlockStatus(int userId) async {
    final response = await _get(
      '/api/users/$userId/block',
      timeout: const Duration(seconds: 20),
    );
    if (response.statusCode != 200) return false;
    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    return payload['blocked'] == true;
  }

  Future<void> unblockUser(int userId) async {
    final response = await _delete(
      '/api/users/$userId/block',
      timeout: const Duration(seconds: 30),
    );
    _ensureSuccessResponse(response);
  }

  Future<void> reportUser(int userId, {String reason = ''}) async {
    final response = await _post('/api/users/$userId/report', {
      'reason': reason,
    }, timeout: const Duration(seconds: 30));
    _ensureSuccessResponse(response);
  }

  Future<List<Map<String, dynamic>>> fetchUserReadingLists(int userId) async {
    try {
      final response = await _get('/api/users/$userId/reading-lists');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<List<Map<String, dynamic>>> fetchUserReviews(int userId) async {
    try {
      final response = await _get('/api/users/$userId/reviews');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<List<Map<String, dynamic>>> fetchUserWall(int userId) async {
    try {
      final response = await _get('/api/users/$userId/wall');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<List<Map<String, dynamic>>> fetchUserActivity(int userId) async {
    try {
      final response = await _get('/api/users/$userId/activity');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<void> postUserWall(
    int userId,
    String body, {
    String? imagePath,
  }) async {
    final response = await _post('/api/users/$userId/wall', {
      'body': body,
      if (imagePath != null && imagePath.isNotEmpty) 'image_path': imagePath,
    });
    _ensureSuccessResponse(response);
  }

  Future<Map<String, dynamic>> likeWallPost(int postId) async {
    final response = await _post('/api/wall/$postId/like', {});
    _ensureSuccessResponse(response);
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return {
      'likes': (data['likes'] as num?)?.toInt() ?? 0,
      'liked': data['liked'] == true,
    };
  }

  Future<void> commentWallPost(int postId, String body) async {
    final response = await _post('/api/wall/$postId/comment', {'body': body});
    _ensureSuccessResponse(response);
  }

  Future<Map<String, dynamic>> fetchBookLike(int bookId) async {
    try {
      final response = await _get('/api/books/$bookId/like');
      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      }
    } catch (_) {}
    return const <String, dynamic>{'liked': false, 'likes_count': 0};
  }

  Future<Map<String, dynamic>> likeBook(int bookId) async {
    final response = await _post(
      '/api/books/$bookId/like',
      const <String, dynamic>{},
      timeout: const Duration(seconds: 30),
    );
    _ensureSuccessResponse(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> unlikeBook(int bookId) async {
    final response = await _delete(
      '/api/books/$bookId/like',
      timeout: const Duration(seconds: 30),
    );
    _ensureSuccessResponse(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> fetchMyFollowers() async {
    try {
      final response = await _get(
        '/api/me/followers',
        timeout: const Duration(seconds: 30),
      );
      if (response.statusCode != 200) return const [];
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final items = body['items'];
      if (items is! List) return const [];
      return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> fetchMyFollowing() async {
    try {
      final response = await _get(
        '/api/me/following',
        timeout: const Duration(seconds: 30),
      );
      if (response.statusCode != 200) return const [];
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final items = body['items'];
      if (items is! List) return const [];
      return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> fetchUserFollowers(int userId) async {
    try {
      final response = await _get(
        '/api/users/$userId/followers',
        timeout: const Duration(seconds: 30),
      );
      if (response.statusCode != 200) return const [];
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final items = body['items'];
      if (items is! List) return const [];
      return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> fetchUserFollowingList(int userId) async {
    try {
      final response = await _get(
        '/api/users/$userId/following',
        timeout: const Duration(seconds: 30),
      );
      if (response.statusCode != 200) return const [];
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final items = body['items'];
      if (items is! List) return const [];
      return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<Map<String, dynamic>> followAuthor(int authorId) async {
    final response = await _post(
      '/api/authors/$authorId/follow',
      const <String, dynamic>{},
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    try {
      return jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      return const <String, dynamic>{'ok': true};
    }
  }

  Future<Map<String, dynamic>> unfollowAuthor(int authorId) async {
    final response = await _delete(
      '/api/authors/$authorId/follow',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    try {
      return jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      return const <String, dynamic>{'ok': true};
    }
  }

  Future<bool> fetchAuthorFollowing(int authorId) async {
    final status = await fetchAuthorFollowStatus(authorId);
    return status['following'] == true;
  }

  Future<Map<String, dynamic>> fetchAuthorFollowStatus(int authorId) async {
    final response = await _get('/api/authors/$authorId/follow');
    _ensureSuccessResponse(response);
    final payload = jsonDecode(response.body);
    if (payload is! Map) {
      throw const FormatException('Invalid author follow response');
    }
    return Map<String, dynamic>.from(payload);
  }

  Future<Map<String, dynamic>> setAuthorNotifications(
    int authorId, {
    required bool enabled,
  }) async {
    final response = await _put(
      '/api/authors/$authorId/notifications',
      <String, dynamic>{'enabled': enabled},
    );
    _ensureSuccessResponse(response);
    final payload = jsonDecode(response.body);
    if (payload is! Map) {
      throw const FormatException('Invalid author notification response');
    }
    return Map<String, dynamic>.from(payload);
  }

  /// Fetch public book detail including tags and author_user_id.
  Future<Map<String, dynamic>?> fetchPublicBook(int bookId) async {
    try {
      final response = await _get('/api/books/$bookId');
      if (response.statusCode != 200) return null;
      return jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// Distinct genres used across books (for genre dropdown).
  Future<List<String>> fetchGenres() async {
    try {
      final response = await _get('/api/genres');
      if (response.statusCode != 200) return const <String>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final items = payload['items'];
      if (items is! List) return const <String>[];
      return items
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
    } catch (_) {
      return const <String>[];
    }
  }

  /// Create a genre so it appears in the shared dropdown for everyone.
  Future<String> createGenre(String name) async {
    final response = await _post('/api/genres', {
      'name': name.trim(),
    }, timeout: const Duration(seconds: 60));
    _ensureSuccessResponse(response);
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final n = (body['name'] as String?)?.trim();
      if (n != null && n.isNotEmpty) return n;
    } catch (_) {}
    return name.trim();
  }

  /// Publish a writer story (sets status_text to Published).
  Future<void> publishWriterStory(int storyId) async {
    final response = await _post(
      '/api/write/stories/$storyId/publish',
      const <String, dynamic>{},
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
  }

  /// Report a story. After 3 unique reporters, it surfaces in Admin → Reports.
  Future<Map<String, dynamic>> reportBook(
    int bookId, {
    String reason = '',
  }) async {
    final response = await _post('/api/books/$bookId/report', {
      'reason': reason,
    }, timeout: const Duration(seconds: 45));
    _ensureSuccessResponse(response);
    try {
      return jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      return const <String, dynamic>{'ok': true};
    }
  }

  /// List admin-managed hashtags (optional search query).
  Future<List<Map<String, dynamic>>> fetchTags({String? query}) async {
    final q = query?.trim() ?? '';
    final now = DateTime.now();
    // Memory cache for full tag list (create story / search chips)
    if (q.isEmpty &&
        _tagsMemoryCache != null &&
        _tagsMemoryCacheAt != null &&
        now.difference(_tagsMemoryCacheAt!) < _tagsMemoryTtl) {
      return List<Map<String, dynamic>>.from(_tagsMemoryCache!);
    }
    try {
      final path = q.isEmpty
          ? '/api/tags'
          : '/api/tags?q=${Uri.encodeQueryComponent(q)}';
      final response = await _get(path, timeout: const Duration(seconds: 12));
      if (response.statusCode != 200) {
        return q.isEmpty && _tagsMemoryCache != null
            ? List<Map<String, dynamic>>.from(_tagsMemoryCache!)
            : const <Map<String, dynamic>>[];
      }
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final items = List<Map<String, dynamic>>.from(
        payload['items'] as List<dynamic>,
      );
      if (q.isEmpty) {
        _tagsMemoryCache = items;
        _tagsMemoryCacheAt = now;
      }
      return items;
    } catch (_) {
      return q.isEmpty && _tagsMemoryCache != null
          ? List<Map<String, dynamic>>.from(_tagsMemoryCache!)
          : const <Map<String, dynamic>>[];
    }
  }

  /// Books that have the given hashtag.
  Future<List<Map<String, dynamic>>> fetchBooksByTag(
    String tagName, {
    String sort = 'top',
  }) async {
    try {
      final encoded = Uri.encodeComponent(tagName.trim().replaceFirst('#', ''));
      final encodedSort = Uri.encodeQueryComponent(sort);
      final response = await _get('/api/tags/$encoded/books?sort=$encodedSort');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  /// Books for a genre (public only) — Discover / genre hub.
  Future<List<Map<String, dynamic>>> fetchBooksByGenre(String genreName) async {
    try {
      final encoded = Uri.encodeComponent(genreName.trim());
      final response = await _get('/api/genres/$encoded/books');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        final items = decoded['items'];
        if (items is List) {
          return items
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
      return const <Map<String, dynamic>>[];
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<Map<String, dynamic>> followTag(String tagName) async {
    final encoded = Uri.encodeComponent(tagName.trim().replaceFirst('#', ''));
    final response = await _post(
      '/api/tags/$encoded/follow',
      const <String, dynamic>{},
      timeout: const Duration(seconds: 30),
    );
    _ensureSuccessResponse(response);
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }

  Future<Map<String, dynamic>> unfollowTag(String tagName) async {
    final encoded = Uri.encodeComponent(tagName.trim().replaceFirst('#', ''));
    final response = await _delete(
      '/api/tags/$encoded/follow',
      timeout: const Duration(seconds: 30),
    );
    _ensureSuccessResponse(response);
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }

  Future<bool> isFollowingTag(String tagName) async {
    try {
      final encoded = Uri.encodeComponent(tagName.trim().replaceFirst('#', ''));
      final response = await _get(
        '/api/tags/$encoded/follow',
        timeout: const Duration(seconds: 20),
      );
      if (response.statusCode != 200) return false;
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return (payload['following'] as bool?) ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> checkTagFollow(String tagName) async {
    try {
      final encoded = Uri.encodeComponent(tagName.trim().replaceFirst('#', ''));
      final response = await _get(
        '/api/tags/$encoded/follow',
        timeout: const Duration(seconds: 20),
      );
      if (response.statusCode != 200) {
        return {'following': false, 'notify': false, 'followers': 0};
      }
      return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
    } catch (_) {
      return {'following': false, 'notify': false, 'followers': 0};
    }
  }

  Future<Map<String, dynamic>> setTagNotify(
    String tagName, {
    required bool notify,
  }) async {
    final encoded = Uri.encodeComponent(tagName.trim().replaceFirst('#', ''));
    final response = await _post('/api/tags/$encoded/notify', {
      'notify': notify,
    }, timeout: const Duration(seconds: 30));
    _ensureSuccessResponse(response);
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }

  Future<List<Map<String, dynamic>>> fetchFollowedTags() async {
    try {
      final response = await _get(
        '/api/me/followed-tags',
        timeout: const Duration(seconds: 30),
      );
      if (response.statusCode != 200) return const [];
      final payload = jsonDecode(response.body);
      if (payload is Map && payload['items'] is List) {
        return (payload['items'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
      return const [];
    } catch (_) {
      return const [];
    }
  }

  /// Other public books by the same author (for "More Stories by Author").
  Future<List<Map<String, dynamic>>> fetchAuthorBooks(
    int authorId, {
    int? excludeBookId,
  }) async {
    try {
      final qs = excludeBookId != null ? '?exclude_id=$excludeBookId' : '';
      final response = await _get('/api/authors/$authorId/books$qs');
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  Future<Map<int, bool>> fetchAuthorsFollowing(List<int> authorIds) async {
    if (authorIds.isEmpty) return <int, bool>{};
    final idsParam = authorIds.join(',');
    try {
      final response = await _get('/api/authors/follow?ids=$idsParam');
      if (response.statusCode != 200) return <int, bool>{};
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final raw = Map<String, dynamic>.from(
        payload['following'] as Map<String, dynamic>? ?? {},
      );
      final Map<int, bool> out = {};
      raw.forEach((k, v) {
        final key = int.tryParse(k);
        if (key != null) out[key] = (v as bool?) ?? false;
      });
      return out;
    } catch (_) {
      return <int, bool>{};
    }
  }

  Future<Map<String, dynamic>?> fetchWriterStory(int id) async {
    try {
      final response = await _get('/api/write/stories/$id');
      if (response.statusCode != 200) return null;
      final payload = jsonDecode(response.body);
      if (payload is Map<String, dynamic>) return payload;
      if (payload is Map) return Map<String, dynamic>.from(payload);
      return null;
    } catch (e) {
      debugPrint('fetchWriterStory error: $e');
      return null;
    }
  }

  /// After a client timeout, recover the id if the server actually created the story.
  Future<int> findWriterStoryIdByTitle(String title) async {
    final want = title.trim().toLowerCase();
    if (want.isEmpty) return 0;
    try {
      final list = await fetchWriterStories();
      for (final s in list) {
        final t = (s['title'] ?? '').toString().trim().toLowerCase();
        if (t == want) {
          return (s['id'] as num?)?.toInt() ?? 0;
        }
      }
      // Fallback: match Untitled Story newest first (list is usually newest-first)
      if (want == 'untitled story') {
        for (final s in list) {
          final t = (s['title'] ?? '').toString().trim().toLowerCase();
          if (t == want) {
            return (s['id'] as num?)?.toInt() ?? 0;
          }
        }
      }
    } catch (_) {}
    return 0;
  }

  Future<int> createWriterStory(Map<String, dynamic> payload) async {
    final response = await _post(
      '/api/write/stories',
      payload,
      timeout: const Duration(seconds: 90),
    );
    _ensureSuccessResponse(response);
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final id =
          (body['id'] as num?)?.toInt() ??
          (body['story_id'] as num?)?.toInt() ??
          0;
      return id;
    } catch (_) {
      return 0;
    }
  }

  Future<void> updateWriterStory(int id, Map<String, dynamic> payload) async {
    final response = await _put(
      '/api/write/stories/$id',
      payload,
      timeout: const Duration(seconds: 90),
    );
    _ensureSuccessResponse(response);
  }

  Future<void> deleteWriterStory(int id) async {
    final response = await _delete(
      '/api/write/stories/$id',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
  }

  Future<List<Map<String, dynamic>>> fetchStoryChapters(int storyId) async {
    if (storyId <= 0) {
      throw ArgumentError.value(storyId, 'storyId', 'Must be positive');
    }
    final response = await _get(
      '/api/write/stories/$storyId/chapters',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    final payload = jsonDecode(response.body);
    if (payload is! Map || payload['items'] is! List) {
      throw const FormatException(
        'Invalid response from /api/write/stories/{storyId}/chapters',
      );
    }
    return (payload['items'] as List)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  /// Chapters visible on a story detail page. Even the owner receives only
  /// live chapters here; the writer manager continues to use fetchStoryChapters.
  Future<List<Map<String, dynamic>>> fetchPublicStoryChapters(
    int storyId,
  ) async {
    if (storyId <= 0) {
      throw ArgumentError.value(storyId, 'storyId', 'Must be positive');
    }
    final response = await _get(
      '/api/write/stories/$storyId/chapters?public_only=true',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
    final payload = jsonDecode(response.body);
    if (payload is! Map || payload['items'] is! List) {
      throw const FormatException('Invalid public chapter response');
    }
    return (payload['items'] as List)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<int?> createStoryChapter(
    int storyId,
    Map<String, dynamic> payload,
  ) async {
    if (storyId <= 0) {
      throw Exception('Invalid story id — cannot create chapter');
    }
    final response = await _post(
      '/api/write/stories/$storyId/chapters',
      payload,
      timeout: const Duration(seconds: 90),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final id = (data['id'] as num?)?.toInt();
    if (id == null) {
      throw Exception('Server did not return chapter id');
    }
    return id;
  }

  Future<void> updateStoryChapter(
    int chapterId,
    Map<String, dynamic> payload,
  ) async {
    final response = await _put(
      '/api/write/chapters/$chapterId',
      payload,
      timeout: const Duration(seconds: 90),
    );
    _ensureSuccessResponse(response);
  }

  Future<List<Map<String, dynamic>>> fetchStoryChapterRevisions(
    int chapterId,
  ) async {
    try {
      final response = await _get(
        '/api/write/chapters/$chapterId/revisions',
        timeout: const Duration(seconds: 45),
      );
      if (response.statusCode != 200) return const <Map<String, dynamic>>[];
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      return List<Map<String, dynamic>>.from(payload['items'] as List<dynamic>);
    } catch (_) {
      return const <Map<String, dynamic>>[];
    }
  }

  /// Restore a previous chapter revision into the live chapter.
  Future<Map<String, dynamic>> restoreStoryChapterRevision(
    int chapterId,
    int revisionId,
  ) async {
    final response = await _post(
      '/api/write/chapters/$chapterId/revisions/$revisionId/restore',
      {},
      timeout: const Duration(seconds: 45),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Could not restore revision (${response.statusCode})');
    }
    final payload = jsonDecode(response.body);
    if (payload is Map<String, dynamic>) return payload;
    return {'ok': true};
  }

  Future<void> deleteStoryChapter(int chapterId) async {
    final response = await _delete(
      '/api/write/chapters/$chapterId',
      timeout: const Duration(seconds: 45),
    );
    _ensureSuccessResponse(response);
  }

  /// Inkitt-style: reorder all chapters of a story (full ordered id list).
  Future<Map<String, dynamic>> reorderStoryChapters(
    int storyId,
    List<int> chapterIds,
  ) async {
    final response = await _post(
      '/api/write/stories/$storyId/chapters/reorder',
      {'chapter_ids': chapterIds},
      timeout: const Duration(seconds: 60),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    final payload = jsonDecode(response.body);
    if (payload is Map<String, dynamic>) return payload;
    return {'ok': true};
  }

  /// Publish all eligible draft chapters (min 60 words by default).
  Future<Map<String, dynamic>> publishAllStoryChapters(
    int storyId, {
    List<int>? chapterIds,
    int minWords = 60,
  }) async {
    final response = await _post(
      '/api/write/stories/$storyId/chapters/publish-all',
      {'chapter_ids': ?chapterIds, 'min_words': minWords},
      timeout: const Duration(seconds: 90),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_authErrorBody(response));
    }
    final payload = jsonDecode(response.body);
    if (payload is Map<String, dynamic>) return payload;
    return {'ok': true};
  }

  static final Map<String, dynamic> _fallbackData = <String, dynamic>{
    'discover_tabs': ['New', 'Popular', 'Fantasy', 'Fanfiction', 'Newsfeed'],
    'recently_updated': [],
    'recently_completed': [],
    'discover_books': [],
    'featured_book': {
      'id': 1,
      'title': 'Loading...',
      'author': '',
      'description': '',
      'status_text': '',
      'rating': 0,
      'genre': '',
      'cta': 'Read now',
    },
    'explore_topics': [],
    'library_entries': [],
    'write_screen': {
      'manage_tabs': ['Manage Stories', 'Analytics'],
      'story_tabs': ['Published', 'Drafts'],
      'filter_label': 'All stories',
      'sort_label': 'Recently Updated',
      'empty_title': "You haven't published any stories yet",
      'empty_cta': 'Write a Story',
    },
    'notifications': [],
    'menu_sections': [],
    'profile': {
      'display_name': 'Reader',
      'username': '@reader',
      'following': 0,
      'followers': 0,
      'blocked': 0,
      'chapters_read': 0,
      'social_karma': 0,
      'day_streak': 0,
      'reading_lists': [],
    },
    'achievements': [],
  };
}
