import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/command/command_attempt.dart';
import '../../data/outbox/outbox_database.dart';
import '../auth/auth_service.dart';
import '../animals/transfer_repository.dart';
import '../reminders/notification_service.dart';
import '../household/household_repository.dart';
import '../journal/public_journal_repository.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _busy = false;
  final _inviteAttempt = CommandAttempt();
  Set<String> _providers = const {};
  bool _providersLoading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_loadProviders());
  }

  Future<void> _loadProviders() async {
    try {
      final providers = await ref.read(authServiceProvider).linkedProviders();
      if (mounted) setState(() => _providers = providers);
    } catch (_) {
      // Leave the last known set; linking still works through the buttons.
    } finally {
      if (mounted) setState(() => _providersLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(appConfigProvider);
    final user = ref.watch(appUserProvider).value;
    final currentUid = ref.watch(currentUserProvider)?.uid;
    final household = ref.watch(householdProvider).value;
    final members = ref.watch(householdMembersProvider).value ?? const <HouseholdMember>[];
    final currentMember = members.where((member) => member.uid == currentUid).firstOrNull;
    final isOwner = currentMember?.role == MemberRole.owner;
    final notificationSettings = ref.watch(notificationSettingsProvider);
    final transfers = ref.watch(transfersProvider).value ?? const <AnimalTransfer>[];
    final pendingTransfers = transfers.where((transfer) => transfer.isIncoming && transfer.isPending && !transfer.isExpired).length;
    final outbox = ref.watch(outboxEntriesProvider).value ?? const <OutboxEntry>[];
    final isAdmin = ref.watch(isAdminProvider).value ?? false;
    final pending = outbox
        .where((entry) => entry.status == OutboxStatus.pending || entry.status == OutboxStatus.sending)
        .length;
    final conflicts = outbox.where((entry) => entry.status == OutboxStatus.conflict).length;
    final failed = outbox.where((entry) => entry.status == OutboxStatus.failed).length;

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 36),
        children: [
          const PageHeader(kicker: 'Settings', title: '設定'),
          if (config.useMock)
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: InlineBanner(
                icon: Icons.science_outlined,
                message: '測試模式：資料只存在這台裝置的記憶體中，重開 App 會回到範例資料。',
                color: AppTokens.butter,
              ),
            ),
          _Section(
            title: '帳號',
            child: MossCard(
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          color: AppTokens.successBg,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          (user?.displayName.isNotEmpty ?? false) ? user!.displayName.substring(0, 1) : '苔',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.displayName ?? '苔友',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              user?.timezone ?? 'Asia/Taipei',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: _busy || user == null ? null : () => _editDisplayName(user),
                        child: const Text('編輯'),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  _SettingRow(
                    icon: Icons.public,
                    title: '個人時區',
                    value: timezoneLabel(user?.timezone ?? 'Asia/Taipei'),
                    onTap: () => _editProfileTimezone(user?.timezone ?? 'Asia/Taipei'),
                  ),
                  if (config.useSupabase)
                    _SettingRow(
                      icon: Icons.link,
                      title: '已連結帳號',
                      value: _providersLoading
                          ? '載入中…'
                          : _providers.isEmpty
                          ? '尚未綁定'
                          : _providers.map(_providerLabel).join('、'),
                      onTap: _manageAccounts,
                    )
                  else
                    _SettingRow(
                      icon: Icons.link,
                      title: '連結 LINE',
                      value: config.liffConfigured ? '開啟 LIFF 完成連結' : '尚未設定 LIFF_URL',
                      onTap: _linkLine,
                    ),
                  const Divider(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.fingerprint, color: AppTokens.primaryStrong, size: 22),
                    title: const Text('我的 UID', style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: SelectableText(
                      currentUid ?? '尚未登入',
                      style: const TextStyle(
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: AppTokens.muted,
                      ),
                    ),
                    trailing: IconButton(
                      tooltip: '複製 UID',
                      onPressed: currentUid == null ? null : () => _copyUid(currentUid),
                      icon: const Icon(Icons.copy, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          _Section(
            title: '家庭',
            child: household == null
                ? MossCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('還沒有家庭', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 6),
                        Text(
                          '建立家庭後就能邀請家人一起照顧居民。',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 14),
                        FilledButton(
                          onPressed: () => context.push('/household/new'),
                          child: const Text('建立家庭'),
                        ),
                      ],
                    ),
                  )
                : MossCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(household.name, style: Theme.of(context).textTheme.titleMedium),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${household.memberCount} 位成員 · ${timezoneLabel(household.timezone)}',
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                            TextButton(
                              onPressed: _busy ? null : () => _editHouseholdName(household),
                              child: const Text('改名'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final member in members)
                              Chip(
                                avatar: CircleAvatar(
                                  backgroundColor: member.role == MemberRole.owner
                                      ? AppTokens.butter
                                      : AppTokens.successBg,
                                  child: Text(
                                    member.displayName.substring(0, 1),
                                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                                  ),
                                ),
                                label: Text('${member.displayName} · ${member.role.label}'),
                              ),
                          ],
                        ),
                        const Divider(height: 26),
                        _SettingRow(
                          icon: Icons.swap_horiz,
                          title: '轉移邀請',
                          value: pendingTransfers == 0
                              ? '查看收到的居民轉移'
                              : '$pendingTransfers 個邀請等待回覆',
                          onTap: _busy ? null : () => context.push('/transfers'),
                        ),
                        if (isOwner)
                          _SettingRow(
                            icon: Icons.group_outlined,
                            title: '管理成員',
                            value: '轉移屋主或移除代管人',
                            onTap: _busy ? null : () => _manageMembers(members, currentUid),
                          ),
                        _SettingRow(
                          icon: Icons.schedule,
                          title: '家庭時區',
                          value: timezoneLabel(household.timezone),
                          onTap: _busy ? null : () => _editHouseholdTimezone(household),
                        ),
                        _SettingRow(
                          icon: Icons.menu_book_outlined,
                          title: '旅程',
                          value: '照片日誌與家庭回憶',
                          onTap: () => context.push('/journal'),
                        ),
                        _SettingRow(
                          icon: Icons.person_add_alt_1,
                          title: '邀請家人',
                          value: '建立 7 天有效的邀請連結',
                          onTap: _busy ? null : _createInvite,
                        ),
                      ],
                    ),
                  ),
          ),
          const SizedBox(height: 20),
          _Section(
            title: '提醒通知',
            child: MossCard(
              child: Column(
                children: [
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    secondary: const Icon(Icons.notifications_active_outlined),
                    title: const Text('本機提醒通知'),
                    subtitle: const Text('在這個裝置排程照護提醒；不使用遠端推播。'),
                    value: notificationSettings.value ?? false,
                    onChanged: notificationSettings.isLoading
                        ? null
                        : (value) => _toggleNotifications(value),
                  ),
                  const Divider(height: 12),
                  _SettingRow(
                    icon: Icons.calendar_view_week_outlined,
                    title: '本週提醒',
                    value: '查看接下來 7 天的照護排程',
                    onTap: () => context.push('/reminders/weekly'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          _Section(
            title: '同步',
            child: MossCard(
              child: Column(
                children: [
                  Row(
                    children: [
                      _SyncStat(label: '待同步', value: pending),
                      const SizedBox(width: 16),
                      _SyncStat(label: '衝突', value: conflicts, alert: conflicts > 0),
                      const SizedBox(width: 16),
                      _SyncStat(label: '失敗', value: failed, alert: failed > 0),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: _busy ? null : _flushOutbox,
                        icon: const Icon(Icons.sync, size: 18),
                        label: const Text('立即同步'),
                      ),
                    ],
                  ),
                  if (conflicts > 0 || failed > 0) ...[
                    const SizedBox(height: 8),
                    const Text(
                      '有變更需要處理：衝突可以選擇保留最新或你的版本；失敗可重試或刪除。',
                      style: TextStyle(fontSize: 12, color: AppTokens.muted, height: 1.4),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          _Section(
            title: '關於',
            child: MossCard(
              child: Column(
                children: [
                  _SettingRow(
                    icon: Icons.campaign_outlined,
                    title: '提案與附議',
                    value: '一起決定苔間接下來要做什麼',
                    onTap: () => context.push('/proposals'),
                  ),
                  if (isAdmin)
                    _SettingRow(
                      icon: Icons.shield_outlined,
                      title: '檢舉管理',
                      value: '處理公開旅程的檢舉',
                      onTap: () => context.push('/moderation'),
                    ),
                  const _SettingRow(
                    icon: Icons.eco_outlined,
                    title: '苔間',
                    value: '把每一次照顧，留在同一個家。',
                  ),
                  _SettingRow(
                    icon: Icons.info_outline,
                    title: '版本',
                    value: '${ref.watch(appVersionProvider)} · '
                        '${config.useMock
                            ? 'mock'
                            : config.useSupabase
                            ? 'supabase'
                            : 'firebase'}',
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.logout, color: AppTokens.overdue),
                    title: const Text('登出', style: TextStyle(color: AppTokens.overdue, fontWeight: FontWeight.w700)),
                    onTap: _signOut,
                  ),
                  if (config.useSupabase)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.person_off_outlined, color: AppTokens.overdue),
                      title: const Text(
                        '刪除帳號',
                        style: TextStyle(color: AppTokens.overdue, fontWeight: FontWeight.w700),
                      ),
                      subtitle: const Text('刪除 profile、登入綁定與可刪除的家庭資料'),
                      onTap: _busy ? null : _deleteAccount,
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _copyUid(String uid) async {
    await Clipboard.setData(ClipboardData(text: uid));
    if (mounted) _toast('UID 已複製，可以貼給要轉移的對象。');
  }

  Future<void> _toggleNotifications(bool enabled) async {
    final accepted = await ref
        .read(notificationSettingsProvider.notifier)
        .setEnabled(enabled);
    if (!accepted && mounted) {
      _toast('需要允許系統通知權限，才能接收提醒。');
    } else if (mounted) {
      _toast(enabled ? '提醒通知已開啟。' : '提醒通知已關閉。');
    }
  }

  Future<void> _editDisplayName(AppUser user) async {
    final value = await _textDialog(
      title: '顯示名稱',
      initial: user.displayName,
      hint: '家人會看到這個名字',
      maxLength: 40,
    );
    if (value == null) return;
    await _run(
      () => ref.read(householdRepositoryProvider).updateProfile(displayName: value),
      success: '名稱已更新。',
    );
  }

  Future<void> _editProfileTimezone(String current) async {
    final value = await _timezoneDialog(current);
    if (value == null) return;
    await _run(
      () => ref.read(householdRepositoryProvider).updateProfile(timezone: value),
      success: '個人時區已更新，新提醒會使用這個時區。',
    );
  }

  Future<void> _editHouseholdName(Household household) async {
    final value = await _textDialog(
      title: '家庭名稱',
      initial: household.name,
      hint: '例如：苔間小屋',
      maxLength: 40,
    );
    if (value == null) return;
    await _run(
      () => ref.read(householdRepositoryProvider).updateName(name: value, revision: household.revision),
      success: '家庭名稱已更新。',
    );
  }

  Future<void> _editHouseholdTimezone(Household household) async {
    final value = await _timezoneDialog(household.timezone);
    if (value == null) return;
    await _run(
      () => ref.read(householdRepositoryProvider).updateTimezone(timezone: value, revision: household.revision),
      success: '家庭時區已更新。',
    );
  }

  Future<void> _createInvite() async {
    setState(() => _busy = true);
    try {
      const payload = {'role': 'caretaker', 'expiresInDays': 7};
      final commandId = _inviteAttempt.commandIdFor('member.invite', payload);
      final invite = await ref
          .read(householdRepositoryProvider)
          .createInvite(commandId: commandId);
      _inviteAttempt.reset();
      if (!mounted) return;
      final config = ref.read(appConfigProvider);
      final url = config.inviteUrl(invite.token);
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('邀請連結'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                config.liffConfigured
                    ? '把連結傳給家人，對方在 LINE 開啟後就能加入家庭。'
                    : '目前使用預留的 LIFF 網址；設定 LIFF_URL 後即可實際邀請。',
                style: const TextStyle(fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTokens.successBg,
                  borderRadius: BorderRadius.circular(AppTokens.radiusSm),
                ),
                child: SelectableText(url, style: const TextStyle(fontSize: 12)),
              ),
              const SizedBox(height: 8),
              const Text(
                '單次使用，7 天內有效。',
                style: TextStyle(fontSize: 11, color: AppTokens.muted),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: url));
                if (context.mounted) Navigator.of(context).pop();
                _toast('邀請連結已複製。');
              },
              child: const Text('複製連結'),
            ),
            FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('完成')),
          ],
        ),
      );
    } catch (error) {
      if (mounted) _toast('無法建立邀請：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _providerLabel(String provider) {
    return switch (provider) {
      'line' => 'LINE',
      'google' => 'Google',
      'guest' => '訪客',
      _ => provider,
    };
  }

  Future<void> _manageAccounts() async {
    final config = ref.read(appConfigProvider);
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('登入方式'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final provider in const ['line', 'google'])
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  provider == 'line' ? Icons.chat_bubble_outline : Icons.g_mobiledata,
                  color: AppTokens.primaryStrong,
                ),
                title: Text(_providerLabel(provider)),
                subtitle: provider == 'google' && !config.googleConfigured
                    ? const Text('尚未設定 Google Client ID')
                    : null,
                trailing: Text(
                  _providers.contains(provider) ? '解除' : '連結',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: provider == 'google' && !config.googleConfigured
                        ? AppTokens.muted
                        : AppTokens.primaryStrong,
                  ),
                ),
                enabled: provider != 'google' || config.googleConfigured,
                onTap: () {
                  Navigator.of(dialogContext).pop();
                  _toggleProvider(provider);
                },
              ),
            if (_providers.contains('guest'))
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  '目前是訪客。綁定 LINE 或 Google 後才能換手機找回資料。',
                  style: TextStyle(fontSize: 12, color: AppTokens.muted, height: 1.4),
                ),
              ),
            const SizedBox(height: 8),
            const Text(
              '不能解除最後一個登入方式。',
              style: TextStyle(fontSize: 12, color: AppTokens.muted, height: 1.4),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('關閉')),
        ],
      ),
    );
  }

  Future<void> _toggleProvider(String provider) async {
    final auth = ref.read(authServiceProvider);
    final linked = _providers.contains(provider);
    setState(() => _busy = true);
    try {
      if (linked) {
        await auth.unlinkProvider(provider);
      } else {
        await auth.linkProvider(provider);
      }
      await _loadProviders();
      if (mounted) _toast(linked ? '已解除 ${_providerLabel(provider)} 綁定。' : '已連結 ${_providerLabel(provider)}。');
    } on AuthException catch (error) {
      if (mounted) _toast(error.message);
    } catch (error) {
      if (mounted) _toast('帳號綁定失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _manageMembers(List<HouseholdMember> members, String? currentUid) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('管理成員'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final member in members.where((member) => member.uid != currentUid))
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(member.displayName),
                subtitle: Text(member.role.label),
                trailing: TextButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    _run(
                      () => member.role == MemberRole.caretaker
                          ? ref
                                .read(householdRepositoryProvider)
                                .updateMemberRole(userId: member.uid, role: 'owner')
                          : ref.read(householdRepositoryProvider).removeMember(member.uid),
                      success: member.role == MemberRole.caretaker ? '已轉移屋主。' : '已移除成員。',
                    );
                  },
                  child: Text(member.role == MemberRole.caretaker ? '設為屋主' : '移除'),
                ),
              ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('關閉')),
        ],
      ),
    );
  }

  Future<void> _deleteAccount() async {
    final uid = ref.read(currentUserProvider)?.uid;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('刪除苔間帳號？'),
        content: const Text(
          '這會刪除你的 profile、登入綁定與可刪除的家庭資料。\n'
          '如果你仍是別人的家庭唯一屋主，系統會要求先轉移或移除家庭。\n'
          '此操作無法復原。',
          style: TextStyle(height: 1.5),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('取消')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTokens.overdue),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('刪除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(authServiceProvider).deleteAccount();
      if (uid != null) {
        try {
          await ref.read(outboxProvider).purgeForUid(uid);
        } catch (_) {
          // Best effort: the server-side account is already deleted.
        }
      }
      if (mounted) _toast('帳號已刪除。');
    } on AuthException catch (error) {
      if (mounted) {
        _toast(
          error.code == 'LAST_OWNER'
              ? '你仍是家庭唯一屋主，請先轉移屋主或移除家庭。'
              : error.message,
        );
      }
    } catch (error) {
      if (mounted) _toast('刪除帳號失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _linkLine() async {
    final config = ref.read(appConfigProvider);
    if (!config.liffConfigured) {
      _toast('尚未設定 LIFF_URL，請在 build 時帶入 --dart-define=LIFF_URL=…');
      return;
    }
    final ok = await ref.read(authServiceProvider).openLineLink();
    if (!ok && mounted) _toast('無法開啟 LIFF 頁面，請確認已安裝 LINE。');
  }

  Future<void> _flushOutbox() async {
    setState(() => _busy = true);
    try {
      final result = await ref.read(outboxProvider).flush();
      if (!mounted) return;
      _toast(
        result.hasProblems
            ? '同步完成，但有 ${result.conflicts + result.failed} 筆需要處理。'
            : result.remaining > 0
            ? '尚有 ${result.remaining} 筆等待連線。'
            : '已同步 ${result.sent} 筆變更。',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    Set<String> providers = const {};
    try {
      providers = await ref.read(authServiceProvider).linkedProviders();
    } catch (_) {}
    if (!mounted) return;
    final guestOnly = providers.length == 1 && providers.contains('guest');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('登出苔間？'),
        content: Text(
          guestOnly
              ? '你目前是訪客。登出後沒有 LINE 或 Google 可以找回這個帳號，資料將無法復原。'
              : '登出會清除這台裝置上尚未同步的變更，以及前一個帳號的本機快取。'
                    '未送出的內容不會保留到下一次登入。',
          style: const TextStyle(height: 1.5),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('登出')),
        ],
      ),
    );
    if (confirmed != true) return;
    final uid = ref.read(currentUserProvider)?.uid;
    if (uid != null) {
      // Rows are already UID-scoped, but deleting them avoids leaving care
      // notes in plaintext SQLite for a later account on the same device.
      try {
        await ref.read(outboxProvider).purgeForUid(uid);
      } catch (_) {
        // A local purge failure must not trap the user in a signed-in state;
        // the rows remain scoped to this UID.
      }
    }
    await ref.read(authServiceProvider).signOut();
  }

  Future<void> _run(Future<void> Function() action, {required String success}) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) _toast(success);
    } catch (error) {
      if (mounted) _toast('更新失敗：$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _textDialog({
    required String title,
    required String initial,
    required String hint,
    required int maxLength,
  }) async {
    final value = await showDialog<String>(
      context: context,
      builder: (context) => _TextPromptDialog(
        title: title,
        initial: initial,
        hint: hint,
        maxLength: maxLength,
      ),
    );
    if (value == null || value.isEmpty || value == initial) return null;
    return value;
  }

  Future<String?> _timezoneDialog(String current) {
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('選擇時區'),
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        content: SizedBox(
          width: 320,
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final timezone in timezoneOptions)
                ListTile(
                  title: Text(timezoneLabel(timezone)),
                  trailing: timezone == current
                      ? const Icon(Icons.check, color: AppTokens.primaryStrong)
                      : null,
                  onTap: () => Navigator.of(context).pop(timezone),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppTokens.primaryStrong,
                letterSpacing: 0.6,
              ),
            ),
          ),
          child,
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

class _SettingRow extends StatelessWidget {
  const _SettingRow({
    required this.icon,
    required this.title,
    required this.value,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: AppTokens.primaryStrong, size: 22),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(value, style: Theme.of(context).textTheme.bodySmall),
      trailing: onTap == null ? null : const Icon(Icons.chevron_right, color: AppTokens.muted),
      onTap: onTap,
    );
  }
}

class _TextPromptDialog extends StatefulWidget {
  const _TextPromptDialog({
    required this.title,
    required this.initial,
    required this.hint,
    required this.maxLength,
  });

  final String title;
  final String initial;
  final String hint;
  final int maxLength;

  @override
  State<_TextPromptDialog> createState() => _TextPromptDialogState();
}

class _TextPromptDialogState extends State<_TextPromptDialog> {
  late final TextEditingController _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        maxLength: widget.maxLength,
        decoration: InputDecoration(hintText: widget.hint),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
          child: const Text('儲存'),
        ),
      ],
    );
  }
}

class _SyncStat extends StatelessWidget {
  const _SyncStat({required this.label, required this.value, this.alert = false});

  final String label;
  final int value;
  final bool alert;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$value',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w900,
            color: alert ? AppTokens.overdue : AppTokens.ink,
          ),
        ),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}
