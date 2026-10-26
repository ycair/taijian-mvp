import { corsHeaders, json } from '../_shared/http.ts';
import { verifyAccessTokenFromRequest } from '../_shared/auth_tokens.ts';
import { sql } from '../_shared/db.ts';

type Envelope = {
  commandId: string;
  type: string;
  householdId?: string;
  baseRevision?: number;
  payload: Record<string, unknown>;
  client?: { platform?: string; appVersion?: string };
};

const ok = (commandId: string, data: unknown, revision?: number) => ({
  ok: true as const,
  commandId,
  ...(revision === undefined ? {} : { revision }),
  data,
  serverTime: new Date().toISOString(),
});

const fail = (commandId: string, code: string, message: string, extra: Record<string, unknown> = {}) => ({
  ok: false as const,
  commandId,
  code,
  message,
  ...extra,
  serverTime: new Date().toISOString(),
});

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function requireMember(tx: any, householdId: string, userId: string) {
  const rows = await tx`
    select role from household_members
    where household_id = ${householdId} and user_id = ${userId}
  `;
  if (!rows.length) throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
  return rows[0] as { role: string };
}

async function pointsBalance(tx: any, userId: string): Promise<number> {
  const [row] = await tx`
    select coalesce(sum(delta), 0)::int as balance
    from points_ledger where profile_id = ${userId}
  `;
  return Number(row?.balance ?? 0);
}

const RECORD_TYPES = new Set([
  'feeding', 'water', 'weight', 'length', 'poop', 'shed',
  'activity', 'medical', 'note', 'custom',
]);

function recordMetadata(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('metadata must be an object'), { code: 'VALIDATION_ERROR' });
  }
  const metadata = value as Record<string, unknown>;
  if (JSON.stringify(metadata).length > 4000) {
    throw Object.assign(new Error('metadata is too large'), { code: 'VALIDATION_ERROR' });
  }
  if (metadata.refused != null && typeof metadata.refused !== 'boolean') {
    throw Object.assign(new Error('refused must be a boolean'), { code: 'VALIDATION_ERROR' });
  }
  if (metadata.activityLevel != null && !['normal', 'low', 'high'].includes(String(metadata.activityLevel))) {
    throw Object.assign(new Error('invalid activity level'), { code: 'VALIDATION_ERROR' });
  }
  for (const key of ['food', 'medication', 'dosage', 'label']) {
    if (metadata[key] != null && typeof metadata[key] !== 'string') {
      throw Object.assign(new Error(`${key} must be text`), { code: 'VALIDATION_ERROR' });
    }
  }
  return metadata;
}

function journalPhotos(
  value: unknown,
  householdId: string,
  journalId: string,
): { photos: Record<string, unknown>[]; coverPath: string | null } {
  const raw = Array.isArray(value) ? value : [];
  if (raw.length > 5) {
    throw Object.assign(new Error('a journal can have at most 5 photos'), { code: 'VALIDATION_ERROR' });
  }
  const prefix = `${householdId}/${journalId}/`;
  const seen = new Set<string>();
  const photos: Record<string, unknown>[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item == null || Array.isArray(item)) {
      throw Object.assign(new Error('invalid journal photo'), { code: 'VALIDATION_ERROR' });
    }
    const row = item as Record<string, unknown>;
    const path = String(row.path ?? '').trim();
    if (
      !path.startsWith(prefix) ||
      path.includes('..') ||
      path.length > 300 ||
      seen.has(path)
    ) {
      throw Object.assign(new Error('invalid journal photo path'), { code: 'VALIDATION_ERROR' });
    }
    seen.add(path);
    photos.push({
      path,
      caption: row.caption == null ? '' : String(row.caption).trim().slice(0, 200),
    });
  }
  const coverPath = photos.length ? String(photos[0].path) : null;
  return { photos, coverPath };
}

function journalValues(payload: Record<string, unknown>) {
  const title = String(payload.title ?? '').trim();
  if (!title || title.length > 80) {
    throw Object.assign(new Error('journal title must be 1-80 characters'), { code: 'VALIDATION_ERROR' });
  }
  const body = String(payload.body ?? '').trim().slice(0, 5000);
  const journalDate = String(payload.journalDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(journalDate)) {
    throw Object.assign(new Error('invalid journal date'), { code: 'VALIDATION_ERROR' });
  }
  const rawAnimalIds = Array.isArray(payload.animalIds) ? payload.animalIds.map(String) : [];
  const animalIds = [...new Set(rawAnimalIds.filter(Boolean))];
  if (animalIds.length > 20) {
    throw Object.assign(new Error('too many animals'), { code: 'VALIDATION_ERROR' });
  }
  const requestedCover = payload.coverPath == null || String(payload.coverPath).trim() === ''
    ? null
    : String(payload.coverPath).trim();
  return { title, body, journalDate, animalIds, requestedCover };
}

