import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

enum AppNoticeType { success, warning, error }

void showAppNotice(
  BuildContext context,
  String message, {
  AppNoticeType type = AppNoticeType.success,
}) {
  if (message.trim().isEmpty) return;
  final overlay = Overlay.of(context, rootOverlay: true);
  late final OverlayEntry entry;
  late final Timer timer;

  void dismiss() {
    timer.cancel();
    if (entry.mounted) entry.remove();
  }

  entry = OverlayEntry(
    builder: (_) => _AppNoticeEntry(
      message: message,
      type: type,
      onDismiss: dismiss,
    ),
  );
  timer = Timer(const Duration(seconds: 5), dismiss);
  overlay.insert(entry);
}

class _AppNoticeEntry extends StatelessWidget {
  const _AppNoticeEntry({
    required this.message,
    required this.type,
    required this.onDismiss,
  });

  final String message;
  final AppNoticeType type;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final color = switch (type) {
      AppNoticeType.success => AppTheme.brandDeep,
      AppNoticeType.warning => Colors.orange.shade800,
      AppNoticeType.error => Colors.red.shade700,
    };
    final icon = switch (type) {
      AppNoticeType.success => Icons.check_circle_outline,
      AppNoticeType.warning => Icons.warning_amber_rounded,
      AppNoticeType.error => Icons.error_outline,
    };
    return Positioned(
      top: MediaQuery.viewPaddingOf(context).top + 12,
      left: 12,
      right: 12,
      child: Align(
        alignment: Alignment.topRight,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: TweenAnimationBuilder<Offset>(
            tween: Tween(begin: const Offset(1.1, 0), end: Offset.zero),
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOutCubic,
            builder: (context, offset, child) => Transform.translate(
              offset: Offset(offset.dx * MediaQuery.sizeOf(context).width, 0),
              child: child,
            ),
            child: Material(
              color: color,
              elevation: 12,
              borderRadius: BorderRadius.circular(16),
              child: Semantics(
                liveRegion: true,
                label: message,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                  child: Row(
                    children: [
                      Icon(icon, color: Colors.white, size: 22),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          message,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Dismiss notification',
                        onPressed: onDismiss,
                        icon: const Icon(Icons.close, color: Colors.white),
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
