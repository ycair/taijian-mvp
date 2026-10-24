// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outbox_database.dart';

// ignore_for_file: type=lint
class $OutboxEntriesTable extends OutboxEntries
    with TableInfo<$OutboxEntriesTable, OutboxEntry> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OutboxEntriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _commandIdMeta = const VerificationMeta(
    'commandId',
  );
  @override
  late final GeneratedColumn<String> commandId = GeneratedColumn<String>(
    'command_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _uidMeta = const VerificationMeta('uid');
  @override
  late final GeneratedColumn<String> uid = GeneratedColumn<String>(
    'uid',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
    'type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _householdIdMeta = const VerificationMeta(
    'householdId',
  );
  @override
  late final GeneratedColumn<String> householdId = GeneratedColumn<String>(
    'household_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _targetIdMeta = const VerificationMeta(
    'targetId',
  );
  @override
  late final GeneratedColumn<String> targetId = GeneratedColumn<String>(
    'target_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _baseRevisionMeta = const VerificationMeta(
    'baseRevision',
  );
  @override
  late final GeneratedColumn<int> baseRevision = GeneratedColumn<int>(
    'base_revision',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta(
    'payloadJson',
  );
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(OutboxStatus.pending),
  );
  static const VerificationMeta _attemptsMeta = const VerificationMeta(
    'attempts',
  );
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
    'attempts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _lastErrorMeta = const VerificationMeta(
    'lastError',
  );
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
    'last_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _conflictJsonMeta = const VerificationMeta(
    'conflictJson',
  );
  @override
  late final GeneratedColumn<String> conflictJson = GeneratedColumn<String>(
    'conflict_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _conflictRevisionMeta = const VerificationMeta(
    'conflictRevision',
  );
  @override
  late final GeneratedColumn<int> conflictRevision = GeneratedColumn<int>(
    'conflict_revision',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    commandId,
    uid,
    type,
    householdId,
    targetId,
    baseRevision,
    payloadJson,
    status,
    attempts,
    lastError,
    conflictJson,
    conflictRevision,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'outbox_entries';
  @override
  VerificationContext validateIntegrity(
    Insertable<OutboxEntry> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('command_id')) {
      context.handle(
        _commandIdMeta,
        commandId.isAcceptableOrUnknown(data['command_id']!, _commandIdMeta),
      );
    } else if (isInserting) {
      context.missing(_commandIdMeta);
    }
    if (data.containsKey('uid')) {
      context.handle(
        _uidMeta,
        uid.isAcceptableOrUnknown(data['uid']!, _uidMeta),
      );
    } else if (isInserting) {
      context.missing(_uidMeta);
    }
    if (data.containsKey('type')) {
      context.handle(
        _typeMeta,
        type.isAcceptableOrUnknown(data['type']!, _typeMeta),
      );
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('household_id')) {
      context.handle(
        _householdIdMeta,
        householdId.isAcceptableOrUnknown(
          data['household_id']!,
          _householdIdMeta,
        ),
      );
    }
    if (data.containsKey('target_id')) {
      context.handle(
        _targetIdMeta,
        targetId.isAcceptableOrUnknown(data['target_id']!, _targetIdMeta),
      );
    }
    if (data.containsKey('base_revision')) {
      context.handle(
        _baseRevisionMeta,
        baseRevision.isAcceptableOrUnknown(
          data['base_revision']!,
          _baseRevisionMeta,
        ),
      );
    }
    if (data.containsKey('payload_json')) {
      context.handle(
        _payloadJsonMeta,
        payloadJson.isAcceptableOrUnknown(
          data['payload_json']!,
          _payloadJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('attempts')) {
      context.handle(
        _attemptsMeta,
        attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta),
      );
    }
    if (data.containsKey('last_error')) {
      context.handle(
        _lastErrorMeta,
        lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta),
      );
    }
    if (data.containsKey('conflict_json')) {
      context.handle(
        _conflictJsonMeta,
        conflictJson.isAcceptableOrUnknown(
          data['conflict_json']!,
          _conflictJsonMeta,
        ),
      );
    }
    if (data.containsKey('conflict_revision')) {
      context.handle(
        _conflictRevisionMeta,
        conflictRevision.isAcceptableOrUnknown(
          data['conflict_revision']!,
          _conflictRevisionMeta,
        ),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {commandId};
  @override
  OutboxEntry map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OutboxEntry(
      commandId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}command_id'],
      )!,
      uid: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}uid'],
      )!,
      type: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}type'],
      )!,
      householdId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}household_id'],
      ),
      targetId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}target_id'],
      ),
      baseRevision: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}base_revision'],
      ),
      payloadJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_json'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      attempts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}attempts'],
      )!,
      lastError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_error'],
      ),
      conflictJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}conflict_json'],
      ),
      conflictRevision: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}conflict_revision'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $OutboxEntriesTable createAlias(String alias) {
    return $OutboxEntriesTable(attachedDatabase, alias);
  }
}

