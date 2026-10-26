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
          await tx`insert into records (id, household_id, animal_id, type, occurred_at, value, unit, note, metadata, source, created_by, updated_by)
                   values (${id}, ${householdId}, ${animalId}, ${String(payload.type)}, ${String(payload.occurredAt)},
                   ${payload.value ?? null}, ${payload.unit ?? null}, ${payload.note ?? null},
                   ${tx.json(payload.metadata ?? {})}, 'liff', ${userId}, ${userId})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'record.create', 'record', ${id}, ${tx.json(payload)}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { recordId: id }, 0);
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
