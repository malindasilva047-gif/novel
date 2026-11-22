import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:novel_mobile_app/core/theme/theme_controller.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('defaults new installs to the light theme', () async {
    await ThemeController.instance.load();

    expect(ThemeController.instance.mode, ThemeMode.light);
  });

  test('migrates an existing dark default to light once', () async {
    SharedPreferences.setMockInitialValues({'app_theme_mode': 'dark'});

    await ThemeController.instance.load();

    expect(ThemeController.instance.mode, ThemeMode.light);

    await ThemeController.instance.setMode(ThemeMode.dark);
    await ThemeController.instance.load();

    expect(ThemeController.instance.mode, ThemeMode.dark);
  });
}