function recordValues(type: string, payload: Record<string, unknown>) {
  if (!RECORD_TYPES.has(type)) {
    throw Object.assign(new Error('invalid record type'), { code: 'VALIDATION_ERROR' });
  }
  const rawValue = payload.value;
  const value = rawValue == null || rawValue === '' ? null : Number(rawValue);
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1_000_000)) {
    throw Object.assign(new Error('invalid record value'), { code: 'VALIDATION_ERROR' });
  }
  if ((type === 'weight' || type === 'length') && value === null) {
    throw Object.assign(new Error('measurement value required'), { code: 'VALIDATION_ERROR' });
  }
  const unit = payload.unit == null || String(payload.unit).trim() === ''
    ? null
    : String(payload.unit).trim().slice(0, 16);
  const note = payload.note == null || String(payload.note).trim() === ''
    ? null
    : String(payload.note).trim().slice(0, 1000);
  const occurredAt = new Date(String(payload.occurredAt ?? ''));
  if (Number.isNaN(occurredAt.getTime())) {
    throw Object.assign(new Error('invalid record time'), { code: 'VALIDATION_ERROR' });
  }
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
    throw Object.assign(new Error('record time cannot be in the future'), { code: 'VALIDATION_ERROR' });
  }
  return { value, unit, note, occurredAt, metadata: recordMetadata(payload.metadata) };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await verifyAccessTokenFromRequest(request);
  if (!auth) {
    return json({ ok: false, code: 'UNAUTHENTICATED', message: 'Sign in required' });
  }
  const userId = auth.profileId;

  let envelope: Envelope;
  try {
    envelope = (await request.json()) as Envelope;
  } catch {
    return json({ ok: false, code: 'VALIDATION_ERROR', message: 'invalid body' });
  }
  if (!envelope?.commandId || !envelope?.type || !envelope?.payload) {
    return json({ ok: false, code: 'VALIDATION_ERROR', message: 'invalid envelope' });
  }

  const requestHash = await sha256(stable({ type: envelope.type, householdId: envelope.householdId, baseRevision: envelope.baseRevision, payload: envelope.payload }));

  try {
    const result = await sql.begin(async (tx: any) => {
      const [session] = await tx`
        select s.revoked_at, s.expires_at, p.status
        from public.auth_sessions s
        join public.profiles p on p.id = s.profile_id
        where s.id = ${auth.sessionId} and s.profile_id = ${userId}
      `;
      if (
        !session ||
        session.revoked_at !== null ||
        new Date(session.expires_at).getTime() <= Date.now() ||
        session.status !== 'active'
      ) {
        throw Object.assign(new Error('session is not active'), { code: 'UNAUTHENTICATED' });
      }

      const [replay] = await tx`
        select response, request_hash from commands
        where command_id = ${envelope.commandId} and expires_at > now()
      `;
      if (replay) {
        if (replay.request_hash !== requestHash) {
          throw Object.assign(new Error('idempotency mismatch'), { code: 'IDEMPOTENCY_MISMATCH' });
        }
        return replay.response;
      }

      let response: any;
      const householdId = envelope.householdId;
      const payload = envelope.payload;

      switch (envelope.type) {
        case 'household.create': {
          const name = String(payload.name ?? '').trim();
          const timezone = String(payload.timezone ?? 'Asia/Taipei');
          if (!name) throw Object.assign(new Error('name required'), { code: 'VALIDATION_ERROR' });
          const id = crypto.randomUUID();
          await tx`insert into households (id, name, owner_id, timezone) values (${id}, ${name}, ${userId}, ${timezone})`;
          await tx`insert into household_members (household_id, user_id, role) values (${id}, ${userId}, 'owner')`;
          await tx`update profiles set default_household_id = ${id}, updated_at = now() where id = ${userId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${id}, ${userId}, 'household.create', 'household', ${id}, ${tx.json({ name, timezone })}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { householdId: id }, 0);
          break;
        }

        case 'member.invite': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const inviteId = crypto.randomUUID();
          const secretBytes = new Uint8Array(32);
          crypto.getRandomValues(secretBytes);
          const secret = b64url(secretBytes);
          const secretHash = await sha256(secret);
          const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
          const inviteType = payload.inviteType === 'uid' ? 'uid' : 'link';
          const invitedUserId = inviteType === 'uid' ? String(payload.invitedUserId ?? '') : null;
          const invitedLabel = payload.invitedLabel == null ? null : String(payload.invitedLabel);
          if (inviteType === 'uid') {
            if (!invitedUserId) throw Object.assign(new Error('invitedUserId required'), { code: 'VALIDATION_ERROR' });
            const [invited] = await tx`
              select 1 from profiles where id = ${invitedUserId} and status = 'active' and deleted_at is null
            `;
            if (!invited) throw Object.assign(new Error('invited user not found'), { code: 'NOT_FOUND' });
          }
          await tx`insert into invites (id, household_id, role, created_by, secret_hash, expires_at, invite_type, invited_user_id, invited_label)
                   values (${inviteId}, ${householdId}, 'caretaker', ${userId}, ${secretHash}, ${expiresAt}, ${inviteType}, ${invitedUserId}, ${invitedLabel})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                   values (${householdId}, ${userId}, 'member.invite', 'invite', ${inviteId}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, {
            token: `${inviteId}.${secret}`,
            inviteId,
            expiresAt,
            inviteType,
            invitedUserId,
          });
          break;
        }

        case 'member.accept': {
          const token = String(payload.token ?? '');
          const [inviteId, secret] = token.split('.');
          if (!inviteId || !secret) throw Object.assign(new Error('invalid token'), { code: 'VALIDATION_ERROR' });
          const [invite] = await tx`select * from invites where id = ${inviteId} for update`;
          if (!invite) throw Object.assign(new Error('invite not found'), { code: 'NOT_FOUND' });
          if (invite.status !== 'active' || new Date(invite.expires_at).getTime() < Date.now()) {
            throw Object.assign(new Error('invite expired'), { code: 'INVITE_EXPIRED' });
          }
          const hash = await sha256(secret);
          if (hash !== invite.secret_hash) throw Object.assign(new Error('invite not found'), { code: 'NOT_FOUND' });
          if (invite.invite_type === 'uid' && invite.invited_user_id !== userId) {
            throw Object.assign(new Error('this invite belongs to another user'), { code: 'FORBIDDEN' });
          }
          const [existing] = await tx`select 1 from household_members where household_id = ${invite.household_id} and user_id = ${userId}`;
          if (!existing) {
            await tx`insert into household_members (household_id, user_id, role, invited_by)
                     values (${invite.household_id}, ${userId}, 'caretaker', ${invite.created_by})`;
            await tx`update households set member_count = member_count + 1, updated_at = now() where id = ${invite.household_id}`;
            await tx`update invites set used_count = used_count + 1, status = case when used_count + 1 >= max_uses then 'used' else 'active' end,
                     accepted_by = array_append(accepted_by, ${userId}) where id = ${inviteId}`;
            await tx`update profiles set default_household_id = ${invite.household_id}, updated_at = now() where id = ${userId}`;
            await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                     values (${invite.household_id}, ${userId}, 'member.accept', 'member', ${userId}, ${envelope.commandId}, 'liff')`;
          }
          response = ok(envelope.commandId, { householdId: invite.household_id, alreadyMember: !!existing });
          break;
        }

        case 'member.updateRole': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await tx`select id from households where id = ${householdId} for update`;
          const actor = await requireMember(tx, householdId, userId);
          if (actor.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const targetUserId = String(payload.userId ?? '');
          const role = payload.role === 'owner' ? 'owner' : 'caretaker';
          const [target] = await tx`
            select role from household_members where household_id = ${householdId} and user_id = ${targetUserId}
          `;
          if (!target) throw Object.assign(new Error('member not found'), { code: 'NOT_FOUND' });
          if (target.role === 'owner' && role === 'caretaker') {
            const [owners] = await tx`
              select count(*)::int as count from household_members
              where household_id = ${householdId} and role = 'owner'
            `;
            if (owners.count <= 1) throw Object.assign(new Error('last owner'), { code: 'LAST_OWNER' });
          }
          await tx`
            update household_members set role = ${role}
            where household_id = ${householdId} and user_id = ${targetUserId}
          `;
          await tx`
            update households h set
              owner_count = (select count(*) from household_members m where m.household_id = h.id and m.role = 'owner'),
              member_count = (select count(*) from household_members m where m.household_id = h.id),
              owner_id = coalesce(
                (select m.user_id from household_members m
                 where m.household_id = h.id and m.role = 'owner'
                 order by m.joined_at limit 1),
                h.owner_id
              ),
              updated_at = now()
            where h.id = ${householdId}
          `;
          await tx`
            insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
            values (${householdId}, ${userId}, 'member.updateRole', 'member', ${targetUserId}, ${tx.json({ role })}, ${envelope.commandId}, 'liff')
          `;
          response = ok(envelope.commandId, { userId: targetUserId, role });
          break;
        }

        case 'member.remove': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await tx`select id from households where id = ${householdId} for update`;
          const actor = await requireMember(tx, householdId, userId);
          if (actor.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const targetUserId = String(payload.userId ?? '');
          if (targetUserId === userId) {
            throw Object.assign(new Error('use member.leave for yourself'), { code: 'VALIDATION_ERROR' });
          }
          const [target] = await tx`
            select role from household_members where household_id = ${householdId} and user_id = ${targetUserId}
          `;
          if (!target) throw Object.assign(new Error('member not found'), { code: 'NOT_FOUND' });
          if (target.role === 'owner') {
            const [owners] = await tx`
              select count(*)::int as count from household_members
              where household_id = ${householdId} and role = 'owner'
            `;
            if (owners.count <= 1) throw Object.assign(new Error('last owner'), { code: 'LAST_OWNER' });
          }
          await tx`delete from household_members where household_id = ${householdId} and user_id = ${targetUserId}`;
          await tx`
            update households h set
              owner_count = (select count(*) from household_members m where m.household_id = h.id and m.role = 'owner'),
              member_count = (select count(*) from household_members m where m.household_id = h.id),
              owner_id = coalesce(
                (select m.user_id from household_members m
                 where m.household_id = h.id and m.role = 'owner'
                 order by m.joined_at limit 1),
                h.owner_id
              ),
              updated_at = now()
            where h.id = ${householdId}
          `;
          await tx`
            update profiles set default_household_id = null, updated_at = now()
            where id = ${targetUserId} and default_household_id = ${householdId}
          `;
          await tx`
            insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
            values (${householdId}, ${userId}, 'member.remove', 'member', ${targetUserId}, ${envelope.commandId}, 'liff')
          `;
          response = ok(envelope.commandId, { removed: targetUserId });
          break;
        }

        case 'member.leave': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await tx`select id from households where id = ${householdId} for update`;
          const member = await requireMember(tx, householdId, userId);
          if (member.role === 'owner') {
            const [owners] = await tx`
              select count(*)::int as count from household_members
              where household_id = ${householdId} and role = 'owner'
            `;
            if (owners.count <= 1) throw Object.assign(new Error('last owner'), { code: 'LAST_OWNER' });
          }
          await tx`delete from household_members where household_id = ${householdId} and user_id = ${userId}`;
          await tx`
            update households h set
              owner_count = (select count(*) from household_members m where m.household_id = h.id and m.role = 'owner'),
              member_count = (select count(*) from household_members m where m.household_id = h.id),
              owner_id = coalesce(
                (select m.user_id from household_members m
                 where m.household_id = h.id and m.role = 'owner'
                 order by m.joined_at limit 1),
                h.owner_id
              ),
              updated_at = now()
            where h.id = ${householdId}
          `;
          await tx`
            update profiles set default_household_id = null, updated_at = now()
            where id = ${userId} and default_household_id = ${householdId}
          `;
          await tx`
            insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
            values (${householdId}, ${userId}, 'member.leave', 'member', ${userId}, ${envelope.commandId}, 'liff')
          `;
          response = ok(envelope.commandId, { left: householdId });
          break;
        }

        case 'animal.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const id = crypto.randomUUID();
          const avatarPattern = String(payload.avatarPattern ?? 'solid');
          if (!['solid', 'spots', 'stripes', 'gradient'].includes(avatarPattern)) {
            throw Object.assign(new Error('invalid avatar pattern'), { code: 'VALIDATION_ERROR' });
          }
          await tx`insert into animals (id, household_id, name, species, species_label, morph, sex, birth_date, adoption_date, avatar_color, avatar_pattern, notes, created_by, updated_by)
                   values (${id}, ${householdId}, ${String(payload.name)}, ${String(payload.species)},
                   ${payload.speciesLabel ?? null}, ${payload.morph ?? null}, ${payload.sex ?? 'unknown'},
                   ${payload.birthDate ?? null}, ${payload.adoptionDate ?? null},
                   ${payload.avatarColor ?? '#7C9A76'}, ${avatarPattern},
                   ${payload.notes ?? null}, ${userId}, ${userId})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'animal.create', 'animal', ${id}, ${tx.json(payload)}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { animalId: id }, 0);
          break;
        }

        case 'animal.update': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const animalId = String(payload.animalId ?? '');
          const [animal] = await tx`
            select * from animals
            where id = ${animalId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!animal) throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
          if (animal.status === 'memorial' || animal.status === 'archived') {
            throw Object.assign(new Error('animal is not editable'), { code: 'INVALID_STATE' });
          }
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== animal.revision) {
            throw Object.assign(new Error('revision conflict'), {
              code: 'CONFLICT',
              current: animal,
              currentRevision: animal.revision,
            });
          }

          const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
          const changed: string[] = [];
          let name = animal.name as string;
          let species = animal.species as string;
          let speciesLabel = animal.species_label as string | null;
          let morph = animal.morph as string | null;
          let sex = animal.sex as string;
          let birthDate = animal.birth_date as string | null;
          let adoptionDate = animal.adoption_date as string | null;
          let avatarColor = animal.avatar_color as string;
          let avatarPattern = animal.avatar_pattern as string;
          let notes = animal.notes as string | null;

          if (has('name')) {
            name = String(payload.name ?? '').trim();
            if (!name || name.length > 40) throw Object.assign(new Error('name must be 1-40 characters'), { code: 'VALIDATION_ERROR' });
            changed.push('name');
          }
          if (has('species')) {
            species = String(payload.species ?? '').trim();
            const [catalog] = await tx`select name from species where id = ${species} and active = true`;
            if (!catalog) throw Object.assign(new Error('unknown species'), { code: 'VALIDATION_ERROR' });
            if (!has('speciesLabel')) speciesLabel = catalog.name;
            changed.push('species');
          }
          if (has('speciesLabel')) {
            speciesLabel = payload.speciesLabel == null ? null : String(payload.speciesLabel).trim().slice(0, 60);
            changed.push('speciesLabel');
          }
          if (has('morph')) {
            morph = payload.morph == null || String(payload.morph).trim() === '' ? null : String(payload.morph).trim().slice(0, 60);
            changed.push('morph');
          }
          if (has('sex')) {
            sex = String(payload.sex ?? 'unknown');
            if (!['male', 'female', 'unknown'].includes(sex)) throw Object.assign(new Error('invalid sex'), { code: 'VALIDATION_ERROR' });
            changed.push('sex');
          }
          if (has('birthDate')) {
            birthDate = payload.birthDate == null || String(payload.birthDate).trim() === '' ? null : String(payload.birthDate);
            if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw Object.assign(new Error('invalid birth date'), { code: 'VALIDATION_ERROR' });
            changed.push('birthDate');
          }
          if (has('adoptionDate')) {
            adoptionDate = payload.adoptionDate == null || String(payload.adoptionDate).trim() === '' ? null : String(payload.adoptionDate);
            if (adoptionDate && !/^\d{4}-\d{2}-\d{2}$/.test(adoptionDate)) throw Object.assign(new Error('invalid adoption date'), { code: 'VALIDATION_ERROR' });
            changed.push('adoptionDate');
          }
          if (has('avatarColor')) {
            avatarColor = String(payload.avatarColor ?? '').trim();
            if (!/^#[0-9A-Fa-f]{6}$/.test(avatarColor)) throw Object.assign(new Error('invalid avatar color'), { code: 'VALIDATION_ERROR' });
            changed.push('avatarColor');
          }
          if (has('avatarPattern')) {
            avatarPattern = String(payload.avatarPattern ?? 'solid');
            if (!['solid', 'spots', 'stripes', 'gradient'].includes(avatarPattern)) throw Object.assign(new Error('invalid avatar pattern'), { code: 'VALIDATION_ERROR' });
            changed.push('avatarPattern');
          }
          if (has('notes')) {
            notes = payload.notes == null || String(payload.notes).trim() === '' ? null : String(payload.notes).trim().slice(0, 2000);
            changed.push('notes');
          }
          if (!changed.length) throw Object.assign(new Error('no fields to update'), { code: 'VALIDATION_ERROR' });

          await tx`
            update animals set
              name = ${name},
              species = ${species},
              species_label = ${speciesLabel},
              morph = ${morph},
              sex = ${sex},
              birth_date = ${birthDate},
              adoption_date = ${adoptionDate},
              avatar_color = ${avatarColor},
              avatar_pattern = ${avatarPattern},
              notes = ${notes},
              revision = revision + 1,
              last_changed_fields = ${changed},
              updated_by = ${userId},
              updated_at = now()
            where id = ${animalId}
          `;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'animal.update', 'animal', ${animalId}, ${tx.json(payload)}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { animalId, revision: animal.revision + 1 }, animal.revision + 1);
          break;
        }

        case 'animal.archive': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const animalId = String(payload.animalId ?? '');
          const [animal] = await tx`
            select id, revision, status from animals
            where id = ${animalId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!animal) throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
          if (animal.status === 'memorial') throw Object.assign(new Error('memorial animal cannot be archived'), { code: 'INVALID_STATE' });
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== animal.revision) {
            throw Object.assign(new Error('revision conflict'), { code: 'CONFLICT', currentRevision: animal.revision });
          }
          await tx`update animals set status = 'archived', revision = revision + 1, last_changed_fields = array['status'],
                     updated_by = ${userId}, updated_at = now() where id = ${animalId}`;
          await tx`update reminders set enabled = false, updated_at = now() where animal_id = ${animalId} and household_id = ${householdId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                   values (${householdId}, ${userId}, 'animal.archive', 'animal', ${animalId}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { animalId, revision: animal.revision + 1 }, animal.revision + 1);
          break;
        }

        case 'animal.delete': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const animalId = String(payload.animalId ?? '');
          const [animal] = await tx`
            select id, revision, status from animals
            where id = ${animalId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!animal) throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
          if (animal.status === 'memorial') throw Object.assign(new Error('memorial animal cannot be deleted'), { code: 'INVALID_STATE' });
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== animal.revision) {
            throw Object.assign(new Error('revision conflict'), { code: 'CONFLICT', currentRevision: animal.revision });
          }
          await tx`update animals set deleted_at = now(), revision = revision + 1, last_changed_fields = array['deletedAt'],
                     updated_by = ${userId}, updated_at = now() where id = ${animalId}`;
          await tx`update reminders set enabled = false, deleted_at = now(), updated_at = now()
                   where animal_id = ${animalId} and household_id = ${householdId} and deleted_at is null`;
          await tx`update records set deleted_at = now(), updated_at = now()
                   where animal_id = ${animalId} and household_id = ${householdId} and deleted_at is null`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                   values (${householdId}, ${userId}, 'animal.delete', 'animal', ${animalId}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { animalId, revision: animal.revision + 1 }, animal.revision + 1);
          break;
        }

        case 'lineage.add': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const parentId = String(payload.parentId ?? '');
          const childId = String(payload.childId ?? '');
          if (!parentId || !childId || parentId === childId) {
            throw Object.assign(new Error('parent and child must differ'), { code: 'VALIDATION_ERROR' });
          }
          const animals = await tx`
            select id, household_id, deleted_at from animals
            where id = any(${[parentId, childId]}::uuid[])
            order by id
            for update
          `;
          if (animals.length !== 2) throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
          if (animals.some((animal: any) => animal.household_id !== householdId || animal.deleted_at !== null)) {
            throw Object.assign(new Error('both animals must belong to this household'), { code: 'FORBIDDEN' });
          }
          const [duplicate] = await tx`
            select id from animal_lineage where parent_id = ${parentId} and child_id = ${childId}
          `;
          if (duplicate) throw Object.assign(new Error('lineage edge already exists'), { code: 'CONFLICT' });
          const [parentCount] = await tx`
            select count(*)::int as count from animal_lineage where child_id = ${childId}
          `;
          if (parentCount.count >= 2) {
            throw Object.assign(new Error('a resident can have at most two parents'), { code: 'LINEAGE_LIMIT' });
          }
          const [cycle] = await tx`
            with recursive ancestors as (
              select parent_id from animal_lineage where child_id = ${parentId}
              union
              select l.parent_id from animal_lineage l join ancestors a on l.child_id = a.parent_id
            )
            select 1 from ancestors where parent_id = ${childId} limit 1
          `;
          if (cycle) throw Object.assign(new Error('lineage cycle'), { code: 'LINEAGE_CYCLE' });
          const edgeId = crypto.randomUUID();
          await tx`insert into animal_lineage (id, parent_id, child_id, created_by)
                   values (${edgeId}, ${parentId}, ${childId}, ${userId})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'lineage.add', 'animal_lineage', ${edgeId},
                   ${tx.json({ parentId, childId })}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { edgeId, parentId, childId });
          break;
        }

        case 'lineage.remove': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const edgeId = String(payload.edgeId ?? '');
          const [edge] = await tx`
            select l.id, l.parent_id, l.child_id, p.household_id as parent_household, c.household_id as child_household
            from animal_lineage l
            join animals p on p.id = l.parent_id
            join animals c on c.id = l.child_id
            where l.id = ${edgeId}
            for update of l
          `;
          if (!edge) throw Object.assign(new Error('lineage edge not found'), { code: 'NOT_FOUND' });
          if (edge.parent_household !== householdId && edge.child_household !== householdId) {
            throw Object.assign(new Error('lineage edge not accessible'), { code: 'FORBIDDEN' });
          }
          await tx`delete from animal_lineage where id = ${edgeId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'lineage.remove', 'animal_lineage', ${edgeId},
                   ${tx.json({ parentId: edge.parent_id, childId: edge.child_id })}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { edgeId });
          break;
        }

        case 'animal.memorialize': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const animalId = String(payload.animalId ?? '');
          const [animal] = await tx`
            select id, revision, status from animals
            where id = ${animalId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!animal) throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
          if (animal.status === 'memorial') {
            response = ok(envelope.commandId, { animalId, alreadyMemorial: true });
            break;
          }
          if (animal.status !== 'active') {
            throw Object.assign(new Error('only active residents can be memorialized'), { code: 'INVALID_STATE' });
          }
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== animal.revision) {
            throw Object.assign(new Error('revision conflict'), {
              code: 'CONFLICT',
              currentRevision: animal.revision,
            });
          }
          const note = payload.note == null ? null : String(payload.note).trim().slice(0, 2000) || null;
          await tx`update animals set
                     status = 'memorial',
                     memorial_at = now(),
                     memorial_note = ${note},
                     revision = revision + 1,
                     last_changed_fields = array['status','memorialAt','memorialNote'],
                     updated_by = ${userId},
                     updated_at = now()
                   where id = ${animalId}`;
          await tx`update reminders set enabled = false, updated_at = now()
                   where animal_id = ${animalId} and household_id = ${householdId} and deleted_at is null`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'animal.memorialize', 'animal', ${animalId},
                   ${tx.json({ note })}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { animalId, revision: animal.revision + 1 }, animal.revision + 1);
          break;
        }

        case 'transfer.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const transferType = String(payload.transferType ?? '');
          if (transferType !== 'own' && transferType !== 'other') {
            throw Object.assign(new Error('invalid transfer type'), { code: 'VALIDATION_ERROR' });
          }
          const rawIds = Array.isArray(payload.animalIds) ? payload.animalIds.map(String) : [];
          const animalIds = [...new Set(rawIds)];
          if (!animalIds.length || animalIds.length > 20) {
            throw Object.assign(new Error('select 1-20 residents'), { code: 'VALIDATION_ERROR' });
          }
          await tx`update animal_transfers set status = 'expired', responded_at = now()
                   where status = 'pending' and expires_at <= now()`;
          const [overlap] = await tx`
            select id from animal_transfers
            where status = 'pending' and animal_ids && ${animalIds}::uuid[] limit 1
          `;
          if (overlap) throw Object.assign(new Error('resident already has a pending transfer'), { code: 'TRANSFER_PENDING' });
          const animals = await tx`
            select id, revision, status, household_id from animals
            where id = any(${animalIds}::uuid[]) and deleted_at is null
            order by id for update
          `;
          if (animals.length !== animalIds.length) {
            throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
          }
          if (animals.some((animal: any) => animal.household_id !== householdId)) {
            throw Object.assign(new Error('animal does not belong to this household'), { code: 'FORBIDDEN' });
          }
          if (animals.some((animal: any) => animal.status !== 'active')) {
            throw Object.assign(new Error('only active residents can be transferred'), { code: 'INVALID_STATE' });
          }

          const transferId = crypto.randomUUID();
          if (transferType === 'own') {
            const targetHouseholdId = String(payload.targetHouseholdId ?? '');
            if (!targetHouseholdId || targetHouseholdId === householdId) {
              throw Object.assign(new Error('choose a different target household'), { code: 'VALIDATION_ERROR' });
            }
            const [target] = await tx`
              select h.id from households h
              join household_members m on m.household_id = h.id
              where h.id = ${targetHouseholdId} and h.deleted_at is null
                and m.user_id = ${userId} and m.role = 'owner'
              for update of h
            `;
            if (!target) throw Object.assign(new Error('target household not owned by you'), { code: 'FORBIDDEN' });
            await tx`insert into animal_transfers
                     (id, source_household_id, target_household_id, animal_ids, transfer_type, status, created_by, responded_at, expires_at)
                     values (${transferId}, ${householdId}, ${targetHouseholdId}, ${animalIds}, 'own', 'accepted',
                     ${userId}, now(), now())`;
            await tx`update animals set household_id = ${targetHouseholdId}, revision = revision + 1,
                       last_changed_fields = array['householdId'], updated_by = ${userId}, updated_at = now()
                     where id = any(${animalIds}::uuid[])`;
            await tx`update records set household_id = ${targetHouseholdId}, updated_by = ${userId}, updated_at = now()
                     where animal_id = any(${animalIds}::uuid[]) and household_id = ${householdId}`;
            await tx`update reminders set household_id = ${targetHouseholdId}, updated_by = ${userId}, updated_at = now()
                     where animal_id = any(${animalIds}::uuid[]) and household_id = ${householdId}`;
            await tx`update task_completions set household_id = ${targetHouseholdId}
                     where animal_id = any(${animalIds}::uuid[]) and household_id = ${householdId}`;
            await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                     values (${householdId}, ${userId}, 'transfer.own', 'animal_transfer', ${transferId},
                     ${tx.json({ animalIds, targetHouseholdId })}, ${envelope.commandId}, 'liff')`;
            await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                     values (${targetHouseholdId}, ${userId}, 'transfer.receive', 'animal_transfer', ${transferId},
                     ${tx.json({ animalIds, sourceHouseholdId: householdId })}, ${envelope.commandId}, 'liff')`;
            response = ok(envelope.commandId, {
              transferId,
              status: 'accepted',
              movedCount: animalIds.length,
            });
            break;
          }

          const targetUserId = String(payload.targetUserId ?? '');
          if (!targetUserId || targetUserId === userId) {
            throw Object.assign(new Error('choose another user'), { code: 'VALIDATION_ERROR' });
          }
          const [targetProfile] = await tx`
            select id from profiles where id = ${targetUserId} and deleted_at is null
          `;
          if (!targetProfile) throw Object.assign(new Error('target user not found'), { code: 'NOT_FOUND' });
          const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
          const note = payload.note == null ? null : String(payload.note).trim().slice(0, 500) || null;
          await tx`insert into animal_transfers
                   (id, source_household_id, target_user_id, animal_ids, transfer_type, status, note, created_by, expires_at)
                   values (${transferId}, ${householdId}, ${targetUserId}, ${animalIds}, 'other', 'pending',
                   ${note}, ${userId}, ${expiresAt})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'transfer.create', 'animal_transfer', ${transferId},
                   ${tx.json({ animalIds, targetUserId })}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, {
            transferId,
            status: 'pending',
            expiresAt,
          });
          break;
        }

        case 'transfer.accept': {
          const transferId = String(payload.transferId ?? '');
          const targetHouseholdId = String(payload.targetHouseholdId ?? '');
          if (!targetHouseholdId) throw Object.assign(new Error('target household required'), { code: 'VALIDATION_ERROR' });
          const [transfer] = await tx`
            select * from animal_transfers where id = ${transferId} for update
          `;
          if (!transfer) throw Object.assign(new Error('transfer not found'), { code: 'NOT_FOUND' });
          if (transfer.target_user_id !== userId) {
            throw Object.assign(new Error('this transfer is not for you'), { code: 'FORBIDDEN' });
          }
          if (transfer.status !== 'pending') {
            throw Object.assign(new Error('transfer is no longer pending'), { code: 'INVALID_STATE' });
          }
          if (targetHouseholdId === transfer.source_household_id) {
            throw Object.assign(new Error('target household must be different'), { code: 'VALIDATION_ERROR' });
          }
          if (new Date(transfer.expires_at).getTime() <= Date.now()) {
            await tx`update animal_transfers set status = 'expired', responded_at = now() where id = ${transferId}`;
            throw Object.assign(new Error('transfer expired'), { code: 'TRANSFER_EXPIRED' });
          }
          const [target] = await tx`
            select h.id from households h
            join household_members m on m.household_id = h.id
            where h.id = ${targetHouseholdId} and h.deleted_at is null
              and m.user_id = ${userId} and m.role = 'owner'
            for update of h
          `;
          if (!target) throw Object.assign(new Error('target household not owned by you'), { code: 'FORBIDDEN' });
          const animalIds = transfer.animal_ids as string[];
          const animals = await tx`
            select id, status, household_id from animals
            where id = any(${animalIds}::uuid[]) and deleted_at is null
            order by id for update
          `;
          if (animals.length !== animalIds.length) {
            throw Object.assign(new Error('resident no longer available'), { code: 'NOT_FOUND' });
          }
          if (animals.some((animal: any) => animal.household_id !== transfer.source_household_id || animal.status !== 'active')) {
            throw Object.assign(new Error('resident is no longer transferable'), { code: 'INVALID_STATE' });
          }
          await tx`update animals set household_id = ${targetHouseholdId}, revision = revision + 1,
                     last_changed_fields = array['householdId'], updated_by = ${userId}, updated_at = now()
                   where id = any(${animalIds}::uuid[])`;
          await tx`update records set household_id = ${targetHouseholdId}, updated_by = ${userId}, updated_at = now()
                   where animal_id = any(${animalIds}::uuid[]) and household_id = ${transfer.source_household_id}`;
          await tx`update reminders set household_id = ${targetHouseholdId}, updated_by = ${userId}, updated_at = now()
                   where animal_id = any(${animalIds}::uuid[]) and household_id = ${transfer.source_household_id}`;
          await tx`update task_completions set household_id = ${targetHouseholdId}
                   where animal_id = any(${animalIds}::uuid[]) and household_id = ${transfer.source_household_id}`;
          await tx`update animal_transfers set status = 'accepted', target_household_id = ${targetHouseholdId},
                     responded_at = now() where id = ${transferId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${transfer.source_household_id}, ${transfer.created_by}, 'transfer.accepted', 'animal_transfer', ${transferId},
                   ${tx.json({ targetHouseholdId, animalIds })}, ${envelope.commandId}, 'liff')`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${targetHouseholdId}, ${userId}, 'transfer.receive', 'animal_transfer', ${transferId},
                   ${tx.json({ sourceHouseholdId: transfer.source_household_id, animalIds })}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, {
            transferId,
            status: 'accepted',
            movedCount: animalIds.length,
          });
          break;
        }

        case 'transfer.decline': {
          const transferId = String(payload.transferId ?? '');
          const [transfer] = await tx`
            select * from animal_transfers where id = ${transferId} for update
          `;
          if (!transfer) throw Object.assign(new Error('transfer not found'), { code: 'NOT_FOUND' });
          if (transfer.target_user_id !== userId) {
            throw Object.assign(new Error('this transfer is not for you'), { code: 'FORBIDDEN' });
          }
          if (transfer.status !== 'pending') {
            throw Object.assign(new Error('transfer is no longer pending'), { code: 'INVALID_STATE' });
          }
          await tx`update animal_transfers set status = 'declined', responded_at = now() where id = ${transferId}`;
          response = ok(envelope.commandId, { transferId, status: 'declined' });
          break;
        }

        case 'transfer.cancel': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          if (member.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'FORBIDDEN' });
          const transferId = String(payload.transferId ?? '');
          const [transfer] = await tx`
            select * from animal_transfers where id = ${transferId} for update
          `;
          if (!transfer) throw Object.assign(new Error('transfer not found'), { code: 'NOT_FOUND' });
          if (transfer.source_household_id !== householdId) {
            throw Object.assign(new Error('transfer does not belong to this household'), { code: 'FORBIDDEN' });
          }
          if (transfer.status !== 'pending') {
            throw Object.assign(new Error('transfer is no longer pending'), { code: 'INVALID_STATE' });
          }
          await tx`update animal_transfers set status = 'cancelled', responded_at = now() where id = ${transferId}`;
          response = ok(envelope.commandId, { transferId, status: 'cancelled' });
          break;
        }

        case 'record.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const animalId = String(payload.animalId ?? '');
          const [animal] = await tx`select status from animals where id = ${animalId} and household_id = ${householdId} and deleted_at is null`;
          if (!animal) throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
          if (animal.status !== 'active') {
            throw Object.assign(new Error('animal is not accepting records'), { code: 'INVALID_STATE' });
          }
          const id = String(payload.recordId ?? crypto.randomUUID());
          const [existing] = await tx`select id from records where id = ${id}`;
          if (existing) {
            response = ok(envelope.commandId, { recordId: id, alreadyExists: true });
            break;
          }
          const type = String(payload.type ?? '');
          const values = recordValues(type, payload);
          await tx`insert into records (id, household_id, animal_id, type, occurred_at, value, unit, note, metadata, source, created_by, updated_by)
                   values (${id}, ${householdId}, ${animalId}, ${type}, ${values.occurredAt.toISOString()},
                   ${values.value}, ${values.unit}, ${values.note}, ${tx.json(values.metadata)}, 'ios', ${userId}, ${userId})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'record.create', 'record', ${id}, ${tx.json(payload)}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { recordId: id }, 0);
          break;
        }

        case 'record.update': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          const recordId = String(payload.recordId ?? '');
          const [record] = await tx`
            select * from records
            where id = ${recordId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!record) throw Object.assign(new Error('record not found'), { code: 'NOT_FOUND' });
          if (member.role !== 'owner' && record.created_by !== userId) {
            throw Object.assign(new Error('you can only edit your own records'), { code: 'FORBIDDEN' });
          }
          const [animal] = await tx`select status from animals where id = ${record.animal_id} and household_id = ${householdId}`;
          if (!animal || animal.status !== 'active') {
            throw Object.assign(new Error('records are read-only for this resident'), { code: 'INVALID_STATE' });
          }
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== record.revision) {
            throw Object.assign(new Error('revision conflict'), {
              code: 'CONFLICT',
              current: record,
              currentRevision: record.revision,
            });
          }
          const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
          const type = has('type') ? String(payload.type ?? '') : String(record.type);
          const values = recordValues(type, {
            ...record,
            ...payload,
            occurredAt: has('occurredAt') ? payload.occurredAt : record.occurred_at,
            metadata: has('metadata') ? payload.metadata : record.metadata,
          });
          const changed = ['type', 'occurredAt', 'value', 'unit', 'note', 'metadata']
            .filter((key) => has(key));
          if (!changed.length) throw Object.assign(new Error('no fields to update'), { code: 'VALIDATION_ERROR' });
          await tx`update records set
                     type = ${type},
                     occurred_at = ${values.occurredAt.toISOString()},
                     value = ${values.value},
                     unit = ${values.unit},
                     note = ${values.note},
                     metadata = ${tx.json(values.metadata)},
                     revision = revision + 1,
                     last_changed_fields = ${changed},
                     updated_by = ${userId},
                     updated_at = now()
                   where id = ${recordId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'record.update', 'record', ${recordId}, ${tx.json(payload)}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { recordId, revision: record.revision + 1 }, record.revision + 1);
          break;
        }

        case 'record.delete': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          const recordId = String(payload.recordId ?? '');
          const [record] = await tx`
            select * from records
            where id = ${recordId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!record) throw Object.assign(new Error('record not found'), { code: 'NOT_FOUND' });
          if (member.role !== 'owner' && record.created_by !== userId) {
            throw Object.assign(new Error('you can only delete your own records'), { code: 'FORBIDDEN' });
          }
          const [animal] = await tx`select status from animals where id = ${record.animal_id} and household_id = ${householdId}`;
          if (!animal || animal.status !== 'active') {
            throw Object.assign(new Error('records are read-only for this resident'), { code: 'INVALID_STATE' });
          }
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== record.revision) {
            throw Object.assign(new Error('revision conflict'), {
              code: 'CONFLICT',
              current: record,
              currentRevision: record.revision,
            });
          }
          await tx`update records set
                     deleted_at = now(),
                     revision = revision + 1,
                     last_changed_fields = array['deletedAt'],
                     updated_by = ${userId},
                     updated_at = now()
                   where id = ${recordId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                   values (${householdId}, ${userId}, 'record.delete', 'record', ${recordId}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { recordId, revision: record.revision + 1 }, record.revision + 1);
          break;
        }

        case 'reminder.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const animalId = String(payload.animalId ?? '');
          const [animal] = await tx`select status from animals where id = ${animalId} and household_id = ${householdId} and deleted_at is null`;
          if (!animal) throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
          if (animal.status !== 'active') {
            throw Object.assign(new Error('animal is not accepting reminders'), { code: 'INVALID_STATE' });
          }
          const id = crypto.randomUUID();
          await tx`insert into reminders (id, household_id, animal_id, title, type, schedule, timezone, enabled, next_due_at, created_by, updated_by)
                   values (${id}, ${householdId}, ${animalId}, ${String(payload.title)},
                   ${String(payload.type ?? 'feeding')}, ${tx.json(payload.schedule)}, ${String(payload.timezone ?? 'Asia/Taipei')},
                   ${payload.enabled ?? true}, now(), ${userId}, ${userId})`;
          response = ok(envelope.commandId, { reminderId: id }, 0);
          break;
        }

        case 'task.complete': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const reminderId = String(payload.reminderId);
          const dueDate = String(payload.dueDate);
          const [reminder] = await tx`select animal_id from reminders where id = ${reminderId} and household_id = ${householdId}`;
          if (!reminder) throw Object.assign(new Error('reminder not found'), { code: 'NOT_FOUND' });
          const completionId = await sha256(`${reminderId}:${dueDate}`);
          const [profile] = await tx`select display_name from profiles where id = ${userId}`;
          await tx`insert into task_completions (id, household_id, animal_id, reminder_id, due_date, completed_by, completed_by_name, source)
                   values (${completionId}, ${householdId}, ${reminder.animal_id}, ${reminderId}, ${dueDate}, ${userId}, ${profile?.display_name ?? null}, 'liff')
                   on conflict (id) do nothing`;
          const [completion] = await tx`select * from task_completions where id = ${completionId}`;
          response = ok(envelope.commandId, {
            completionId,
            completedBy: completion.completed_by,
            completedByName: completion.completed_by_name,
            alreadyCompleted: completion.completed_by !== userId,
          });
          break;
        }

        case 'journal.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const journalId = String(payload.journalId ?? crypto.randomUUID());
          const [existing] = await tx`
            select id from journal_entries
            where id = ${journalId} and household_id = ${householdId} and deleted_at is null
          `;
          if (existing) {
            response = ok(envelope.commandId, { journalId, alreadyExists: true });
            break;
          }
          const values = journalValues(payload);
          if (values.animalIds.length) {
            const animals = await tx`
              select id from animals
              where id = any(${values.animalIds}::uuid[]) and household_id = ${householdId}
                and deleted_at is null
            `;
            if (animals.length !== values.animalIds.length) {
              throw Object.assign(new Error('journal animal not found'), { code: 'NOT_FOUND' });
            }
          }
          const photoData = journalPhotos(payload.photos, householdId, journalId);
          const coverPath = values.requestedCover && photoData.photos.some((photo) => photo.path === values.requestedCover)
            ? values.requestedCover
            : photoData.coverPath;
          const visibility = ['household', 'link', 'public'].includes(String(payload.visibility))
            ? String(payload.visibility)
            : 'household';
          const shareToken = visibility === 'household' ? null : crypto.randomUUID();
          const publishedAt = visibility === 'public' ? new Date().toISOString() : null;
          await tx`insert into journal_entries
                   (id, household_id, title, body, journal_date, animal_ids, photos, cover_path,
                    visibility, share_token, published_at, revision, created_by, updated_by)
                   values (${journalId}, ${householdId}, ${values.title}, ${values.body}, ${values.journalDate},
                   ${values.animalIds}, ${tx.json(photoData.photos)}, ${coverPath},
                   ${visibility}, ${shareToken}, ${publishedAt}, 0, ${userId}, ${userId})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'journal.create', 'journal_entry', ${journalId},
                   ${tx.json({ title: values.title, photos: photoData.photos.length, visibility })}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, { journalId, visibility, shareToken }, 0);
          break;
        }

        case 'journal.update': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          const journalId = String(payload.journalId ?? '');
          const [entry] = await tx`
            select * from journal_entries
            where id = ${journalId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!entry) throw Object.assign(new Error('journal not found'), { code: 'NOT_FOUND' });
          if (member.role !== 'owner' && entry.created_by !== userId) {
            throw Object.assign(new Error('you can only edit your own journal'), { code: 'FORBIDDEN' });
          }
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== entry.revision) {
            throw Object.assign(new Error('revision conflict'), {
              code: 'CONFLICT',
              current: entry,
              currentRevision: entry.revision,
            });
          }
          const values = journalValues({ ...entry, ...payload });
          if (values.animalIds.length) {
            const animals = await tx`
              select id from animals
              where id = any(${values.animalIds}::uuid[]) and household_id = ${householdId}
                and deleted_at is null
            `;
            if (animals.length !== values.animalIds.length) {
              throw Object.assign(new Error('journal animal not found'), { code: 'NOT_FOUND' });
            }
          }
          const photoData = journalPhotos(payload.photos ?? entry.photos, householdId, journalId);
          const coverPath = values.requestedCover && photoData.photos.some((photo) => photo.path === values.requestedCover)
            ? values.requestedCover
            : photoData.coverPath;
          const visibility = payload.visibility != null
            ? (['household', 'link', 'public'].includes(String(payload.visibility))
              ? String(payload.visibility)
              : 'household')
            : (entry.visibility ?? 'household');
          const shareToken = visibility === 'household'
            ? null
            : (entry.share_token ?? crypto.randomUUID());
          const publishedAt = visibility === 'public'
            ? (entry.published_at ?? new Date().toISOString())
            : null;
          await tx`update journal_entries set
                     title = ${values.title},
                     body = ${values.body},
                     journal_date = ${values.journalDate},
                     animal_ids = ${values.animalIds},
                     photos = ${tx.json(photoData.photos)},
                     cover_path = ${coverPath},
                     visibility = ${visibility},
                     share_token = ${shareToken},
                     published_at = ${publishedAt},
                     revision = revision + 1,
                     last_changed_fields = array['title','body','journalDate','animalIds','photos','coverPath'],
                     updated_by = ${userId},
                     updated_at = now()
                   where id = ${journalId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'journal.update', 'journal_entry', ${journalId},
                   ${tx.json({ title: values.title, photos: photoData.photos.length })}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, {
            journalId,
            revision: entry.revision + 1,
            visibility,
            shareToken,
          }, entry.revision + 1);
          break;
        }

        case 'journal.delete': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          const journalId = String(payload.journalId ?? '');
          const [entry] = await tx`
            select * from journal_entries
            where id = ${journalId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!entry) throw Object.assign(new Error('journal not found'), { code: 'NOT_FOUND' });
          if (member.role !== 'owner' && entry.created_by !== userId) {
            throw Object.assign(new Error('you can only delete your own journal'), { code: 'FORBIDDEN' });
          }
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== entry.revision) {
            throw Object.assign(new Error('revision conflict'), {
              code: 'CONFLICT',
              current: entry,
              currentRevision: entry.revision,
            });
          }
          await tx`update journal_entries set
                     deleted_at = now(), revision = revision + 1,
                     last_changed_fields = array['deletedAt'], updated_by = ${userId}, updated_at = now()
                   where id = ${journalId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                   values (${householdId}, ${userId}, 'journal.delete', 'journal_entry', ${journalId}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, { journalId, revision: entry.revision + 1 }, entry.revision + 1);
          break;
        }

        case 'proposal.create': {
          const title = String(payload.title ?? '').trim();
          if (!title || title.length > 80) {
            throw Object.assign(new Error('proposal title must be 1-80 characters'), { code: 'VALIDATION_ERROR' });
          }
          const body = String(payload.body ?? '').trim().slice(0, 5000);
          const id = crypto.randomUUID();
          await tx`insert into proposals (id, author_id, title, body)
                   values (${id}, ${userId}, ${title}, ${body})`;
          response = ok(envelope.commandId, { proposalId: id });
          break;
        }

        case 'proposal.vote': {
          const proposalId = String(payload.proposalId ?? '');
          const [proposal] = await tx`
            select id from proposals where id = ${proposalId} and deleted_at is null for update
          `;
          if (!proposal) throw Object.assign(new Error('proposal not found'), { code: 'NOT_FOUND' });
          const [existing] = await tx`
            select 1 from proposal_votes where proposal_id = ${proposalId} and profile_id = ${userId}
          `;
          if (existing) {
            await tx`delete from proposal_votes where proposal_id = ${proposalId} and profile_id = ${userId}`;
          } else {
            await tx`insert into proposal_votes (proposal_id, profile_id) values (${proposalId}, ${userId})`;
          }
          const [count] = await tx`
            select count(*)::int as count from proposal_votes where proposal_id = ${proposalId}
          `;
          response = ok(envelope.commandId, {
            proposalId,
            voted: !existing,
            voteCount: count.count,
          });
          break;
        }

        case 'map.ensureDefaults': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const [existing] = await tx`
            select count(*)::int as count from map_zones
            where household_id = ${householdId} and deleted_at is null
          `;
          if (existing.count === 0) {
            const defaults = [
              ['苔庭', 0.06, 0.08, 0.38, 0.34, '#EEF4E8'],
              ['水盆', 0.55, 0.09, 0.36, 0.3, '#DDEAF0'],
              ['躲藏', 0.1, 0.55, 0.34, 0.34, '#F4E5C8'],
              ['曬台', 0.55, 0.5, 0.35, 0.36, '#F7DFC8'],
            ];
            for (let index = 0; index < defaults.length; index++) {
              const [name, x, y, w, h, color] = defaults[index];
              await tx`insert into map_zones
                       (household_id, name, x, y, w, h, color, sort_order, created_by, updated_by)
                       values (${householdId}, ${name}, ${x}, ${y}, ${w}, ${h}, ${color}, ${index * 10}, ${userId}, ${userId})`;
            }
          }
          response = ok(envelope.commandId, { seeded: existing.count === 0 });
          break;
        }

        case 'map.zone.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const name = String(payload.name ?? '').trim().slice(0, 40);
          const number = (key: string, fallback: number) => Number(payload[key] ?? fallback);
          const x = number('x', 0.5);
          const y = number('y', 0.5);
          const w = number('w', 0.25);
          const h = number('h', 0.25);
          if (!name || x < 0 || x > 1 || y < 0 || y > 1 || w <= 0 || w > 1 || h <= 0 || h > 1) {
            throw Object.assign(new Error('invalid map zone'), { code: 'VALIDATION_ERROR' });
          }
          const id = crypto.randomUUID();
          const color = String(payload.color ?? '#EEF4E8').slice(0, 20);
          await tx`insert into map_zones
                   (id, household_id, name, x, y, w, h, color, created_by, updated_by)
                   values (${id}, ${householdId}, ${name}, ${x}, ${y}, ${w}, ${h}, ${color}, ${userId}, ${userId})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'map.zone.create', 'map_zone', ${id},
                   ${tx.json({ name, x, y, w, h })}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, { zoneId: id }, 0);
          break;
        }

        case 'map.zone.update': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const zoneId = String(payload.zoneId ?? '');
          const [zone] = await tx`
            select * from map_zones
            where id = ${zoneId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!zone) throw Object.assign(new Error('zone not found'), { code: 'NOT_FOUND' });
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== zone.revision) {
            throw Object.assign(new Error('revision conflict'), { code: 'CONFLICT', currentRevision: zone.revision });
          }
          const number = (key: string, fallback: number) => Number(payload[key] ?? fallback);
          const name = payload.name == null ? zone.name : String(payload.name).trim().slice(0, 40);
          const x = number('x', Number(zone.x));
          const y = number('y', Number(zone.y));
          const w = number('w', Number(zone.w));
          const h = number('h', Number(zone.h));
          if (!name || x < 0 || x > 1 || y < 0 || y > 1 || w <= 0 || w > 1 || h <= 0 || h > 1) {
            throw Object.assign(new Error('invalid map zone'), { code: 'VALIDATION_ERROR' });
          }
          const color = payload.color == null ? zone.color : String(payload.color).slice(0, 20);
          await tx`update map_zones set
                     name = ${name}, x = ${x}, y = ${y}, w = ${w}, h = ${h}, color = ${color},
                     revision = revision + 1, updated_by = ${userId}, updated_at = now()
                   where id = ${zoneId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'map.zone.update', 'map_zone', ${zoneId},
                   ${tx.json({ name, x, y, w, h, color })}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, { zoneId, revision: zone.revision + 1 }, zone.revision + 1);
          break;
        }

        case 'map.zone.delete': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const zoneId = String(payload.zoneId ?? '');
          const [zone] = await tx`
            select revision from map_zones
            where id = ${zoneId} and household_id = ${householdId} and deleted_at is null
            for update
          `;
          if (!zone) throw Object.assign(new Error('zone not found'), { code: 'NOT_FOUND' });
          if (envelope.baseRevision !== undefined && envelope.baseRevision !== zone.revision) {
            throw Object.assign(new Error('revision conflict'), { code: 'CONFLICT', currentRevision: zone.revision });
          }
          await tx`update map_zones set deleted_at = now(), revision = revision + 1, updated_by = ${userId}, updated_at = now()
                   where id = ${zoneId}`;
          await tx`update animal_positions set zone_id = null where zone_id = ${zoneId} and household_id = ${householdId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                   values (${householdId}, ${userId}, 'map.zone.delete', 'map_zone', ${zoneId}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, { zoneId, revision: zone.revision + 1 }, zone.revision + 1);
          break;
        }

        case 'map.move': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const animalId = String(payload.animalId ?? '');
          const [animal] = await tx`
            select status from animals
            where id = ${animalId} and household_id = ${householdId} and deleted_at is null
          `;
          if (!animal || animal.status !== 'active') {
            throw Object.assign(new Error('active animal not found'), { code: 'NOT_FOUND' });
          }
          const x = Number(payload.x ?? 0.5);
          const y = Number(payload.y ?? 0.5);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
            throw Object.assign(new Error('invalid map position'), { code: 'VALIDATION_ERROR' });
          }
          await tx`insert into animal_positions (animal_id, household_id, x, y, updated_by, updated_at)
                   values (${animalId}, ${householdId}, ${x}, ${y}, ${userId}, now())
                   on conflict (animal_id) do update set
                     household_id = excluded.household_id, x = excluded.x, y = excluded.y,
                     updated_by = excluded.updated_by, updated_at = now()`;
          response = ok(envelope.commandId, { animalId, x, y });
          break;
        }

        case 'points.checkIn': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const [household] = await tx`select timezone from households where id = ${householdId}`;
          if (!household) throw Object.assign(new Error('household not found'), { code: 'NOT_FOUND' });
          const [day] = await tx`select (now() at time zone ${household.timezone})::date as checkin_date`;
          const [existing] = await tx`
            select id from points_ledger
            where profile_id = ${userId} and checkin_date = ${day.checkin_date} and reason = 'check_in'
          `;
          if (!existing) {
            await tx`insert into points_ledger (profile_id, household_id, delta, reason, checkin_date)
                     values (${userId}, ${householdId}, 10, 'check_in', ${day.checkin_date})`;
          }
          response = ok(envelope.commandId, {
            alreadyCheckedIn: !!existing,
            date: String(day.checkin_date),
            balance: await pointsBalance(tx, userId),
          });
          break;
        }

        case 'shop.order.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          await tx`select id from profiles where id = ${userId} for update`;
          const rawItems = Array.isArray(payload.items) ? payload.items : [];
          if (!rawItems.length || rawItems.length > 20) {
            throw Object.assign(new Error('order must contain 1-20 items'), { code: 'VALIDATION_ERROR' });
          }
          const wanted = new Map<string, number>();
          for (const item of rawItems) {
            const productId = String((item as Record<string, unknown>).productId ?? '');
            const quantity = Number((item as Record<string, unknown>).quantity ?? 0);
            if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
              throw Object.assign(new Error('invalid order item'), { code: 'VALIDATION_ERROR' });
            }
            wanted.set(productId, (wanted.get(productId) ?? 0) + quantity);
          }
          const products = await tx`
            select id, name, price_cents, stock from shop_products
            where id = any(${[...wanted.keys()]}::text[]) and active = true
            order by id for update
          `;
          if (products.length !== wanted.size) {
            throw Object.assign(new Error('product not found'), { code: 'NOT_FOUND' });
          }
          let subtotal = 0;
          const snapshots: Record<string, unknown>[] = [];
          for (const product of products) {
            const quantity = wanted.get(product.id)!;
            if (product.stock < quantity) {
              throw Object.assign(new Error(`${product.name} is out of stock`), { code: 'OUT_OF_STOCK' });
            }
            subtotal += product.price_cents * quantity;
            snapshots.push({
              productId: product.id,
              name: product.name,
              unitPriceCents: product.price_cents,
              quantity,
            });
          }
          const requestedPoints = Math.max(0, Math.floor(Number(payload.pointsUsed ?? 0)));
          const maxPoints = Math.floor(subtotal / 100);
          if (!Number.isFinite(requestedPoints) || requestedPoints > maxPoints) {
            throw Object.assign(new Error('points exceed order total'), { code: 'VALIDATION_ERROR' });
          }
          const balance = await pointsBalance(tx, userId);
          if (requestedPoints > balance) {
            throw Object.assign(new Error('not enough points'), { code: 'INSUFFICIENT_POINTS' });
          }
          const orderId = crypto.randomUUID();
          const totalCents = subtotal - requestedPoints * 100;
          for (const product of products) {
            const quantity = wanted.get(product.id)!;
            await tx`update shop_products set stock = stock - ${quantity} where id = ${product.id}`;
          }
          if (requestedPoints > 0) {
            await tx`insert into points_ledger (profile_id, household_id, delta, reason)
                     values (${userId}, ${householdId}, ${-requestedPoints}, ${`order:${orderId}`})`;
          }
          await tx`insert into shop_orders
                   (id, household_id, profile_id, items, subtotal_cents, points_used, total_cents, status, payment_method)
                   values (${orderId}, ${householdId}, ${userId}, ${tx.json(snapshots)},
                   ${subtotal}, ${requestedPoints}, ${totalCents}, 'confirmed', 'sandbox')`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'shop.order.create', 'shop_order', ${orderId},
                   ${tx.json({ subtotal, requestedPoints, totalCents })}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, {
            orderId,
            subtotalCents: subtotal,
            pointsUsed: requestedPoints,
            totalCents,
            balance: balance - requestedPoints,
          });
          break;
        }

        case 'shop.order.cancel': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          const member = await requireMember(tx, householdId, userId);
          const orderId = String(payload.orderId ?? '');
          const [order] = await tx`
            select * from shop_orders
            where id = ${orderId} and household_id = ${householdId}
            for update
          `;
          if (!order) throw Object.assign(new Error('order not found'), { code: 'NOT_FOUND' });
          if (member.role !== 'owner' && order.profile_id !== userId) {
            throw Object.assign(new Error('cannot cancel this order'), { code: 'FORBIDDEN' });
          }
          if (order.status === 'cancelled') {
            response = ok(envelope.commandId, {
              orderId,
              status: 'cancelled',
              alreadyCancelled: true,
              balance: await pointsBalance(tx, order.profile_id),
            });
            break;
          }
          if (order.status !== 'confirmed') {
            throw Object.assign(new Error('order is not cancellable'), { code: 'INVALID_STATE' });
          }
          const items = order.items as Array<{ productId: string; quantity: number }>;
          for (const item of items) {
            await tx`update shop_products set stock = stock + ${Number(item.quantity)} where id = ${item.productId}`;
          }
          if (Number(order.points_used) > 0) {
            await tx`insert into points_ledger (profile_id, household_id, delta, reason)
                     values (${order.profile_id}, ${householdId}, ${Number(order.points_used)}, ${`order_cancel:${orderId}`})`;
          }
          await tx`update shop_orders set status = 'cancelled', updated_at = now() where id = ${orderId}`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                   values (${householdId}, ${userId}, 'shop.order.cancel', 'shop_order', ${orderId}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, {
            orderId,
            status: 'cancelled',
            balance: await pointsBalance(tx, order.profile_id),
          });
          break;
        }

        case 'subscription.activate': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const planId = String(payload.planId ?? '');
          const [plan] = await tx`select id, name from subscription_plans where id = ${planId} and active = true`;
          if (!plan) throw Object.assign(new Error('plan not found'), { code: 'NOT_FOUND' });
          const [subscription] = await tx`
            insert into profile_subscriptions (profile_id, plan_id, status, started_at, expires_at, sandbox, updated_at)
            values (${userId}, ${planId}, 'active', now(), now() + interval '30 days', true, now())
            on conflict (profile_id) do update set
              plan_id = excluded.plan_id,
              status = 'active',
              started_at = excluded.started_at,
              expires_at = excluded.expires_at,
              sandbox = true,
              updated_at = now()
            returning plan_id, status, started_at, expires_at, sandbox
          `;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'subscription.activate', 'profile_subscription', ${userId},
                   ${tx.json({ planId })}, ${envelope.commandId}, 'ios')`;
          response = ok(envelope.commandId, subscription);
          break;
        }

        case 'subscription.cancel': {
          const plan = await tx`
            update profile_subscriptions
            set status = 'cancelled', updated_at = now()
            where profile_id = ${userId} and status = 'active'
            returning plan_id, status, expires_at
          `;
          if (!plan.length) throw Object.assign(new Error('active subscription not found'), { code: 'NOT_FOUND' });
          response = ok(envelope.commandId, plan[0]);
          break;
        }

        case 'user.updateProfile': {
          const displayName = payload.displayName == null ? null : String(payload.displayName).trim();
          const timezone = payload.timezone == null ? null : String(payload.timezone);
          const defaultHouseholdId = payload.defaultHouseholdId == null ? null : String(payload.defaultHouseholdId);
          if (defaultHouseholdId) {
            await requireMember(tx, defaultHouseholdId, userId);
          }
          await tx`update profiles set
            display_name = coalesce(${displayName}, display_name),
            timezone = coalesce(${timezone}, timezone),
            default_household_id = coalesce(${defaultHouseholdId}, default_household_id),
            updated_at = now()
            where id = ${userId}`;
          response = ok(envelope.commandId, { updated: true });
          break;
        }

        default:
          throw Object.assign(new Error(`unknown command: ${envelope.type}`), { code: 'VALIDATION_ERROR' });
      }

      await tx`insert into commands (command_id, user_id, request_hash, response, expires_at)
               values (${envelope.commandId}, ${userId}, ${requestHash}, ${tx.json(response)}, now() + interval '24 hours')
               on conflict (command_id) do nothing`;
      return response;
    });
    return json(result);
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'INTERNAL';
    const status = code === 'UNAUTHENTICATED' ? 401 : 200;
    const detail = error as { current?: unknown; currentRevision?: unknown };
    return json(fail(
      envelope.commandId,
      code,
      code === 'INTERNAL' ? 'command failed' : (error instanceof Error ? error.message : 'command failed'),
      {
        ...(detail.current === undefined ? {} : { current: detail.current }),
        ...(detail.currentRevision === undefined ? {} : { currentRevision: detail.currentRevision }),
      },
    ), status);
  }
});
