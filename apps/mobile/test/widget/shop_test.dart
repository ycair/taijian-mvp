import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shop/shop_screen.dart';
import '../support/test_harness.dart';

void main() {
  testWidgets('shop renders sandbox products and points tab', (tester) async {
    final harness = await createTestHarness();
    addTearDown(harness.dispose);

    await tester.pumpWidget(wrapScreen(harness, const ShopScreen()));
    await tester.pumpAndSettle();

    expect(find.text('苔間雜貨'), findsOneWidget);
    expect(find.text('苔間躲避屋'), findsOneWidget);
    expect(find.textContaining('沙盒'), findsWidgets);

    await tester.tap(find.text('點數'));
    await tester.pumpAndSettle();
    expect(find.text('目前點數'), findsOneWidget);
    expect(find.text('每日簽到'), findsOneWidget);
  });
}
