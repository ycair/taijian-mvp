class Species {
  const Species({
    required this.id,
    required this.name,
    this.scientificName = '',
  });

  final String id;
  final String name;
  final String scientificName;
}

/// Mirrors `packages/domain/src/species.ts` so animal.create stores the same ids.
const speciesList = <Species>[
  Species(id: 'leopard-gecko', name: '豹紋守宮', scientificName: 'Eublepharis macularius'),
  Species(id: 'african-fat-tail-gecko', name: '肥尾守宮', scientificName: 'Hemitheconyx caudicinctus'),
  Species(id: 'corn-snake', name: '玉米蛇', scientificName: 'Pantherophis guttatus'),
  Species(id: 'ball-python', name: '球蟒', scientificName: 'Python regius'),
  Species(id: 'green-horned-frog', name: '綠角蛙', scientificName: 'Ceratophrys cranwelli'),
  Species(id: 'bearded-dragon', name: '鬃獅蜥', scientificName: 'Pogona vitticeps'),
  Species(id: 'veiled-chameleon', name: '變色龍', scientificName: 'Chamaeleo calyptratus'),
  Species(id: 'blue-tongue-skink', name: '藍舌蜥', scientificName: 'Tiliqua scincoides'),
  Species(id: 'red-eared-slider', name: '巴西龜', scientificName: 'Trachemys scripta elegans'),
  Species(id: 'sulcata-tortoise', name: '蘇卡達陸龜', scientificName: 'Centrochelys sulcata'),
  Species(id: 'sugar-glider', name: '蜜袋鼯', scientificName: 'Petaurus breviceps'),
  Species(id: 'hedgehog', name: '刺蝟', scientificName: 'Atelerix albiventris'),
  Species(id: 'other', name: '其他'),
];

Species? speciesById(String id) {
  for (final species in speciesList) {
    if (species.id == id) return species;
  }
  return null;
}
