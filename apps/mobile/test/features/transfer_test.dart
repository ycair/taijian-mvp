import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/animals/transfer_inbox_screen.dart';
import 'package:mobile/features/animals/transfer_repository.dart';

void main() {
  final incoming = AnimalTransfer(
    id: 't1',
    direction: 'incoming',
    transferType: 'other',
    status: 'pending',
    animalNames: ['阿肥'],
    sourceHouseholdName: '苔間小屋',
    expiresAt: DateTime.utc(2027, 1, 1),
    createdAt: DateTime.utc(2026, 10, 26),
  );

  test('transfer labels distinguish incoming and outgoing', () {
    expect(incoming.isIncoming, isTrue);
    expect(incoming.animalLabel, '阿肥');
    expect(incoming.statusLabel, '等待回覆');
    expect(
      AnimalTransfer(
        id: 't2',
        direction: 'outgoing',
        transferType: 'other',
        status: 'declined',
        animalNames: ['小綠'],
        sourceHouseholdName: '苔間小屋',
        expiresAt: DateTime.utc(2027, 1, 1),
        createdAt: DateTime.utc(2026, 10, 26),
      ).statusLabel,
      '已拒絕',
    );
  });

  testWidgets('inbox renders incoming and outgoing sections', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          transfersProvider.overrideWith((ref) async => [incoming]),
        ],
        child: MaterialApp(theme: buildAppTheme(), home: const TransferInboxScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('等待你回覆'), findsOneWidget);
    expect(find.text('阿肥'), findsOneWidget);
    expect(find.text('接受'), findsOneWidget);
    expect(find.text('拒絕'), findsOneWidget);
    expect(find.text('等待對方回覆'), findsOneWidget);
  });
}
