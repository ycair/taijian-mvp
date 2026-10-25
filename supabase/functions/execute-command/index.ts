import { corsHeaders, json } from '../_shared/http.ts';
import { verifyUserToken } from '../_shared/jwt.ts';
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

  const userId = await verifyUserToken(request);
  if (!userId) {
    return json({ ok: false, code: 'UNAUTHENTICATED', message: 'Sign in required' });
  }

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
          await tx`insert into invites (id, household_id, role, created_by, secret_hash, expires_at)
                   values (${inviteId}, ${householdId}, 'caretaker', ${userId}, ${secretHash}, ${expiresAt})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, command_id, source)
                   values (${householdId}, ${userId}, 'member.invite', 'invite', ${inviteId}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { token: `${inviteId}.${secret}`, inviteId, expiresAt });
          break;
        }

        case 'member.accept': {
          const token = String(payload.token ?? '');
          const [inviteId, secret] = token.split('.');
          if (!inviteId || !secret) throw Object.assign(new Error('invalid token'), { code: 'VALIDATION_ERROR' });
          const [invite] = await tx`select * from invites where id = ${inviteId}`;
          if (!invite) throw Object.assign(new Error('invite not found'), { code: 'NOT_FOUND' });
          if (invite.status !== 'active' || new Date(invite.expires_at).getTime() < Date.now()) {
            throw Object.assign(new Error('invite expired'), { code: 'INVITE_EXPIRED' });
          }
          const hash = await sha256(secret);
          if (hash !== invite.secret_hash) throw Object.assign(new Error('invite not found'), { code: 'NOT_FOUND' });
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

        case 'animal.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const id = crypto.randomUUID();
          await tx`insert into animals (id, household_id, name, species, species_label, morph, sex, birth_date, adoption_date, avatar_color, notes, created_by, updated_by)
                   values (${id}, ${householdId}, ${String(payload.name)}, ${String(payload.species)},
                   ${payload.speciesLabel ?? null}, ${payload.morph ?? null}, ${payload.sex ?? 'unknown'},
                   ${payload.birthDate ?? null}, ${payload.adoptionDate ?? null},
                   ${payload.avatarColor ?? '#7C9A76'}, ${payload.notes ?? null}, ${userId}, ${userId})`;
          await tx`insert into audit_logs (household_id, actor_id, action, target_type, target_id, after, command_id, source)
                   values (${householdId}, ${userId}, 'animal.create', 'animal', ${id}, ${tx.json(payload)}, ${envelope.commandId}, 'liff')`;
          response = ok(envelope.commandId, { animalId: id }, 0);
          break;
        }

        case 'record.create': {
          if (!householdId) throw Object.assign(new Error('householdId required'), { code: 'VALIDATION_ERROR' });
          await requireMember(tx, householdId, userId);
          const animalId = String(payload.animalId ?? '');
          const [animal] = await tx`select 1 from animals where id = ${animalId} and household_id = ${householdId} and deleted_at is null`;
          if (!animal) throw Object.assign(new Error('animal not found'), { code: 'NOT_FOUND' });
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
          const id = crypto.randomUUID();
          await tx`insert into reminders (id, household_id, animal_id, title, type, schedule, timezone, enabled, next_due_at, created_by, updated_by)
                   values (${id}, ${householdId}, ${String(payload.animalId)}, ${String(payload.title)},
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
    return json(fail(envelope.commandId, code, error instanceof Error ? error.message : 'command failed'));
  }
});
