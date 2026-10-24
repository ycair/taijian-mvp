import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/species.dart';

class AnimalRepository {
  AnimalRepository({required this.commands, required this.householdId});

  final CommandService commands;
  final String? householdId;

  Future<void> create({
    required String name,
    required String speciesId,
    required String avatarColor,
    String? morph,
    String sex = 'unknown',
    String? notes,
    String? birthDate,
  }) async {
    if (householdId == null) throw StateError('No household');
    final species = speciesById(speciesId);
    await commands.submit(
      'animal.create',
      {
        'name': name.trim(),
        'species': speciesId,
        if (species != null) 'speciesLabel': species.name,
        'sex': sex,
        'avatarColor': avatarColor,
        if (morph != null && morph.trim().isNotEmpty) 'morph': morph.trim(),
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        'birthDate': ?birthDate,
      },
      householdId: householdId,
    );
  }

  Future<void> update({
    required Animal animal,
    String? name,
    String? morph,
    String? notes,
  }) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'animal.update',
      {
        'animalId': animal.id,
        if (name != null) 'name': name.trim(),
        if (morph != null) 'morph': morph.trim(),
        if (notes != null) 'notes': notes.trim(),
      },
      householdId: householdId,
      baseRevision: animal.revision,
      targetId: 'animal:${animal.id}',
    );
  }

  Future<void> archive(Animal animal) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'animal.archive',
      {'animalId': animal.id},
      householdId: householdId,
      baseRevision: animal.revision,
      targetId: 'animal:${animal.id}',
    );
  }
}

final animalRepositoryProvider = Provider<AnimalRepository>((ref) {
  return AnimalRepository(
    commands: ref.watch(commandServiceProvider),
    householdId: ref.watch(householdIdProvider),
  );
});
