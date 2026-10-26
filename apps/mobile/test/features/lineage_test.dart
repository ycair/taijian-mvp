import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';

void main() {
  test('lineage graph separates parents and children', () {
    final graph = LineageGraph.fromRows([
      {
        'edge_id': 'e1',
        'relation': 'parent',
        'accessible': true,
        'animal_id': 'a1',
        'name': '阿爸',
        'species_label': '豹紋守宮',
      },
      {
        'edge_id': 'e2',
        'relation': 'child',
        'accessible': true,
        'animal_id': 'a2',
        'name': '小守宮',
      },
      {
        'edge_id': 'e3',
        'relation': 'child',
        'accessible': false,
      },
    ]);

    expect(graph.parents, hasLength(1));
    expect(graph.children, hasLength(2));
    expect(graph.parents.first.name, '阿爸');
    expect(graph.children.where((relative) => !relative.accessible).single.placeholderLabel, '已轉讓／不可存取');
  });
}
