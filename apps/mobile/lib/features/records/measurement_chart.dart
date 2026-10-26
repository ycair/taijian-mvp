import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';

class MeasurementChart extends StatelessWidget {
  const MeasurementChart({
    super.key,
    required this.points,
    required this.unit,
  });

  final List<RecordMeasurementPoint> points;
  final String unit;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) {
      return SizedBox(
        height: 150,
        child: Center(
          child: Text(
            '這段期間還沒有量測資料。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }
    final values = points.map((point) => point.value).toList();
    final minValue = values.reduce(math.min);
    final maxValue = values.reduce(math.max);
    return Semantics(
      label: '量測趨勢，共 ${points.length} 筆，介於 ${minValue.toStringAsFixed(1)} 到 ${maxValue.toStringAsFixed(1)} $unit',
      child: SizedBox(
        height: 190,
        width: double.infinity,
        child: CustomPaint(
          painter: _MeasurementChartPainter(
            points: points,
            minValue: minValue,
            maxValue: maxValue,
            unit: unit,
          ),
        ),
      ),
    );
  }
}

class _MeasurementChartPainter extends CustomPainter {
  const _MeasurementChartPainter({
    required this.points,
    required this.minValue,
    required this.maxValue,
    required this.unit,
  });

  final List<RecordMeasurementPoint> points;
  final double minValue;
  final double maxValue;
  final String unit;

  @override
  void paint(Canvas canvas, Size size) {
    const padding = EdgeInsets.fromLTRB(8, 22, 8, 26);
    final chart = Rect.fromLTWH(
      padding.left,
      padding.top,
      size.width - padding.left - padding.right,
      size.height - padding.top - padding.bottom,
    );
    final gridPaint = Paint()
      ..color = AppTokens.line.withValues(alpha: 0.7)
      ..strokeWidth = 1;
    for (var index = 0; index <= 3; index++) {
      final y = chart.top + chart.height * index / 3;
      canvas.drawLine(Offset(chart.left, y), Offset(chart.right, y), gridPaint);
    }

    final range = math.max(maxValue - minValue, 0.1);
    final coords = <Offset>[];
    for (var index = 0; index < points.length; index++) {
      final x = points.length == 1
          ? chart.center.dx
          : chart.left + chart.width * index / (points.length - 1);
      final y = chart.bottom - ((points[index].value - minValue) / range) * chart.height;
      coords.add(Offset(x, y));
    }

    final fill = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          AppTokens.primary.withValues(alpha: 0.23),
          AppTokens.primary.withValues(alpha: 0.02),
        ],
      ).createShader(chart);
    final area = Path()..moveTo(coords.first.dx, chart.bottom);
    for (final point in coords) {
      area.lineTo(point.dx, point.dy);
    }
    area.lineTo(coords.last.dx, chart.bottom);
    area.close();
    canvas.drawPath(area, fill);

    final line = Paint()
      ..color = AppTokens.primaryStrong
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path()..moveTo(coords.first.dx, coords.first.dy);
    for (final point in coords.skip(1)) {
      path.lineTo(point.dx, point.dy);
    }
    canvas.drawPath(path, line);

    final dot = Paint()..color = AppTokens.primaryStrong;
    for (final point in coords) {
      canvas.drawCircle(point, 3.4, dot);
      canvas.drawCircle(
        point,
        1.5,
        Paint()..color = AppTokens.card,
      );
    }

    final labelStyle = const TextStyle(fontSize: 10, color: AppTokens.muted);
    _drawText(canvas, '${maxValue.toStringAsFixed(1)} $unit', Offset(chart.left, 2), labelStyle);
    _drawText(
      canvas,
      '${minValue.toStringAsFixed(1)} $unit',
      Offset(chart.left, chart.bottom + 18),
      labelStyle,
    );
    _drawText(
      canvas,
      points.length > 1 ? '${points.first.date} → ${points.last.date}' : points.first.date,
      Offset(chart.right, chart.bottom + 18),
      labelStyle,
      alignRight: true,
    );
  }

  void _drawText(
    Canvas canvas,
    String text,
    Offset offset,
    TextStyle style, {
    bool alignRight = false,
  }) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    final x = alignRight ? offset.dx - painter.width : offset.dx;
    painter.paint(canvas, Offset(x, offset.dy));
  }

  @override
  bool shouldRepaint(covariant _MeasurementChartPainter oldDelegate) {
    return oldDelegate.points != points ||
        oldDelegate.minValue != minValue ||
        oldDelegate.maxValue != maxValue ||
        oldDelegate.unit != unit;
  }
}
