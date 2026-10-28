import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'today_engine.dart';

class TodayTaskRow extends StatelessWidget {
  const TodayTaskRow({
    super.key,
    required this.task,
    required this.busy,
    required this.onComplete,
  });

  final TodayTask task;
  final bool busy;
  final VoidCallback onComplete;

  @override
  Widget build(BuildContext context) {
    final done = task.completed;
    return Semantics(
      button: !done,
      label: '${task.animalName} ${task.title}，${task.clockLabel}${done ? '，${task.completedLabel}' : task.overdue ? '，已逾時' : ''}',
      child: InkWell(
        onTap: done || busy ? null : onComplete,
        borderRadius: BorderRadius.circular(AppTokens.radiusSm),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 2),
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: done ? AppTokens.primary : AppTokens.successBg,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: done ? AppTokens.primary : AppTokens.line,
                  ),
                ),
                child: busy
                    ? SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppTokens.primary),
                      )
                    : done
                    ? const Icon(Icons.check, size: 18, color: Colors.white)
                    : null,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${task.animalName} · ${task.title}',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: done ? AppTokens.muted : AppTokens.ink,
                        decoration: done ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      done ? '${task.clockLabel} · ${task.completedLabel}' : task.clockLabel,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              if (!done && task.overdue)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTokens.overdue,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    '逾時',
                    style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
