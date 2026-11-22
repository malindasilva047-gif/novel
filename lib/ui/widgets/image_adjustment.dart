import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:image_picker/image_picker.dart';

import 'app_notice.dart';

Future<Uint8List?> showImageAdjustmentDialog(
  BuildContext context,
  XFile image, {
  required double aspectRatio,
  bool circular = false,
}) async {
  final bytes = await image.readAsBytes();
  if (!context.mounted) return null;
  return showDialog<Uint8List>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _ImageAdjustmentDialog(
      bytes: bytes,
      aspectRatio: aspectRatio,
      circular: circular,
    ),
  );
}

class _ImageAdjustmentDialog extends StatefulWidget {
  const _ImageAdjustmentDialog({
    required this.bytes,
    required this.aspectRatio,
    required this.circular,
  });

  final Uint8List bytes;
  final double aspectRatio;
  final bool circular;

  @override
  State<_ImageAdjustmentDialog> createState() => _ImageAdjustmentDialogState();
}

class _ImageAdjustmentDialogState extends State<_ImageAdjustmentDialog> {
  final GlobalKey _cropBoundsKey = GlobalKey();
  final TransformationController _transformController =
      TransformationController();
  double _zoom = 1;
  bool _saving = false;
  Size? _sourceSize;

  @override
  void initState() {
    super.initState();
    _readImageSize();
  }

  Future<void> _readImageSize() async {
    ui.Codec? codec;
    try {
      codec = await ui.instantiateImageCodec(widget.bytes);
      final frame = await codec.getNextFrame();
      final image = frame.image;
      final size = Size(image.width.toDouble(), image.height.toDouble());
      image.dispose();
      if (!mounted) return;
      setState(() => _sourceSize = size);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final viewport = MediaQuery.sizeOf(context);
        final stageWidth = [
          340.0,
          viewport.width - 72,
          viewport.height * .48 * widget.aspectRatio,
        ].reduce((a, b) => a < b ? a : b);
        final stageHeight = stageWidth / widget.aspectRatio;
        final imageSize = _renderedImageSize(stageWidth, stageHeight);
        _transformController.value = Matrix4.identity()
          ..translateByDouble(
            (stageWidth - imageSize.width) / 2,
            (stageHeight - imageSize.height) / 2,
            0,
            1,
        );
      });
    } catch (error) {
      if (!mounted) return;
      showAppNotice(
        context,
        'Could not read this image: $error',
        type: AppNoticeType.error,
      );
      Navigator.of(context).pop();
    } finally {
      codec?.dispose();
    }
  }

  Size _renderedImageSize(double viewportWidth, double viewportHeight) {
    final source = _sourceSize;
    if (source == null || source.width <= 0 || source.height <= 0) {
      return Size(viewportWidth, viewportHeight);
    }
    final sourceAspect = source.width / source.height;
    final viewportAspect = viewportWidth / viewportHeight;
    if (sourceAspect > viewportAspect) {
      return Size(viewportHeight * sourceAspect, viewportHeight);
    }
    return Size(viewportWidth, viewportWidth / sourceAspect);
  }

  @override
  void dispose() {
    _transformController.dispose();
    super.dispose();
  }

  void _setZoom(double value, double width, double height, Size imageSize) {
    _transformController.value = Matrix4.identity()
      ..translateByDouble(
        (width - imageSize.width * value) / 2,
        (height - imageSize.height * value) / 2,
        0,
        1,
      )
      ..scaleByDouble(value, value, value, 1);
    setState(() => _zoom = value);
  }

  Future<void> _saveCrop() async {
    final renderObject = _cropBoundsKey.currentContext?.findRenderObject();
    if (renderObject is! RenderRepaintBoundary) return;
    setState(() => _saving = true);
    try {
      final image = await renderObject.toImage(pixelRatio: 3);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (!mounted) return;
      if (data == null) {
        throw StateError('The adjusted image could not be encoded.');
      }
      Navigator.of(context).pop(data.buffer.asUint8List());
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppNotice(
        context,
        'Could not adjust this image: $error',
        type: AppNoticeType.error,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.sizeOf(context);
    final maxStageWidth = media.width - 72;
    final stageHeightLimit = media.height * .48;
    final stageWidth = [
      340.0,
      maxStageWidth,
      stageHeightLimit * widget.aspectRatio,
    ].reduce((a, b) => a < b ? a : b);
    final stageHeight = stageWidth / widget.aspectRatio;
    final imageSize = _renderedImageSize(stageWidth, stageHeight);

    return Dialog(
      insetPadding: const EdgeInsets.all(20),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Adjust image',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              'Drag to reposition or pinch to zoom.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 18),
            Center(
              child: SizedBox(
                width: stageWidth,
                height: stageHeight,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    RepaintBoundary(
                      key: _cropBoundsKey,
                      child: ClipRect(
                        child: InteractiveViewer(
                          transformationController: _transformController,
                          minScale: 1,
                          maxScale: 3,
                          constrained: false,
                          boundaryMargin: EdgeInsets.zero,
                          clipBehavior: Clip.hardEdge,
                          child: SizedBox(
                            width: imageSize.width,
                            height: imageSize.height,
                            child: Image.memory(
                              widget.bytes,
                              fit: BoxFit.fill,
                              gaplessPlayback: true,
                            ),
                          ),
                        ),
                      ),
                    ),
                    IgnorePointer(
                      child: CustomPaint(
                        painter: _CropGuidePainter(circular: widget.circular),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                const Text('Zoom'),
                Expanded(
                  child: Slider(
                    value: _zoom,
                    min: 1,
                    max: 3,
                    onChanged: _saving
                        ? null
                        : (value) => _setZoom(
                            value,
                            stageWidth,
                            stageHeight,
                            imageSize,
                          ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: _saving ? null : () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _saving ? null : _saveCrop,
                  child: Text(_saving ? 'Saving…' : 'Use this image'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CropGuidePainter extends CustomPainter {
  const _CropGuidePainter({required this.circular});

  final bool circular;

  @override
  void paint(Canvas canvas, Size size) {
    final border = Paint()
      ..color = Colors.white.withValues(alpha: .9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    if (circular) {
      final guide = Path()
        ..fillType = PathFillType.evenOdd
        ..addRect(Offset.zero & size)
        ..addOval(Offset.zero & size);
      canvas.drawPath(
        guide,
        Paint()..color = Colors.black.withValues(alpha: .4),
      );
      canvas.drawOval(Offset.zero & size, border);
    } else {
      canvas.drawRect(Offset.zero & size, border);
    }
  }

  @override
  bool shouldRepaint(covariant _CropGuidePainter oldDelegate) =>
      oldDelegate.circular != circular;
}
