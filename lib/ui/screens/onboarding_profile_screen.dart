import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image_picker/image_picker.dart';

import '../../data/services/api_service.dart';
import '../widgets/image_adjustment.dart';

/// Shown for new users before Discover — must complete once.
class OnboardingProfileScreen extends StatefulWidget {
  const OnboardingProfileScreen({
    super.key,
    required this.apiService,
    this.initialDisplayName = '',
    this.initialPhotoUrl = '',
    this.initialEmail = '',
    required this.onDone,
  });

  final ApiService apiService;
  final String initialDisplayName;
  final String initialPhotoUrl;
  final String initialEmail;
  final VoidCallback onDone;

  @override
  State<OnboardingProfileScreen> createState() =>
      _OnboardingProfileScreenState();
}

class _OnboardingProfileScreenState extends State<OnboardingProfileScreen> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _usernameCtrl;
  late final TextEditingController _bioCtrl;
  late final TextEditingController _emailCtrl;
  late final TextEditingController _passCtrl;
  String? _gender;
  DateTime? _birthDate;
  String? _country;
  String? _detectedCountry;
  bool _saving = false;

  String _photoUrl = '';
  String _coverUrl = '';
  Uint8List? _localPhoto;
  Uint8List? _localCover;

  static const _genders = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
  static const List<String> _countryOptions = [
    'Sri Lanka',
    'India',
    'United States',
    'United Kingdom',
    'Canada',
    'Australia',
    'Singapore',
    'Malaysia',
    'United Arab Emirates',
    'Germany',
    'France',
    'Japan',
    'Other',
  ];

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.initialDisplayName);
    _usernameCtrl = TextEditingController();
    _bioCtrl = TextEditingController();
    _emailCtrl = TextEditingController();
    _passCtrl = TextEditingController();
    _emailCtrl.text = widget.initialEmail;
    _photoUrl = widget.initialPhotoUrl; // Google avatar if present
    unawaited(_detectCountryFromIp());
  }

  Future<void> _detectCountryFromIp() async {
    try {
      // Lightweight IP geo (no API key). Falls back silently.
      final uri = Uri.parse('https://ipapi.co/json/');
      final client = HttpClient();
      final req = await client.getUrl(uri).timeout(const Duration(seconds: 6));
      final res = await req.close().timeout(const Duration(seconds: 6));
      if (res.statusCode == 200) {
        final body = await res.transform(utf8.decoder).join();
        // avoid full json dep if needed - use simple parse
        final m = RegExp(r'"country_name"\s*:\s*"([^"]+)"').firstMatch(body);
        final code = RegExp(r'"country_code"\s*:\s*"([^"]+)"').firstMatch(body);
        final name = m?.group(1);
        if (name != null && name.isNotEmpty && mounted) {
          setState(() {
            _detectedCountry = name;
            _country ??= name;
          });
        } else if (code != null && mounted) {
          setState(() {
            _detectedCountry = code.group(1);
            _country ??= code.group(1);
          });
        }
      }
      client.close(force: true);
    } catch (_) {}
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _usernameCtrl.dispose();
    _bioCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickImage({required bool cover}) async {
    final picker = ImagePicker();
    final x = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: cover ? 1600 : 800,
      maxHeight: cover ? 900 : 800,
      imageQuality: 85,
    );
    if (x == null) return;
    final adjusted = await showImageAdjustmentDialog(
      context,
      x,
      aspectRatio: cover ? 2.8 : 1,
      circular: !cover,
    );
    if (adjusted == null) return;
    setState(() {
      if (cover) {
        _localCover = adjusted;
      } else {
        _localPhoto = adjusted;
      }
    });
  }

  Future<String?> _uploadIfNeeded(
    Uint8List? imageBytes,
    String filename,
  ) async {
    if (imageBytes == null) return null;
    final res = await widget.apiService.uploadUserImage(imageBytes, filename);
    final path =
        (res['path'] ??
                res['url'] ??
                res['photo_url'] ??
                res['cover_url'] ??
                res['cover_path'] ??
                '')
            .toString();
    if (path.isEmpty) throw Exception('The server returned no image path.');
    return path;
  }

  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 18, now.month, now.day),
      firstDate: DateTime(1920),
      lastDate: DateTime(now.year - 16, now.month, now.day),
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    final username = _usernameCtrl.text
        .trim()
        .replaceFirst('@', '')
        .toLowerCase();
    final password = _passCtrl.text;
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a display name')),
      );
      return;
    }
    if (_birthDate == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Birthday is required')));
      return;
    }
    final today = DateTime.now();
    var age = today.year - _birthDate!.year;
    if (today.month < _birthDate!.month ||
        (today.month == _birthDate!.month && today.day < _birthDate!.day)) {
      age--;
    }
    if (age < 16) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('You must be at least 16 to use Wingsaga'),
        ),
      );
      return;
    }
    if ((_country ?? '').trim().isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Country is required')));
      return;
    }
    if (username.length < 3 ||
        username.length > 32 ||
        !RegExp(r'^[a-z0-9_]+$').hasMatch(username)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Username is required: 3–32 letters, numbers, or underscores',
          ),
        ),
      );
      return;
    }
    if (!RegExp(
      r'^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$',
    ).hasMatch(password)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Password is required: 8+ characters with a letter, number, and symbol',
          ),
        ),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final uploads = await Future.wait([
        _uploadIfNeeded(_localPhoto, 'profile-photo.png'),
        _uploadIfNeeded(_localCover, 'profile-cover.png'),
      ]);
      final uploadedPhoto = uploads[0];
      final uploadedCover = uploads[1];
      if (uploadedPhoto != null) _photoUrl = uploadedPhoto;
      if (uploadedCover != null) _coverUrl = uploadedCover;

      await widget.apiService.updateMyProfile({
        'display_name': name,
        'username': username,
        'bio': _bioCtrl.text.trim(),
        if (_gender != null) 'gender': _gender,
        if ((_country ?? '').trim().isNotEmpty)
          'country': (_country ?? '').trim(),
        if (_birthDate != null)
          'birth_date':
              '${_birthDate!.year.toString().padLeft(4, '0')}-${_birthDate!.month.toString().padLeft(2, '0')}-${_birthDate!.day.toString().padLeft(2, '0')}',
        'profile_complete': true,
        if (_photoUrl.isNotEmpty) 'photo_url': _photoUrl,
        if (_coverUrl.isNotEmpty) 'cover_url': _coverUrl,
      });
      final em = _emailCtrl.text.trim();
      if (password.isNotEmpty) {
        await widget.apiService.linkEmailPassword(
          email: em,
          username: username,
          password: password,
        );
      }
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool('profile_complete_local_done', true);
        final normalizedEmail = em.toLowerCase();
        if (normalizedEmail.contains('@')) {
          await prefs.setBool('profile_complete_local_$normalizedEmail', true);
        }
      } catch (_) {}
      if (!mounted) return;
      widget.onDone();
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase();
      final isTimeout =
          msg.contains('timeout') ||
          msg.contains('timed out') ||
          msg.contains('connection') ||
          msg.contains('503') ||
          msg.contains('502');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 6),
          content: Text(
            isTimeout
                ? 'Server was slow to respond. Tap Save again — your data is still on this screen.'
                : 'Could not save profile: $e',
          ),
          action: isTimeout
              ? SnackBarAction(
                  label: 'Retry',
                  onPressed: () {
                    if (!_saving) _save();
                  },
                )
              : null,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  ImageProvider? get _avatarProvider {
    if (_localPhoto != null) return MemoryImage(_localPhoto!);
    if (_photoUrl.isNotEmpty) {
      final url = widget.apiService.resolveAssetUrl(_photoUrl);
      if (url.startsWith('http')) return NetworkImage(url);
    }
    return null;
  }

  ImageProvider? get _coverProvider {
    if (_localCover != null) return MemoryImage(_localCover!);
    if (_coverUrl.isNotEmpty) {
      final url = widget.apiService.resolveAssetUrl(_coverUrl);
      if (url.startsWith('http')) return NetworkImage(url);
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    // First-time only — cannot skip until saved (sets profile_complete).
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
            children: [
              Text(
                'Complete your profile',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'This appears on your public profile for readers and authors.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 20),
              // Cover
              GestureDetector(
                onTap: _saving ? null : () => _pickImage(cover: true),
                child: Container(
                  height: 120,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF6F5FA),
                    borderRadius: BorderRadius.circular(12),
                    image: _coverProvider != null
                        ? DecorationImage(
                            image: _coverProvider!,
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  alignment: Alignment.center,
                  child: _coverProvider == null
                      ? const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_photo_alternate_outlined, size: 28),
                            SizedBox(height: 4),
                            Text(
                              'Add cover photo',
                              style: TextStyle(fontSize: 13),
                            ),
                          ],
                        )
                      : null,
                ),
              ),
              const SizedBox(height: 8),
              // Avatar overlapping
              Center(
                child: GestureDetector(
                  onTap: _saving ? null : () => _pickImage(cover: false),
                  child: Stack(
                    children: [
                      CircleAvatar(
                        radius: 44,
                        backgroundColor: const Color(0xFFDDE2DF),
                        backgroundImage: _avatarProvider,
                        child: _avatarProvider == null
                            ? const Icon(
                                Icons.person,
                                size: 40,
                                color: Colors.black45,
                              )
                            : null,
                      ),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Color(0xFF16856A),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.camera_alt,
                            size: 14,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (widget.initialPhotoUrl.isNotEmpty && _localPhoto == null)
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text(
                    'Using your Google photo — tap to change',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.black45),
                  ),
                ),
              const SizedBox(height: 20),
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Display name *',
                  border: OutlineInputBorder(),
                ),
                textCapitalization: TextCapitalization.words,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _bioCtrl,
                maxLines: 3,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                autocorrect: false,
                enableSuggestions: false,
                spellCheckConfiguration:
                    const SpellCheckConfiguration.disabled(),
                decoration: const InputDecoration(
                  labelText: 'Bio',
                  hintText: 'A short intro about you',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              DropdownMenu<String>(
                initialSelection: _gender,
                label: const Text('Gender'),
                dropdownMenuEntries: _genders
                    .map((g) => DropdownMenuEntry<String>(value: g, label: g))
                    .toList(),
                onSelected: (v) => setState(() => _gender = v),
                expandedInsets: EdgeInsets.zero,
              ),
              const SizedBox(height: 14),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  _birthDate == null
                      ? 'Birthday (required)'
                      : 'Birthday: ${_birthDate!.year}-${_birthDate!.month.toString().padLeft(2, '0')}-${_birthDate!.day.toString().padLeft(2, '0')}',
                ),
                trailing: const Icon(Icons.calendar_today_outlined),
                onTap: _pickBirthDate,
              ),

              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue:
                    (_country != null &&
                        (_countryOptions.contains(_country) ||
                            _country == _detectedCountry))
                    ? _country
                    : null,
                decoration: const InputDecoration(
                  labelText: 'Country (required)',
                  border: OutlineInputBorder(),
                ),
                items: [
                  for (final c in {
                    ..._countryOptions,
                    if ((_detectedCountry ?? '').isNotEmpty) _detectedCountry!,
                  })
                    DropdownMenuItem(value: c, child: Text(c)),
                ],
                onChanged: (v) => setState(() => _country = v),
              ),
              if ((_detectedCountry ?? '').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'Detected from network: $_detectedCountry',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),

              const SizedBox(height: 8),
              TextField(
                controller: _usernameCtrl,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                autocorrect: false,
                enableSuggestions: false,
                spellCheckConfiguration:
                    const SpellCheckConfiguration.disabled(),
                decoration: const InputDecoration(
                  labelText: 'Username *',
                  hintText: '3–32 letters, numbers, or underscores',
                  prefixText: '@',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Account login (optional)',
                style: Theme.of(
                  context,
                ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(
                'Set an email and password so you can also sign in without Google.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                decoration: const InputDecoration(
                  labelText: 'Email (optional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passCtrl,
                obscureText: true,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                decoration: const InputDecoration(
                  labelText: 'Password * (8+ with letter, number, symbol)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            ),
                            SizedBox(width: 12),
                            Flexible(
                              child: Text(
                                'Saving… please wait',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        )
                      : const Text('Save and continue'),
                ),
              ),
              if (_saving)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    'Saving your profile. Please keep the app open.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
