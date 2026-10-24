export type Species = {
  id: string;
  name: string;
  scientificName: string;
  category: 'gecko' | 'snake' | 'frog' | 'lizard' | 'turtle' | 'mammal' | 'other';
  defaultUnit: 'g' | 'cm';
};

export const SPECIES: readonly Species[] = [
  { id: 'leopard-gecko', name: '豹紋守宮', scientificName: 'Eublepharis macularius', category: 'gecko', defaultUnit: 'g' },
  { id: 'african-fat-tail-gecko', name: '肥尾守宮', scientificName: 'Hemitheconyx caudicinctus', category: 'gecko', defaultUnit: 'g' },
  { id: 'corn-snake', name: '玉米蛇', scientificName: 'Pantherophis guttatus', category: 'snake', defaultUnit: 'g' },
  { id: 'ball-python', name: '球蟒', scientificName: 'Python regius', category: 'snake', defaultUnit: 'g' },
  { id: 'green-horned-frog', name: '綠角蛙', scientificName: 'Ceratophrys cranwelli', category: 'frog', defaultUnit: 'g' },
  { id: 'bearded-dragon', name: '鬃獅蜥', scientificName: 'Pogona vitticeps', category: 'lizard', defaultUnit: 'g' },
  { id: 'veiled-chameleon', name: '變色龍', scientificName: 'Chamaeleo calyptratus', category: 'lizard', defaultUnit: 'g' },
  { id: 'blue-tongue-skink', name: '藍舌蜥', scientificName: 'Tiliqua scincoides', category: 'lizard', defaultUnit: 'g' },
  { id: 'red-eared-slider', name: '巴西龜', scientificName: 'Trachemys scripta elegans', category: 'turtle', defaultUnit: 'g' },
  { id: 'sulcata-tortoise', name: '蘇卡達陸龜', scientificName: 'Centrochelys sulcata', category: 'turtle', defaultUnit: 'g' },
  { id: 'sugar-glider', name: '蜜袋鼯', scientificName: 'Petaurus breviceps', category: 'mammal', defaultUnit: 'g' },
  { id: 'hedgehog', name: '刺蝟', scientificName: 'Atelerix albiventris', category: 'mammal', defaultUnit: 'g' },
  { id: 'other', name: '其他', scientificName: '', category: 'other', defaultUnit: 'g' },
];
