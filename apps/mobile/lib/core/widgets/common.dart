import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class MossCard extends StatelessWidget {
  const MossCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Material(
      color: AppTokens.card,
      borderRadius: BorderRadius.circular(AppTokens.radiusLg),
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? Padding(padding: padding, child: child)
          : InkWell(
              onTap: onTap,
              child: Padding(padding: padding, child: child),
            ),
    );
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTokens.radiusLg),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A786046),
            blurRadius: 26,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Semantics(button: onTap != null, child: content),
    );
  }
}

class AnimalAvatar extends StatelessWidget {
  const AnimalAvatar({
    super.key,
    required this.label,
    required this.colorHex,
    this.size = 44,
    this.pattern = 'solid',
    this.photoUrl,
  });

  final String label;
  final String colorHex;
  final double size;
  final String pattern;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final color = AppTokens.colorFromHex(colorHex);
    final blended = Color.alphaBlend(Colors.white.withValues(alpha: 0.35), color);
    final initial = label.trim().isEmpty ? '?' : label.trim().substring(0, 1);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: pattern == 'gradient' ? null : blended,
        gradient: pattern == 'gradient'
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [blended, color],
              )
            : null,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
      ),
      child: ClipOval(
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (pattern == 'spots' || pattern == 'stripes')
              CustomPaint(painter: _AvatarPatternPainter(pattern: pattern, color: color)),
            Center(
              child: Text(
                initial,
                style: TextStyle(
                  color: AppTokens.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: size * 0.38,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvatarPatternPainter extends CustomPainter {
  const _AvatarPatternPainter({required this.pattern, required this.color});

  final String pattern;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withValues(alpha: 0.3);
    if (pattern == 'spots') {
      final radius = size.width * 0.11;
      for (final offset in [
        Offset(size.width * 0.2, size.height * 0.22),
        Offset(size.width * 0.72, size.height * 0.18),
        Offset(size.width * 0.48, size.height * 0.52),
        Offset(size.width * 0.18, size.height * 0.76),
        Offset(size.width * 0.78, size.height * 0.7),
      ]) {
        canvas.drawCircle(offset, radius, paint);
      }
    } else {
      final stroke = Paint()
        ..color = Colors.white.withValues(alpha: 0.25)
        ..strokeWidth = size.width * 0.1;
      for (var index = -2; index < 6; index++) {
        final x = size.width * (index * 0.28);
        canvas.drawLine(Offset(x, 0), Offset(x + size.width * 0.55, size.height), stroke);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _AvatarPatternPainter oldDelegate) =>
      oldDelegate.pattern != pattern || oldDelegate.color != color;
}

class PendingAvatar extends StatelessWidget {
  const PendingAvatar({super.key, required this.label, this.size = 44});

  final String label;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initial = label.trim().isEmpty ? '?' : label.trim().substring(0, 1);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppTokens.butter.withValues(alpha: 0.7),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
      ),
      child: Text(
        initial,
        style: TextStyle(
          color: AppTokens.ink,
          fontWeight: FontWeight.w800,
          fontSize: size * 0.38,
        ),
      ),
    );
  }
}

class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.kicker,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String kicker;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  kicker.toUpperCase(),
                  style: TextStyle(
                    color: AppTokens.primaryStrong,
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 6),
                Text(title, style: Theme.of(context).textTheme.headlineSmall),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 12), trailing!],
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    required this.body,
    this.action,
  });

  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppTokens.successBg,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.spa_outlined, color: AppTokens.primary, size: 34),
            ),
            const SizedBox(height: 20),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              body,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label = '載入中…'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 3, color: AppTokens.primary),
            ),
            const SizedBox(height: 16),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({
    super.key,
    required this.message,
    this.onRetry,
  });

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, color: AppTokens.overdue, size: 40),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: const Text('重新整理')),
            ],
          ],
        ),
      ),
    );
  }
}

class InlineBanner extends StatelessWidget {
  const InlineBanner({
    super.key,
    required this.icon,
    required this.message,
    this.color,
    this.trailing,
  });

  final IconData icon;
  final String message;
  final Color? color;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: color ?? AppTokens.butter,
        borderRadius: BorderRadius.circular(AppTokens.radiusMd),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppTokens.ink),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: AppTokens.ink, fontWeight: FontWeight.w600, height: 1.4),
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
    );
  }
}

class ConflictBanner extends StatelessWidget {
  const ConflictBanner({
    super.key,
    required this.title,
    required this.body,
    required this.onViewLatest,
    required this.onKeepMine,
    this.busy = false,
  });

  final String title;
  final String body;
  final VoidCallback onViewLatest;
  final VoidCallback onKeepMine;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTokens.warningBg,
        borderRadius: BorderRadius.circular(AppTokens.radiusMd),
        border: Border.all(color: AppTokens.accent.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.edit_note, color: AppTokens.overdue),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(fontWeight: FontWeight.w800, color: AppTokens.ink),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(body, style: TextStyle(color: AppTokens.ink, height: 1.4)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton(
                onPressed: busy ? null : onViewLatest,
                child: const Text('查看最新'),
              ),
              FilledButton(
                onPressed: busy ? null : onKeepMine,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 44),
                  backgroundColor: AppTokens.overdue,
                ),
                child: busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('保留我的'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
