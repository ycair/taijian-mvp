import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import 'animal_list_prefs.dart';

class AnimalsScreen extends ConsumerStatefulWidget {
  const AnimalsScreen({super.key});

  @override
  ConsumerState<AnimalsScreen> createState() => _AnimalsScreenState();
}

class _AnimalsScreenState extends ConsumerState<AnimalsScreen> {
  final _searchController = TextEditingController();
  AnimalListPrefs _prefs = const AnimalListPrefs();
  String _prefsKey = '';
  String _search = '';
  String? _selectedGroup;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _ensurePrefs(String uid, String? householdId) {
    final key = '${uid.isEmpty ? 'anonymous' : uid}:${householdId ?? 'none'}';
    if (key == _prefsKey) return;
    _prefsKey = key;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadPrefs(uid, householdId));
  }

  Future<void> _loadPrefs(String uid, String? householdId) async {
    final loaded = await ref
        .read(animalListPrefsStoreProvider)
        .load(uid: uid, householdId: householdId);
    if (!mounted) return;
    setState(() => _prefs = loaded);
  }

  Future<void> _savePrefs(String uid, String? householdId) async {
    await ref.read(animalListPrefsStoreProvider).save(
      uid: uid,
      householdId: householdId,
      prefs: _prefs,
    );
  }

  Future<void> _setGroup(Animal animal, String? group, String uid, String? householdId) async {
    final groups = Map<String, String>.from(_prefs.animalGroups);
    if (group == null || group.isEmpty) {
      groups.remove(animal.id);
    } else {
      groups[animal.id] = group;
    }
    setState(() => _prefs = _prefs.copyWith(animalGroups: groups));
    await _savePrefs(uid, householdId);
  }

  Future<void> _addGroup(String uid, String? householdId) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新增分組'),
        content: TextField(
          controller: controller,
          maxLength: 20,
          autofocus: true,
          decoration: const InputDecoration(hintText: '例如：需要觀察'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('建立'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty) return;
    if (_prefs.groups.contains(name)) return;
    setState(() => _prefs = _prefs.copyWith(groups: [..._prefs.groups, name]));
    await _savePrefs(uid, householdId);
  }

  Future<void> _manageGroups(String uid, String? householdId) async {
    final removed = await showDialog<List<String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('管理分組'),
        content: SizedBox(
          width: double.maxFinite,
          child: _prefs.groups.isEmpty
              ? const Text('還沒有分組。')
              : ListView(
                  shrinkWrap: true,
                  children: [
                    for (final group in _prefs.groups)
                      ListTile(
                        title: Text(group),
                        trailing: IconButton(
                          tooltip: '刪除分組',
                          icon: const Icon(Icons.delete_outline),
                          onPressed: () => Navigator.of(context).pop(
                            _prefs.groups.where((item) => item != group).toList(),
                          ),
                        ),
                      ),
                  ],
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('關閉'),
          ),
        ],
      ),
    );
    if (removed == null) return;
    final groups = Map<String, String>.from(_prefs.animalGroups)
      ..removeWhere((_, group) => !removed.contains(group));
    setState(() {
      _prefs = _prefs.copyWith(groups: removed, animalGroups: groups);
      if (_selectedGroup != null && !removed.contains(_selectedGroup)) {
        _selectedGroup = null;
      }
    });
    await _savePrefs(uid, householdId);
  }

  Future<void> _reorder(
    int oldIndex,
    int newIndex,
    List<Animal> visible,
    String uid,
    String? householdId,
  ) async {
    final reordered = [...visible];
    final moved = reordered.removeAt(oldIndex);
    reordered.insert(newIndex, moved);
    final visibleIds = visible.map((animal) => animal.id).toSet();
    final rest = _prefs.order.where((id) => !visibleIds.contains(id)).toList();
    setState(() {
      _prefs = _prefs.copyWith(
        order: [...reordered.map((animal) => animal.id), ...rest],
        sortMode: 'custom',
      );
    });
    await _savePrefs(uid, householdId);
  }

  @override
  Widget build(BuildContext context) {
    final householdId = ref.watch(householdIdProvider);
    final uid = ref.watch(currentUserProvider)?.uid ?? '';
    final animals = ref.watch(animalsProvider);
    final active = ref.watch(activeAnimalsProvider);
    final memorial = ref.watch(memorialAnimalsProvider);
    _ensurePrefs(uid, householdId);

    if (householdId == null) {
      return SafeArea(
        child: Column(
          children: [
            const PageHeader(kicker: 'Residents', title: '我的居民'),
            Expanded(
              child: EmptyState(
                title: '還沒有家庭',
                body: '建立家庭後，就能新增第一隻居民。',
                action: FilledButton(
                  onPressed: () => context.push('/household/new'),
                  child: const Text('建立家庭'),
                ),
              ),
            ),
          ],
        ),
      );
    }

    final query = _search.trim().toLowerCase();
    var visible = active.where((animal) {
      if (_selectedGroup != null && _prefs.animalGroups[animal.id] != _selectedGroup) {
        return false;
      }
      if (query.isEmpty) return true;
      return animal.name.toLowerCase().contains(query) ||
          animal.displaySpecies.toLowerCase().contains(query) ||
          (animal.morph ?? '').toLowerCase().contains(query);
    }).toList();

    visible = _sorted(visible);

    return SafeArea(
      child: RefreshIndicator(
        color: AppTokens.primary,
        onRefresh: () async => ref.invalidate(animalsProvider),
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            PageHeader(
              kicker: 'Residents',
              title: '我的居民',
              subtitle: active.isEmpty ? '把第一隻爬寵放進苔間。' : '${active.length} 位居民正在被好好照顧。',
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  PopupMenuButton<String>(
                    tooltip: '排序',
                    icon: const Icon(Icons.sort, size: 21),
                    initialValue: _prefs.sortMode,
                    onSelected: (mode) async {
                      setState(() => _prefs = _prefs.copyWith(sortMode: mode));
                      await _savePrefs(uid, householdId);
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(value: 'custom', child: Text('自訂順序')),
                      PopupMenuItem(value: 'name', child: Text('依名字')),
                    ],
                  ),
                  TextButton.icon(
                    onPressed: () => context.go('/animals/new'),
                    icon: const Icon(Icons.add, size: 20),
                    label: const Text('新增'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 2, 20, 12),
              child: MossCard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  children: [
                    const Icon(Icons.history_outlined, color: AppTokens.primaryStrong),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('照護時間軸', style: TextStyle(fontWeight: FontWeight.w800)),
                          SizedBox(height: 2),
                          Text('紀錄、分析與家庭照護摘要', style: TextStyle(fontSize: 11, color: AppTokens.muted)),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => context.push('/records'),
                      child: const Text('查看'),
                    ),
                    IconButton(
                      tooltip: '家庭分析',
                      onPressed: () => context.push('/records/analytics'),
                      icon: const Icon(Icons.insights_outlined, size: 19),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: TextField(
                controller: _searchController,
                onChanged: (value) => setState(() => _search = value),
                decoration: InputDecoration(
                  hintText: '搜尋名字、物種或基因',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _search.isEmpty
                      ? null
                      : IconButton(
                          tooltip: '清除搜尋',
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _search = '');
                          },
                          icon: const Icon(Icons.close, size: 18),
                        ),
                ),
              ),
            ),
            if (_prefs.groups.isNotEmpty || _selectedGroup != null)
              SizedBox(
                height: 38,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  children: [
                    ChoiceChip(
                      label: const Text('全部'),
                      selected: _selectedGroup == null,
                      onSelected: (_) => setState(() => _selectedGroup = null),
                    ),
                    for (final group in _prefs.groups) ...[
                      const SizedBox(width: 6),
                      ChoiceChip(
                        label: Text(group),
                        selected: _selectedGroup == group,
                        onSelected: (_) => setState(
                          () => _selectedGroup = _selectedGroup == group ? null : group,
                        ),
                      ),
                    ],
                    const SizedBox(width: 6),
                    ActionChip(
                      avatar: const Icon(Icons.add, size: 15),
                      label: const Text('分組'),
                      onPressed: () => _addGroup(uid, householdId),
                    ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 6),
              child: Row(
                children: [
                  Text(
                    _selectedGroup == null ? '全部居民' : '分組：$_selectedGroup',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => _manageGroups(uid, householdId),
                    icon: const Icon(Icons.tune, size: 16),
                    label: const Text('管理分組'),
                  ),
                ],
              ),
            ),
            if (animals.hasError)
              ErrorView(
                message: '讀取居民失敗，請檢查網路後重新整理。',
                onRetry: () => ref.invalidate(animalsProvider),
              )
            else if (animals.isLoading)
              const LoadingView()
            else if (visible.isEmpty)
              EmptyState(
                title: query.isEmpty && _selectedGroup == null ? '還沒有居民' : '沒有符合的居民',
                body: query.isEmpty && _selectedGroup == null
                    ? '新增第一隻爬寵，開始記錄牠的日常生活。'
                    : '換個搜尋字或分組試試看。',
                action: FilledButton.icon(
                  onPressed: () => context.go('/animals/new'),
                  icon: const Icon(Icons.add),
                  label: const Text('新增居民'),
                ),
              )
            else
              ReorderableListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                itemCount: visible.length,
                onReorderItem: (oldIndex, newIndex) =>
                    _reorder(oldIndex, newIndex, visible, uid, householdId),
                itemBuilder: (context, index) {
                  final animal = visible[index];
                  return Padding(
                    key: ValueKey(animal.id),
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                    child: ReorderableDragStartListener(
                      index: index,
                      child: _AnimalCard(
                        animal: animal,
                        groups: _prefs.groups,
                        group: _prefs.animalGroups[animal.id],
                        onGroupSelected: (group) =>
                            _setGroup(animal, group, uid, householdId),
                      ),
                    ),
                  );
                },
              ),
            if (memorial.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
                child: Row(
                  children: [
                    const Icon(Icons.local_florist_outlined, size: 18, color: AppTokens.muted),
                    const SizedBox(width: 6),
                    Text('紀念', style: Theme.of(context).textTheme.titleMedium),
                  ],
                ),
              ),
              ...memorial.map(
                (animal) => Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: _AnimalCard(animal: animal),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<Animal> _sorted(List<Animal> animals) {
    final byId = {for (final animal in animals) animal.id: animal};
    if (_prefs.sortMode == 'name') {
      return [...animals]..sort((a, b) => a.name.compareTo(b.name));
    }
    final ordered = <Animal>[];
    for (final id in _prefs.order) {
      final animal = byId.remove(id);
      if (animal != null) ordered.add(animal);
    }
    final remaining = byId.values.toList()..sort((a, b) => a.name.compareTo(b.name));
    return [...ordered, ...remaining];
  }
}

class _AnimalCard extends StatelessWidget {
  const _AnimalCard({
    required this.animal,
    this.groups = const [],
    this.group,
    this.onGroupSelected,
  });

  final Animal animal;
  final List<String> groups;
  final String? group;
  final ValueChanged<String?>? onGroupSelected;

  @override
  Widget build(BuildContext context) {
    return MossCard(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      onTap: () => context.go('/animals/${animal.id}'),
      child: Row(
        children: [
          AnimalAvatar(label: animal.initial, colorHex: animal.avatarColor, pattern: animal.avatarPattern, size: 52),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  animal.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    animal.displaySpecies,
                    if (animal.morph != null && animal.morph!.isNotEmpty) animal.morph!,
                    if (animal.isMemorial) '紀念',
                  ].join(' · '),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (group != null && group!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      group!,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppTokens.primaryStrong,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (onGroupSelected != null)
            PopupMenuButton<String>(
              tooltip: '移到分組',
              icon: const Icon(Icons.folder_outlined, size: 19),
              onSelected: (value) => onGroupSelected!(value == '__none__' ? null : value),
              itemBuilder: (context) => [
                const PopupMenuItem(value: '__none__', child: Text('未分組')),
                for (final group in groups)
                  PopupMenuItem(value: group, child: Text(group)),
              ],
            ),
          const Icon(Icons.chevron_right, color: AppTokens.muted),
        ],
      ),
    );
  }
}
