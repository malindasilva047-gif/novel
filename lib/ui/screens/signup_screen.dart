import 'dart:io';

import 'package:flutter/material.dart';
import '../../core/theme/app_styles.dart';
import 'package:image_picker/image_picker.dart';

import '../../data/services/api_service.dart';
import 'email_verify_screen.dart';

/// Create Account — pixel-matched to product mock (purple theme).
class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key, required this.onContinue, this.apiService});

  final Future<void> Function(
    String method, {
    String? email,
    String? password,
    String? mode,
    String? displayName,
    String? username,
  })
  onContinue;

  final ApiService? apiService;

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _userCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _pass2Ctrl = TextEditingController();
  bool _obscure = true;
  bool _obscure2 = true;
  bool _busy = false;
  bool _agreed = false;
  DateTime? _birthDate;
  String? _gender;
  String? _country;
  File? _photo;
  String _photoUrl = '';

  static const _purple = Color(0xFF16856A);
  static const _genders = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
  static const _countries = [
    'United States',
    'United Kingdom',
    'India',
    'Sri Lanka',
    'Canada',
    'Australia',
    'Germany',
    'France',
    'Other',
  ];

  ApiService get _api => widget.apiService ?? ApiService();

  @override
  void dispose() {
    _nameCtrl.dispose();
    _userCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _pass2Ctrl.dispose();
    super.dispose();
  }

  String? _validatePassword(String? v) {
    final p = v ?? '';
    if (p.length < 8) return 'At least 8 characters';
    if (!RegExp(r'[A-Za-z]').hasMatch(p)) return 'Include a letter';
    if (!RegExp(r'[0-9]').hasMatch(p)) return 'Include a number';
    if (!RegExp(r'[^A-Za-z0-9]').hasMatch(p)) return 'Include a symbol';
    return null;
  }

  Future<void> _pickPhoto() async {
    final x = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      maxHeight: 800,
      imageQuality: 85,
    );
    if (x == null) return;
    setState(() => _photo = File(x.path));
  }

  Future<String?> _upload(File? file) async {
    if (file == null) return null;
    try {
      final bytes = await file.readAsBytes();
      final name = file.path.split(RegExp(r'[\\/]')).last;
      final res = await _api.uploadUserImage(
        bytes,
        name.isEmpty ? 'photo.jpg' : name,
      );
      final path = (res['path'] ?? res['url'] ?? res['photo_url'] ?? '')
          .toString();
      return path.isEmpty ? null : path;
    } catch (_) {
      return null;
    }
  }

  Future<void> _pickBirthday() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 18, now.month, now.day),
      firstDate: DateTime(1900),
      lastDate: DateTime(now.year - 16, now.month, now.day),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: _purple),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_agreed) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please agree to Privacy Policy and Terms'),
        ),
      );
      return;
    }
    if (_birthDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select your birthday')),
      );
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
        const SnackBar(content: Text('You must be at least 16 to create an account')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final upPhoto = await _upload(_photo);
      if (upPhoto != null) _photoUrl = upPhoto;

      final result = await _api.registerAccount({
        'email': _emailCtrl.text.trim(),
        'password': _passCtrl.text,
        'display_name': _nameCtrl.text.trim(),
        'username': _userCtrl.text.trim().replaceAll('@', ''),
        if (_photoUrl.isNotEmpty) 'photo_url': _photoUrl,
        if (_gender != null) 'gender': _gender,
        if (_country != null) 'country': _country,
        'birth_date':
            '${_birthDate!.year.toString().padLeft(4, '0')}-${_birthDate!.month.toString().padLeft(2, '0')}-${_birthDate!.day.toString().padLeft(2, '0')}',
        'profile_complete': true,
        'accepted_terms': _agreed,
      });

      final needsVerify = result['needs_verification'] == true;
      if (needsVerify) {
        // Do NOT auto-login until email is verified (backend returns 403).
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                result['message']?.toString() ??
                    'Check your email for a verification code, then log in.',
              ),
            ),
          );
          await Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => EmailVerifyScreen(
                apiService: _api,
                email: _emailCtrl.text.trim(),
                initialDevToken: result['dev_token']?.toString(),
                emailSent: result['email_sent'] == true,
              ),
            ),
          );
        }
        return;
      }

      await widget.onContinue(
        'email',
        email: _emailCtrl.text.trim(),
        password: _passCtrl.text,
        mode: 'login',
        displayName: _nameCtrl.text.trim(),
        username: _userCtrl.text.trim().replaceAll('@', ''),
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _google() async {
    setState(() => _busy = true);
    try {
      await widget.onContinue('google');
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _facebook() async {
    setState(() => _busy = true);
    try {
      await widget.onContinue('facebook');
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  InputDecoration _deco({
    required String label,
    required String hint,
    required IconData icon,
    Widget? suffix,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(icon, color: _purple, size: 22),
      suffixIcon: suffix,
      filled: true,
      fillColor: AppStyles.colors(context).field,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppStyles.colors(context).borderSoft),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: AppStyles.colors(context).brand,
          width: 1.5,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppStyles.colors(context).bg,
      body: SafeArea(
        child: Column(
          children: [
            // Top bar: back + avatar (mock layout)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 20, 0),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(
                      Icons.arrow_back_ios_new_rounded,
                      size: 20,
                    ),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: _busy ? null : _pickPhoto,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        CircleAvatar(
                          radius: 32,
                          backgroundColor: AppStyles.colors(context).brandSoft,
                          backgroundImage: _photo != null
                              ? FileImage(_photo!)
                              : null,
                          child: _photo == null
                              ? Icon(
                                  Icons.person_rounded,
                                  color: AppStyles.colors(context).brand,
                                  size: 36,
                                )
                              : null,
                        ),
                        Positioned(
                          right: -2,
                          bottom: -2,
                          child: Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: AppStyles.colors(context).brand,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.add,
                              size: 14,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(22, 12, 22, 28),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Create Account',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: AppStyles.colors(context).textPrimary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Sign up and start your journey with us',
                        style: TextStyle(
                          color: AppStyles.colors(context).textMuted,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 22),
                      TextFormField(
                        controller: _nameCtrl,
                        textInputAction: TextInputAction.next,
                        decoration: _deco(
                          label: 'Name',
                          hint: 'Enter your full name',
                          icon: Icons.person_outline_rounded,
                        ),
                        validator: (v) =>
                            (v ?? '').trim().isEmpty ? 'Enter your name' : null,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _userCtrl,
                        textInputAction: TextInputAction.next,
                        decoration: _deco(
                          label: 'User ID',
                          hint: 'Choose a user ID',
                          icon: Icons.alternate_email_rounded,
                        ),
                        validator: (v) {
                          final t = (v ?? '').trim().replaceAll('@', '');
                          if (t.length < 3) return 'At least 3 characters';
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _emailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        decoration: _deco(
                          label: 'Email',
                          hint: 'Enter your email',
                          icon: Icons.email_outlined,
                        ),
                        validator: (v) {
                          final t = (v ?? '').trim();
                          if (!t.contains('@')) return 'Enter a valid email';
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      InkWell(
                        onTap: _pickBirthday,
                        borderRadius: BorderRadius.circular(14),
                        child: InputDecorator(
                          decoration: _deco(
                            label: 'Birthday',
                            hint: 'Select your birthday',
                            icon: Icons.calendar_today_outlined,
                            suffix: const Icon(
                              Icons.event,
                              color: _purple,
                              size: 20,
                            ),
                          ),
                          child: Text(
                            _birthDate == null
                                ? 'Select your birthday'
                                : '${_birthDate!.year}-${_birthDate!.month.toString().padLeft(2, '0')}-${_birthDate!.day.toString().padLeft(2, '0')}',
                            style: TextStyle(
                              color: _birthDate == null
                                  ? AppStyles.colors(context).textMuted
                                  : AppStyles.colors(context).textPrimary,
                              fontSize: 15,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _gender,
                        isExpanded: true,
                        decoration: _deco(
                          label: 'Sex',
                          hint: 'Select your sex',
                          icon: Icons.wc_outlined,
                        ),
                        items: _genders
                            .map(
                              (g) => DropdownMenuItem(value: g, child: Text(g)),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => _gender = v),
                        validator: (v) =>
                            v == null || v.isEmpty ? 'Select sex' : null,
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _country,
                        isExpanded: true,
                        decoration: _deco(
                          label: 'Country',
                          hint: 'Select your country',
                          icon: Icons.public_outlined,
                        ),
                        items: _countries
                            .map(
                              (c) => DropdownMenuItem(value: c, child: Text(c)),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => _country = v),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _passCtrl,
                        obscureText: _obscure,
                        textInputAction: TextInputAction.next,
                        decoration: _deco(
                          label: 'New Password',
                          hint: 'Create a new password',
                          icon: Icons.lock_outline_rounded,
                          suffix: IconButton(
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                              color: AppStyles.colors(context).textMuted,
                            ),
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: _validatePassword,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _pass2Ctrl,
                        obscureText: _obscure2,
                        decoration: _deco(
                          label: 'Re-enter Password',
                          hint: 'Re-enter your password',
                          icon: Icons.lock_outline_rounded,
                          suffix: IconButton(
                            icon: Icon(
                              _obscure2
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                              color: AppStyles.colors(context).textMuted,
                            ),
                            onPressed: () =>
                                setState(() => _obscure2 = !_obscure2),
                          ),
                        ),
                        validator: (v) {
                          if (v != _passCtrl.text) {
                            return 'Passwords do not match';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 10),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          SizedBox(
                            width: 28,
                            height: 28,
                            child: Checkbox(
                              value: _agreed,
                              activeColor: _purple,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              onChanged: (v) =>
                                  setState(() => _agreed = v ?? false),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text.rich(
                              TextSpan(
                                style: TextStyle(
                                  fontSize: 13,
                                  color: AppStyles.colors(context).textMuted,
                                ),
                                children: const [
                                  TextSpan(text: 'I agree to the '),
                                  TextSpan(
                                    text: 'Privacy Policy',
                                    style: TextStyle(
                                      color: _purple,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  TextSpan(text: ' and '),
                                  TextSpan(
                                    text: 'Terms of Service',
                                    style: TextStyle(
                                      color: _purple,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      SizedBox(
                        height: 52,
                        child: FilledButton(
                          onPressed: _busy ? null : _submit,
                          style: FilledButton.styleFrom(
                            backgroundColor: _purple,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(28),
                            ),
                            elevation: 0,
                          ),
                          child: _busy
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text(
                                  'Sign Up',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Wrap(
                        alignment: WrapAlignment.center,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            'Already have an account? ',
                            style: TextStyle(
                              color: AppStyles.colors(context).textMuted,
                            ),
                          ),
                          GestureDetector(
                            onTap: () => Navigator.of(context).maybePop(),
                            child: const Text(
                              'Login',
                              style: TextStyle(
                                color: _purple,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Center(
                        child: TextButton.icon(
                          onPressed: _busy ? null : _google,
                          icon: const Icon(
                            Icons.g_mobiledata_rounded,
                            size: 28,
                          ),
                          label: const Text('Continue with Google'),
                          style: TextButton.styleFrom(foregroundColor: _purple),
                        ),
                      ),
                      Center(
                        child: TextButton.icon(
                          onPressed: _busy ? null : _facebook,
                          icon: const Icon(Icons.facebook_rounded, size: 22),
                          label: const Text('Continue with Facebook'),
                          style: TextButton.styleFrom(foregroundColor: const Color(0xFF1877F2)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
