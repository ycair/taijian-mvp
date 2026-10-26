class Species {
  const Species({
    required this.id,
    required this.name,
    this.scientificName = '',
    this.kingdom = 'animalia',
    this.category = 'other',
    this.defaultColor = '#7C9A76',
    this.defaultPattern = 'solid',
  });

  final String id;
  final String name;
  final String scientificName;
  final String kingdom;
  final String category;
  final String defaultColor;
  final String defaultPattern;
}

/// Mirrors `packages/domain/src/species.ts` so animal.create stores the same ids.
const speciesList = <Species>[
  Species(
    id: 'leopard-gecko',
    name: '豹紋守宮',
    scientificName: 'Eublepharis macularius',
    category: 'reptile',
    defaultColor: '#C9A66B',
    defaultPattern: 'spots',
  ),
  Species(
    id: 'african-fat-tail-gecko',
    name: '肥尾守宮',
    scientificName: 'Hemitheconyx caudicinctus',
    category: 'reptile',
    defaultColor: '#B89C7A',
  ),
  Species(
    id: 'corn-snake',
    name: '玉米蛇',
    scientificName: 'Pantherophis guttatus',
    category: 'reptile',
    defaultColor: '#D98B5F',
    defaultPattern: 'stripes',
  ),
  Species(
    id: 'ball-python',
    name: '球蟒',
    scientificName: 'Python regius',
    category: 'reptile',
    defaultColor: '#8B6B4A',
    defaultPattern: 'spots',
  ),
  Species(
    id: 'green-horned-frog',
    name: '綠角蛙',
    scientificName: 'Ceratophrys cranwelli',
    category: 'amphibian',
    defaultColor: '#7C9A76',
    defaultPattern: 'spots',
  ),
  Species(
    id: 'bearded-dragon',
    name: '鬃獅蜥',
    scientificName: 'Pogona vitticeps',
    category: 'reptile',
    defaultColor: '#D8A05A',
    defaultPattern: 'gradient',
  ),
  Species(
    id: 'veiled-chameleon',
    name: '變色龍',
    scientificName: 'Chamaeleo calyptratus',
    category: 'reptile',
    defaultColor: '#6F9B6B',
    defaultPattern: 'gradient',
  ),
  Species(
    id: 'blue-tongue-skink',
    name: '藍舌蜥',
    scientificName: 'Tiliqua scincoides',
    category: 'reptile',
    defaultColor: '#8C7B6B',
    defaultPattern: 'stripes',
  ),
  Species(
    id: 'red-eared-slider',
    name: '巴西龜',
    scientificName: 'Trachemys scripta elegans',
    category: 'reptile',
    defaultColor: '#6E8F72',
  ),
  Species(
    id: 'sulcata-tortoise',
    name: '蘇卡達陸龜',
    scientificName: 'Centrochelys sulcata',
    category: 'reptile',
    defaultColor: '#B59A6A',
  ),
  Species(
    id: 'sugar-glider',
    name: '蜜袋鼯',
    scientificName: 'Petaurus breviceps',
    category: 'mammal',
    defaultColor: '#A7A29A',
  ),
  Species(
    id: 'hedgehog',
    name: '刺蝟',
    scientificName: 'Atelerix albiventris',
    category: 'mammal',
    defaultColor: '#8B7A6A',
    defaultPattern: 'spots',
  ),
  Species(
    id: 'other',
    name: '其他',
    category: 'other',
    defaultColor: '#7C9A76',
  ),
];

Species? speciesById(String id) {
  for (final species in speciesList) {
    if (species.id == id) return species;
  }
  return null;
}