class OutboxEntry extends DataClass implements Insertable<OutboxEntry> {
  final String commandId;
  final String uid;
  final String type;
  final String? householdId;
  final String? targetId;
  final int? baseRevision;
  final String payloadJson;
  final String status;
  final int attempts;
  final String? lastError;
  final String? conflictJson;
  final int? conflictRevision;
  final DateTime createdAt;
  const OutboxEntry({
    required this.commandId,
    required this.uid,
    required this.type,
    this.householdId,
    this.targetId,
    this.baseRevision,
    required this.payloadJson,
    required this.status,
    required this.attempts,
    this.lastError,
    this.conflictJson,
    this.conflictRevision,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['command_id'] = Variable<String>(commandId);
    map['uid'] = Variable<String>(uid);
    map['type'] = Variable<String>(type);
    if (!nullToAbsent || householdId != null) {
      map['household_id'] = Variable<String>(householdId);
    }
    if (!nullToAbsent || targetId != null) {
      map['target_id'] = Variable<String>(targetId);
    }
    if (!nullToAbsent || baseRevision != null) {
      map['base_revision'] = Variable<int>(baseRevision);
    }
    map['payload_json'] = Variable<String>(payloadJson);
    map['status'] = Variable<String>(status);
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    if (!nullToAbsent || conflictJson != null) {
      map['conflict_json'] = Variable<String>(conflictJson);
    }
    if (!nullToAbsent || conflictRevision != null) {
      map['conflict_revision'] = Variable<int>(conflictRevision);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  OutboxEntriesCompanion toCompanion(bool nullToAbsent) {
    return OutboxEntriesCompanion(
      commandId: Value(commandId),
      uid: Value(uid),
      type: Value(type),
      householdId: householdId == null && nullToAbsent
          ? const Value.absent()
          : Value(householdId),
      targetId: targetId == null && nullToAbsent
          ? const Value.absent()
          : Value(targetId),
      baseRevision: baseRevision == null && nullToAbsent
          ? const Value.absent()
          : Value(baseRevision),
      payloadJson: Value(payloadJson),
      status: Value(status),
      attempts: Value(attempts),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      conflictJson: conflictJson == null && nullToAbsent
          ? const Value.absent()
          : Value(conflictJson),
      conflictRevision: conflictRevision == null && nullToAbsent
          ? const Value.absent()
          : Value(conflictRevision),
      createdAt: Value(createdAt),
    );
  }

  factory OutboxEntry.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OutboxEntry(
      commandId: serializer.fromJson<String>(json['commandId']),
      uid: serializer.fromJson<String>(json['uid']),
      type: serializer.fromJson<String>(json['type']),
      householdId: serializer.fromJson<String?>(json['householdId']),
      targetId: serializer.fromJson<String?>(json['targetId']),
      baseRevision: serializer.fromJson<int?>(json['baseRevision']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      status: serializer.fromJson<String>(json['status']),
      attempts: serializer.fromJson<int>(json['attempts']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      conflictJson: serializer.fromJson<String?>(json['conflictJson']),
      conflictRevision: serializer.fromJson<int?>(json['conflictRevision']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'commandId': serializer.toJson<String>(commandId),
      'uid': serializer.toJson<String>(uid),
      'type': serializer.toJson<String>(type),
      'householdId': serializer.toJson<String?>(householdId),
      'targetId': serializer.toJson<String?>(targetId),
      'baseRevision': serializer.toJson<int?>(baseRevision),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'status': serializer.toJson<String>(status),
      'attempts': serializer.toJson<int>(attempts),
      'lastError': serializer.toJson<String?>(lastError),
      'conflictJson': serializer.toJson<String?>(conflictJson),
      'conflictRevision': serializer.toJson<int?>(conflictRevision),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  OutboxEntry copyWith({
    String? commandId,
    String? uid,
    String? type,
    Value<String?> householdId = const Value.absent(),
    Value<String?> targetId = const Value.absent(),
    Value<int?> baseRevision = const Value.absent(),
    String? payloadJson,
    String? status,
    int? attempts,
    Value<String?> lastError = const Value.absent(),
    Value<String?> conflictJson = const Value.absent(),
    Value<int?> conflictRevision = const Value.absent(),
    DateTime? createdAt,
  }) => OutboxEntry(
    commandId: commandId ?? this.commandId,
    uid: uid ?? this.uid,
    type: type ?? this.type,
    householdId: householdId.present ? householdId.value : this.householdId,
    targetId: targetId.present ? targetId.value : this.targetId,
    baseRevision: baseRevision.present ? baseRevision.value : this.baseRevision,
    payloadJson: payloadJson ?? this.payloadJson,
    status: status ?? this.status,
    attempts: attempts ?? this.attempts,
    lastError: lastError.present ? lastError.value : this.lastError,
    conflictJson: conflictJson.present ? conflictJson.value : this.conflictJson,
    conflictRevision: conflictRevision.present
        ? conflictRevision.value
        : this.conflictRevision,
    createdAt: createdAt ?? this.createdAt,
  );
  OutboxEntry copyWithCompanion(OutboxEntriesCompanion data) {
    return OutboxEntry(
      commandId: data.commandId.present ? data.commandId.value : this.commandId,
      uid: data.uid.present ? data.uid.value : this.uid,
      type: data.type.present ? data.type.value : this.type,
      householdId: data.householdId.present
          ? data.householdId.value
          : this.householdId,
      targetId: data.targetId.present ? data.targetId.value : this.targetId,
      baseRevision: data.baseRevision.present
          ? data.baseRevision.value
          : this.baseRevision,
      payloadJson: data.payloadJson.present
          ? data.payloadJson.value
          : this.payloadJson,
      status: data.status.present ? data.status.value : this.status,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      conflictJson: data.conflictJson.present
          ? data.conflictJson.value
          : this.conflictJson,
      conflictRevision: data.conflictRevision.present
          ? data.conflictRevision.value
          : this.conflictRevision,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OutboxEntry(')
          ..write('commandId: $commandId, ')
          ..write('uid: $uid, ')
          ..write('type: $type, ')
          ..write('householdId: $householdId, ')
          ..write('targetId: $targetId, ')
          ..write('baseRevision: $baseRevision, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('status: $status, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('conflictJson: $conflictJson, ')
          ..write('conflictRevision: $conflictRevision, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    commandId,
    uid,
    type,
    householdId,
    targetId,
    baseRevision,
    payloadJson,
    status,
    attempts,
    lastError,
    conflictJson,
    conflictRevision,
    createdAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OutboxEntry &&
          other.commandId == this.commandId &&
          other.uid == this.uid &&
          other.type == this.type &&
          other.householdId == this.householdId &&
          other.targetId == this.targetId &&
          other.baseRevision == this.baseRevision &&
          other.payloadJson == this.payloadJson &&
          other.status == this.status &&
          other.attempts == this.attempts &&
          other.lastError == this.lastError &&
          other.conflictJson == this.conflictJson &&
          other.conflictRevision == this.conflictRevision &&
          other.createdAt == this.createdAt);
}

class OutboxEntriesCompanion extends UpdateCompanion<OutboxEntry> {
  final Value<String> commandId;
  final Value<String> uid;
  final Value<String> type;
  final Value<String?> householdId;
  final Value<String?> targetId;
  final Value<int?> baseRevision;
  final Value<String> payloadJson;
  final Value<String> status;
  final Value<int> attempts;
  final Value<String?> lastError;
  final Value<String?> conflictJson;
  final Value<int?> conflictRevision;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const OutboxEntriesCompanion({
    this.commandId = const Value.absent(),
    this.uid = const Value.absent(),
    this.type = const Value.absent(),
    this.householdId = const Value.absent(),
    this.targetId = const Value.absent(),
    this.baseRevision = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.status = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.conflictJson = const Value.absent(),
    this.conflictRevision = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OutboxEntriesCompanion.insert({
    required String commandId,
    required String uid,
    required String type,
    this.householdId = const Value.absent(),
    this.targetId = const Value.absent(),
    this.baseRevision = const Value.absent(),
    required String payloadJson,
    this.status = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.conflictJson = const Value.absent(),
    this.conflictRevision = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  }) : commandId = Value(commandId),
       uid = Value(uid),
       type = Value(type),
       payloadJson = Value(payloadJson),
       createdAt = Value(createdAt);
  static Insertable<OutboxEntry> custom({
    Expression<String>? commandId,
    Expression<String>? uid,
    Expression<String>? type,
    Expression<String>? householdId,
    Expression<String>? targetId,
    Expression<int>? baseRevision,
    Expression<String>? payloadJson,
    Expression<String>? status,
    Expression<int>? attempts,
    Expression<String>? lastError,
    Expression<String>? conflictJson,
    Expression<int>? conflictRevision,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (commandId != null) 'command_id': commandId,
      if (uid != null) 'uid': uid,
      if (type != null) 'type': type,
      if (householdId != null) 'household_id': householdId,
      if (targetId != null) 'target_id': targetId,
      if (baseRevision != null) 'base_revision': baseRevision,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (status != null) 'status': status,
      if (attempts != null) 'attempts': attempts,
      if (lastError != null) 'last_error': lastError,
      if (conflictJson != null) 'conflict_json': conflictJson,
      if (conflictRevision != null) 'conflict_revision': conflictRevision,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OutboxEntriesCompanion copyWith({
    Value<String>? commandId,
    Value<String>? uid,
    Value<String>? type,
    Value<String?>? householdId,
    Value<String?>? targetId,
    Value<int?>? baseRevision,
    Value<String>? payloadJson,
    Value<String>? status,
    Value<int>? attempts,
    Value<String?>? lastError,
    Value<String?>? conflictJson,
    Value<int?>? conflictRevision,
    Value<DateTime>? createdAt,
    Value<int>? rowid,
  }) {
    return OutboxEntriesCompanion(
      commandId: commandId ?? this.commandId,
      uid: uid ?? this.uid,
      type: type ?? this.type,
      householdId: householdId ?? this.householdId,
      targetId: targetId ?? this.targetId,
      baseRevision: baseRevision ?? this.baseRevision,
      payloadJson: payloadJson ?? this.payloadJson,
      status: status ?? this.status,
      attempts: attempts ?? this.attempts,
      lastError: lastError ?? this.lastError,
      conflictJson: conflictJson ?? this.conflictJson,
      conflictRevision: conflictRevision ?? this.conflictRevision,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (commandId.present) {
      map['command_id'] = Variable<String>(commandId.value);
    }
    if (uid.present) {
      map['uid'] = Variable<String>(uid.value);
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (householdId.present) {
      map['household_id'] = Variable<String>(householdId.value);
    }
    if (targetId.present) {
      map['target_id'] = Variable<String>(targetId.value);
    }
    if (baseRevision.present) {
      map['base_revision'] = Variable<int>(baseRevision.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (conflictJson.present) {
      map['conflict_json'] = Variable<String>(conflictJson.value);
    }
    if (conflictRevision.present) {
      map['conflict_revision'] = Variable<int>(conflictRevision.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OutboxEntriesCompanion(')
          ..write('commandId: $commandId, ')
          ..write('uid: $uid, ')
          ..write('type: $type, ')
          ..write('householdId: $householdId, ')
          ..write('targetId: $targetId, ')
          ..write('baseRevision: $baseRevision, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('status: $status, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('conflictJson: $conflictJson, ')
          ..write('conflictRevision: $conflictRevision, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$OutboxDatabase extends GeneratedDatabase {
  _$OutboxDatabase(QueryExecutor e) : super(e);
  $OutboxDatabaseManager get managers => $OutboxDatabaseManager(this);
  late final $OutboxEntriesTable outboxEntries = $OutboxEntriesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [outboxEntries];
}

typedef $$OutboxEntriesTableCreateCompanionBuilder =
    OutboxEntriesCompanion Function({
      required String commandId,
      required String uid,
      required String type,
      Value<String?> householdId,
      Value<String?> targetId,
      Value<int?> baseRevision,
      required String payloadJson,
      Value<String> status,
      Value<int> attempts,
      Value<String?> lastError,
      Value<String?> conflictJson,
      Value<int?> conflictRevision,
      required DateTime createdAt,
      Value<int> rowid,
    });
typedef $$OutboxEntriesTableUpdateCompanionBuilder =
    OutboxEntriesCompanion Function({
      Value<String> commandId,
      Value<String> uid,
      Value<String> type,
      Value<String?> householdId,
      Value<String?> targetId,
      Value<int?> baseRevision,
      Value<String> payloadJson,
      Value<String> status,
      Value<int> attempts,
      Value<String?> lastError,
      Value<String?> conflictJson,
      Value<int?> conflictRevision,
      Value<DateTime> createdAt,
      Value<int> rowid,
    });

class $$OutboxEntriesTableFilterComposer
    extends Composer<_$OutboxDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get commandId => $composableBuilder(
    column: $table.commandId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get uid => $composableBuilder(
    column: $table.uid,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get type => $composableBuilder(
    column: $table.type,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get householdId => $composableBuilder(
    column: $table.householdId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get targetId => $composableBuilder(
    column: $table.targetId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get baseRevision => $composableBuilder(
    column: $table.baseRevision,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get conflictJson => $composableBuilder(
    column: $table.conflictJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get conflictRevision => $composableBuilder(
    column: $table.conflictRevision,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OutboxEntriesTableOrderingComposer
    extends Composer<_$OutboxDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get commandId => $composableBuilder(
    column: $table.commandId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get uid => $composableBuilder(
    column: $table.uid,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get type => $composableBuilder(
    column: $table.type,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get householdId => $composableBuilder(
    column: $table.householdId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get targetId => $composableBuilder(
    column: $table.targetId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get baseRevision => $composableBuilder(
    column: $table.baseRevision,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get conflictJson => $composableBuilder(
    column: $table.conflictJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get conflictRevision => $composableBuilder(
    column: $table.conflictRevision,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OutboxEntriesTableAnnotationComposer
    extends Composer<_$OutboxDatabase, $OutboxEntriesTable> {
  $$OutboxEntriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get commandId =>
      $composableBuilder(column: $table.commandId, builder: (column) => column);

  GeneratedColumn<String> get uid =>
      $composableBuilder(column: $table.uid, builder: (column) => column);

  GeneratedColumn<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get householdId => $composableBuilder(
    column: $table.householdId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get targetId =>
      $composableBuilder(column: $table.targetId, builder: (column) => column);

  GeneratedColumn<int> get baseRevision => $composableBuilder(
    column: $table.baseRevision,
    builder: (column) => column,
  );

  GeneratedColumn<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<String> get conflictJson => $composableBuilder(
    column: $table.conflictJson,
    builder: (column) => column,
  );

  GeneratedColumn<int> get conflictRevision => $composableBuilder(
    column: $table.conflictRevision,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$OutboxEntriesTableTableManager
    extends
        RootTableManager<
          _$OutboxDatabase,
          $OutboxEntriesTable,
          OutboxEntry,
          $$OutboxEntriesTableFilterComposer,
          $$OutboxEntriesTableOrderingComposer,
          $$OutboxEntriesTableAnnotationComposer,
          $$OutboxEntriesTableCreateCompanionBuilder,
          $$OutboxEntriesTableUpdateCompanionBuilder,
          (
            OutboxEntry,
            BaseReferences<_$OutboxDatabase, $OutboxEntriesTable, OutboxEntry>,
          ),
          OutboxEntry,
          PrefetchHooks Function()
        > {
  $$OutboxEntriesTableTableManager(
    _$OutboxDatabase db,
    $OutboxEntriesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OutboxEntriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OutboxEntriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OutboxEntriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> commandId = const Value.absent(),
                Value<String> uid = const Value.absent(),
                Value<String> type = const Value.absent(),
                Value<String?> householdId = const Value.absent(),
                Value<String?> targetId = const Value.absent(),
                Value<int?> baseRevision = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<String?> conflictJson = const Value.absent(),
                Value<int?> conflictRevision = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => OutboxEntriesCompanion(
                commandId: commandId,
                uid: uid,
                type: type,
                householdId: householdId,
                targetId: targetId,
                baseRevision: baseRevision,
                payloadJson: payloadJson,
                status: status,
                attempts: attempts,
                lastError: lastError,
                conflictJson: conflictJson,
                conflictRevision: conflictRevision,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String commandId,
                required String uid,
                required String type,
                Value<String?> householdId = const Value.absent(),
                Value<String?> targetId = const Value.absent(),
                Value<int?> baseRevision = const Value.absent(),
                required String payloadJson,
                Value<String> status = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<String?> conflictJson = const Value.absent(),
                Value<int?> conflictRevision = const Value.absent(),
                required DateTime createdAt,
                Value<int> rowid = const Value.absent(),
              }) => OutboxEntriesCompanion.insert(
                commandId: commandId,
                uid: uid,
                type: type,
                householdId: householdId,
                targetId: targetId,
                baseRevision: baseRevision,
                payloadJson: payloadJson,
                status: status,
                attempts: attempts,
                lastError: lastError,
                conflictJson: conflictJson,
                conflictRevision: conflictRevision,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OutboxEntriesTable, OutboxEntry>(table),
                  BaseReferences<
                    _$OutboxDatabase,
                    $OutboxEntriesTable,
                    OutboxEntry
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OutboxEntriesTableProcessedTableManager =
    ProcessedTableManager<
      _$OutboxDatabase,
      $OutboxEntriesTable,
      OutboxEntry,
      $$OutboxEntriesTableFilterComposer,
      $$OutboxEntriesTableOrderingComposer,
      $$OutboxEntriesTableAnnotationComposer,
      $$OutboxEntriesTableCreateCompanionBuilder,
      $$OutboxEntriesTableUpdateCompanionBuilder,
      (
        OutboxEntry,
        BaseReferences<_$OutboxDatabase, $OutboxEntriesTable, OutboxEntry>,
      ),
      OutboxEntry,
      PrefetchHooks Function()
    >;

class $OutboxDatabaseManager {
  final _$OutboxDatabase _db;
  $OutboxDatabaseManager(this._db);
  $$OutboxEntriesTableTableManager get outboxEntries =>
      $$OutboxEntriesTableTableManager(_db, _db.outboxEntries);
}
