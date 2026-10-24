import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';

/// Periodic safety net for the outbox.
///
/// iOS does not guarantee a Dart callback on network change without an extra
/// plugin, so a 30-second retry plus the app-resume hook covers connection
/// restoration. A flush is a cheap local query while the queue is empty.
class OutboxAutoSync extends ConsumerStatefulWidget {
  const OutboxAutoSync({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<OutboxAutoSync> createState() => _OutboxAutoSyncState();
}

class _OutboxAutoSyncState extends ConsumerState<OutboxAutoSync>
    with WidgetsBindingObserver {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _flush());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _flush();
  }

  void _flush() {
    if (!mounted) return;
    if (ref.read(currentUserProvider) == null) return;
    unawaited(ref.read(outboxProvider).flush());
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
