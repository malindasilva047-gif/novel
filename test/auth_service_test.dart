import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:novel_mobile_app/data/services/api_service.dart';
import 'package:novel_mobile_app/data/services/auth_service.dart';

class _FailingGoogleSignIn implements GoogleSignIn {
  @override
  Future<GoogleSignInAccount?> signIn() async {
    throw PlatformException(
      code: 'sign_in_failed',
      message: '10: DEVELOPER_ERROR',
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test(
    'Google release configuration errors show the required OAuth client',
    () {
      final service = AuthService(
        apiService: ApiService(),
        googleSignIn: _FailingGoogleSignIn(),
      );

      expect(
        service.signInWithGoogle(),
        throwsA(
          isA<Exception>().having(
            (error) => error.toString(),
            'message',
            allOf(
              contains('Google Cloud Console'),
              contains('com.example.novel_mobile_app'),
              contains(
                '98:3A:B9:03:17:FF:49:2A:BB:BC:E0:F2:B3:B1:F0:7F:67:74:DB:12',
              ),
            ),
          ),
        ),
      );
    },
  );
}
