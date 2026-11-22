import 'dart:async';

import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'core/constants/responsive.dart';
import 'data/services/firebase_push_service.dart';
import 'ui/screens/root_shell.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await FirebasePushService.initializeFirebase();
  unawaited(ThemeController.instance.load());
  runApp(const WingsagaApp());
}

class WingsagaApp extends StatelessWidget {
  const WingsagaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ThemeController.instance,
      builder: (context, _) {
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'Wingsaga',
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: ThemeController.instance.mode,
          builder: (context, child) {
            final app = child ?? const SizedBox.shrink();
            return LayoutBuilder(
              builder: (context, constraints) {
                if (constraints.maxWidth <= AppBreakpoints.maxAppContentWidth) {
                  return app;
                }
                return ColoredBox(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                        maxWidth: AppBreakpoints.maxAppContentWidth,
                      ),
                      child: SizedBox.expand(child: app),
                    ),
                  ),
                );
              },
            );
          },
          home: const RootShell(),
        );
      },
    );
  }
}
