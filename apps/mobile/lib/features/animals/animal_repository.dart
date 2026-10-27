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
    String? adoptionDate,
    String avatarPattern = 'solid',
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
        'avatarPattern': avatarPattern,
        'adoptionDate': ?adoptionDate,
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
    String? speciesId,
    String? speciesLabel,
    String? morph,
    String? sex,
    String? notes,
    String? birthDate,
    String? adoptionDate,
    String? avatarColor,
    String? avatarPattern,
  }) async {
    if (householdId == null) throw StateError('No household');
    final species = speciesId == null ? null : speciesById(speciesId);
    await commands.submit(
      'animal.update',
      {
        'animalId': animal.id,
        if (name != null) 'name': name.trim(),
        'species': ?speciesId,
        if (speciesLabel != null)
          'speciesLabel': speciesLabel.trim()
        else if (species != null)
          'speciesLabel': species.name,
        if (morph != null) 'morph': morph.trim(),
        'sex': ?sex,
        if (notes != null) 'notes': notes.trim(),
        'birthDate': ?birthDate,
        'adoptionDate': ?adoptionDate,
        'avatarColor': ?avatarColor,
        'avatarPattern': ?avatarPattern,
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

  Future<void> delete(Animal animal) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'animal.delete',
      {'animalId': animal.id},
      householdId: householdId,
      baseRevision: animal.revision,
      targetId: 'animal:${animal.id}',
    );
  }

  Future<void> setRecordVisibility(Animal animal, {required bool isPublic}) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'animal.setRecordVisibility',
      {'animalId': animal.id, 'isPublic': isPublic},
      householdId: householdId,
      baseRevision: animal.revision,
      targetId: 'animal:${animal.id}',
    );
  }

  Future<void> memorialize(Animal animal, {String? note}) async {
    if (householdId == null) throw StateError('No household');
    await commands.submit(
      'animal.memorialize',
      {
        'animalId': animal.id,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
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
