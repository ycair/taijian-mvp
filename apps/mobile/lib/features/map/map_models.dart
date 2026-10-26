import '../../core/models/models.dart';

class MapZone {
  const MapZone({
    required this.id,
    required this.name,
    required this.x,
    required this.y,
    required this.w,
    required this.h,
    required this.color,
    required this.revision,
  });

  factory MapZone.fromMap(Map<String, dynamic> map) {
    return MapZone(
      id: readString(map, 'id'),
      name: readString(map, 'name'),
      x: readDouble(map, 'x') ?? 0.5,
      y: readDouble(map, 'y') ?? 0.5,
      w: readDouble(map, 'w') ?? 0.25,
      h: readDouble(map, 'h') ?? 0.25,
      color: readString(map, 'color', '#EEF4E8'),
      revision: readInt(map, 'revision'),
    );
  }

  final String id;
  final String name;
  final double x;
  final double y;
  final double w;
  final double h;
  final String color;
  final int revision;
}

class AnimalPosition {
  const AnimalPosition({required this.animalId, required this.x, required this.y});

  factory AnimalPosition.fromMap(Map<String, dynamic> map) {
    return AnimalPosition(
      animalId: readString(map, 'animalId'),
      x: readDouble(map, 'x') ?? 0.5,
      y: readDouble(map, 'y') ?? 0.5,
    );
  }

  final String animalId;
  final double x;
  final double y;

  AnimalPosition copyWith({double? x, double? y}) =>
      AnimalPosition(animalId: animalId, x: x ?? this.x, y: y ?? this.y);
}
