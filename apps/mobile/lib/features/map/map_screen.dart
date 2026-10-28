import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'map_models.dart';
import 'map_repository.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  final _overrides = <String, AnimalPosition>{};
  bool _seedRequested = false;

  @override
  Widget build(BuildContext context) {
    final zones = ref.watch(mapZonesProvider);
    final positions = ref.watch(mapPositionsProvider);
    final animals = ref.watch(activeAnimalsProvider);

    if (zones.value?.isEmpty == true && !_seedRequested) {
      _seedRequested = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        await ref.read(mapRepositoryProvider).ensureDefaults();
        ref.invalidate(mapZonesProvider);
      });
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('苔間地圖'),
        actions: [
          IconButton(
            tooltip: '新增區域',
            onPressed: () => _addZone(context),
            icon: const Icon(Icons.add_location_alt_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
        children: [
          Text(
            '把居民放到牠們喜歡的角落；家人看到的會是同一個地圖。',
            style: TextStyle(color: AppTokens.muted, height: 1.5),
          ),
          const SizedBox(height: 14),
          if (zones.hasError || positions.hasError)
            ErrorView(
              message: '讀取地圖失敗，請稍後再試。',
              onRetry: () {
                ref.invalidate(mapZonesProvider);
                ref.invalidate(mapPositionsProvider);
              },
            )
          else if (zones.isLoading || positions.isLoading)
            const LoadingView()
          else
            _MapCanvas(
              zones: zones.value ?? const [],
              animals: animals,
              positions: {
                ...?positions.value,
                ..._overrides,
              },
              onMoved: (animalId, x, y) => _move(animalId, x, y),
              onDeleteZone: _deleteZone,
            ),
          const SizedBox(height: 14),
          Text(
            '長按區域可刪除；新增區域目前使用預設位置。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  Future<void> _move(String animalId, double x, double y) async {
    setState(() => _overrides[animalId] = AnimalPosition(animalId: animalId, x: x, y: y));
    try {
      await ref.read(mapRepositoryProvider).move(animalId, x, y);
      ref.invalidate(mapPositionsProvider);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('儲存位置失敗：$error')));
      }
    }
  }

  Future<void> _addZone(BuildContext context) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新增小窩區域'),
        content: TextField(
          controller: controller,
          maxLength: 40,
          decoration: const InputDecoration(hintText: '例如：苔石角落'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('新增'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty) return;
    try {
      await ref.read(mapRepositoryProvider).addZone(name);
      ref.invalidate(mapZonesProvider);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('新增區域失敗：$error')));
      }
    }
  }

  Future<void> _deleteZone(MapZone zone) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('刪除「${zone.name}」？'),
        content: const Text('居民不會被刪除，只會從這個區域移回地圖上。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('保留')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppTokens.overdue),
            child: const Text('刪除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(mapRepositoryProvider).deleteZone(zone);
      ref.invalidate(mapZonesProvider);
      ref.invalidate(mapPositionsProvider);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('刪除區域失敗：$error')));
      }
    }
  }
}

class _MapCanvas extends StatelessWidget {
  const _MapCanvas({
    required this.zones,
    required this.animals,
    required this.positions,
    required this.onMoved,
    required this.onDeleteZone,
  });

  final List<MapZone> zones;
  final List<Animal> animals;
  final Map<String, AnimalPosition> positions;
  final void Function(String animalId, double x, double y) onMoved;
  final ValueChanged<MapZone> onDeleteZone;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1.1,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final height = constraints.maxHeight;
          return ClipRRect(
            borderRadius: BorderRadius.circular(AppTokens.radiusLg),
            child: Container(
              color: const Color(0xFFF4EDDF),
              child: Stack(
                children: [
                  const Positioned.fill(child: CustomPaint(painter: _MapBackdropPainter())),
                  for (final zone in zones)
                    Positioned(
                      left: zone.x * width,
                      top: zone.y * height,
                      width: zone.w * width,
                      height: zone.h * height,
                      child: GestureDetector(
                        onLongPress: () => onDeleteZone(zone),
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppTokens.colorFromHex(zone.color).withValues(alpha: .88),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white.withValues(alpha: .8), width: 1.5),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: .05),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Align(
                            alignment: Alignment.topLeft,
                            child: Text(
                              zone.name,
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppTokens.primaryStrong),
                            ),
                          ),
                        ),
                      ),
                    ),
                  for (var index = 0; index < animals.length; index++)
                    _DraggableResident(
                      animal: animals[index],
                      position: positions[animals[index].id] ??
                          AnimalPosition(
                            animalId: animals[index].id,
                            x: .18 + (index % 3) * .28,
                            y: .18 + (index ~/ 3) * .28,
                          ),
                      width: width,
                      height: height,
                      onMoved: onMoved,
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _DraggableResident extends StatefulWidget {
  const _DraggableResident({
    required this.animal,
    required this.position,
    required this.width,
    required this.height,
    required this.onMoved,
  });

  final Animal animal;
  final AnimalPosition position;
  final double width;
  final double height;
  final void Function(String animalId, double x, double y) onMoved;

  @override
  State<_DraggableResident> createState() => _DraggableResidentState();
}

class _DraggableResidentState extends State<_DraggableResident> {
  late double _x = widget.position.x;
  late double _y = widget.position.y;

  @override
  void didUpdateWidget(covariant _DraggableResident oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.position.x != widget.position.x || oldWidget.position.y != widget.position.y) {
      _x = widget.position.x;
      _y = widget.position.y;
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = math.max(46.0, widget.width * .12);
    return Positioned(
      left: (_x * widget.width - size / 2).clamp(0, widget.width - size),
      top: (_y * widget.height - size / 2).clamp(0, widget.height - size),
      child: GestureDetector(
        onPanUpdate: (details) {
          setState(() {
            _x = (_x + details.delta.dx / widget.width).clamp(0.03, 0.97);
            _y = (_y + details.delta.dy / widget.height).clamp(0.03, 0.97);
          });
        },
        onPanEnd: (_) => widget.onMoved(widget.animal.id, _x, _y),
        child: Semantics(
          label: '移動 ${widget.animal.name}',
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimalAvatar(
                label: widget.animal.initial,
                colorHex: widget.animal.avatarColor,
                pattern: widget.animal.avatarPattern,
                size: size,
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .88),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  widget.animal.name,
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppTokens.ink),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MapBackdropPainter extends CustomPainter {
  const _MapBackdropPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFFA8BFA3).withValues(alpha: .16);
    canvas.drawCircle(Offset(size.width * .12, size.height * .78), size.width * .2, paint);
    canvas.drawCircle(Offset(size.width * .88, size.height * .2), size.width * .16, paint..color = const Color(0xFFE8A87C).withValues(alpha: .13));
    final path = Path()
      ..moveTo(0, size.height * .48)
      ..quadraticBezierTo(size.width * .3, size.height * .36, size.width * .52, size.height * .5)
      ..quadraticBezierTo(size.width * .74, size.height * .62, size.width, size.height * .46)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = const Color(0xFFD9A5A0).withValues(alpha: .1));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
