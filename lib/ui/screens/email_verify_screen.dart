import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../data/services/api_service.dart';

/// After signup: enter verification code from email, then return to login.
class EmailVerifyScreen extends StatefulWidget {
  const EmailVerifyScreen({
    super.key,
    required this.email,
    required this.apiService,
    this.initialDevToken,
    this.emailSent = true,
  });

  final String email;
  final ApiService apiService;
  final String? initialDevToken;
  final bool emailSent;

  @override
  State<EmailVerifyScreen> createState() => _EmailVerifyScreenState();
}

class _EmailVerifyScreenState extends State<EmailVerifyScreen> {
  final _codeCtrl = TextEditingController();
  bool _busy = false;
  bool _resent = false;
  late bool _emailSent;

  @override
  void initState() {
    super.initState();
    _emailSent = widget.emailSent;
    if ((widget.initialDevToken ?? '').isNotEmpty) {
      _codeCtrl.text = widget.initialDevToken!;
    }
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final token = _codeCtrl.text.trim();
    if (token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter the verification code')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.apiService.verifyEmail(
        token: token,
        email: widget.email,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Email verified — please log in')),
      );
      // Pop back to login (clear signup + verify stack)
      Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.toString().replaceFirst(RegExp(r'^Exception:\s*'), ''),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _busy = true);
    try {
      final res = await widget.apiService.resendVerification(widget.email);
      final dev = (res['dev_token'] ?? '').toString();
      if (dev.isNotEmpty) _codeCtrl.text = dev;
      if (!mounted) return;
      setState(() {
        _resent = true;
        _emailSent = res['email_sent'] == true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            (res['message'] ?? 'Verification code sent').toString(),
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgOf(context),
      appBar: AppBar(
        title: const Text('Verify email'),
        backgroundColor: AppTheme.bgOf(context),
        foregroundColor: AppTheme.inkOf(context),
        elevation: 0,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.mark_email_read_outlined,
                  size: 56, color: AppTheme.brand),
              const SizedBox(height: 16),
              Text(
                'Check your inbox',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                _emailSent
                    ? 'We sent a verification code to\n${widget.email}'
                    : 'We could not send a code to\n${widget.email}. Try resending after email delivery is configured.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black54, height: 1.4),
              ),
              const SizedBox(height: 28),
              TextField(
                controller: _codeCtrl,
                decoration: const InputDecoration(
                  labelText: 'Verification code',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: _busy ? null : _verify,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.brand,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(28),
                    ),
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
                          'Verify & continue to login',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: _busy ? null : _resend,
                child: Text(_resent ? 'Code resent' : 'Resend code'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
