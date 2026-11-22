import 'package:flutter/material.dart';

/// Full-screen Wingsaga artwork shown while the app or home screen loads.
class WingsagaLoadingScreen extends StatelessWidget {
  const WingsagaLoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            isDark
                ? 'assets/images/wingsaga_welcome_dark.jpeg'
                : 'assets/images/wingsaga_welcome_light.jpeg',
            fit: BoxFit.cover,
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 48),
                child: SizedBox(
                  width: 28,
                  height: 28,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: isDark
                        ? const Color(0xFF15966F)
                        : const Color(0xFF147B60),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
