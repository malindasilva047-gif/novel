import 'package:flutter/material.dart';

/// Compact Wingsaga mark used beside the app wordmark.
class WingsagaLogo extends StatelessWidget {
  const WingsagaLogo({super.key, this.size = 28});

  final double size;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: CustomPaint(painter: _WingsagaLogoPainter()),
  );
}

class _WingsagaLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 36;
    canvas.save();
    canvas.scale(scale);
    canvas.drawCircle(
      const Offset(18, 18),
      18,
      Paint()..color = const Color(0xFF17211D),
    );
    final mark = Paint()
      ..color = const Color(0xFF35A486)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path()
      ..moveTo(7.5, 11)
      ..lineTo(12.5, 25)
      ..lineTo(18, 15)
      ..lineTo(23.5, 25)
      ..lineTo(28.5, 11);
    canvas.drawPath(path, mark);
    canvas.drawCircle(
      const Offset(18, 8),
      1.5,
      Paint()..color = const Color(0xFF35A486),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
