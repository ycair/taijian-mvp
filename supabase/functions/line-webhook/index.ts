import { sql } from '../_shared/db.ts';

const channelSecret = Deno.env.get('LINE_MESSAGING_CHANNEL_SECRET') ?? 'test-messaging-secret';
const accessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? 'test-access-token';
const liffId = Deno.env.get('LIFF_ID') ?? 'test-liff';

async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

async function reply(replyToken: string, text: string): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4999) }] }),
  });
}

function liffUrl(path: string): string {
  return `https://liff.line.me/${liffId}${path}`;
}

Deno.serve(async (request) => {
  const raw = await request.text();
  const signature = request.headers.get('x-line-signature') ?? '';
  if (!(await verifySignature(raw, signature))) {
    return new Response('invalid signature', { status: 401 });
  }

  let body: { events?: any[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('invalid body', { status: 400 });
  }

  for (const event of body.events ?? []) {
    try {
      if (event.type !== 'message' || event.message?.type !== 'text') continue;
      const lineSub = event.source?.userId;
      const text = String(event.message.text ?? '').trim();
      if (!lineSub) continue;

      const [mapping] = await sql`
        select user_id, status from line_users where line_sub = ${lineSub}
      `;
      if (!mapping || mapping.status !== 'active') {
        await reply(event.replyToken, `請先透過 LIFF 登入苔間：${liffUrl('/')}`);
        continue;
      }
      const userId = mapping.user_id as string;

      const [processed] = await sql`select 1 from line_events where event_id = ${event.webhookEventId}`;
      if (processed) continue;

      const [profile] = await sql`select default_household_id from profiles where id = ${userId}`;
      const householdId = profile?.default_household_id;
      if (!householdId) {
        await reply(event.replyToken, `請先建立家庭：${liffUrl('/settings')}`);
        continue;
      }

      if (/^(今日|今天|today)$/i.test(text)) {
        const rows = await sql`
          select r.title, a.name, c.completed_by_name
          from reminders r
          join animals a on a.id = r.animal_id
          left join task_completions c on c.reminder_id = r.id and c.due_date = current_date
          where r.household_id = ${householdId} and r.enabled = true and r.deleted_at is null
          order by r.title
          limit 15
        `;
        if (!rows.length) {
          await reply(event.replyToken, '今天沒有任務。');
        } else {
          const lines = rows.map((row: any) => `${row.completed_by_name ? '✓' : '○'} ${row.title} · ${row.name}`);
          await reply(event.replyToken, `今日任務：\n${lines.join('\n')}`);
        }
        await sql`insert into line_events (event_id) values (${event.webhookEventId}) on conflict do nothing`;
        continue;
      }

      if (/^(居民|動物|animals)$/i.test(text)) {
        const rows = await sql`
          select name, species_label, species from animals
          where household_id = ${householdId} and deleted_at is null and status = 'active'
          order by name limit 30
        `;
        await reply(event.replyToken, rows.length
          ? `居民：${rows.map((row: any) => row.name).join('、')}`
          : `還沒有居民：${liffUrl('/animals')}`);
        await sql`insert into line_events (event_id) values (${event.webhookEventId}) on conflict do nothing`;
        continue;
      }

      const feed = text.match(/^餵食\s+(\S+)(?:\s+(.+))?$/);
      const weight = text.match(/^體重\s+(\S+)\s+(\d+(?:\.\d+)?)$/);
      const complete = text.match(/^完成\s+(.+)$/);

      if (complete) {
        const [reminder] = await sql`
          select r.id, r.title from reminders r
          join animals a on a.id = r.animal_id
          where r.household_id = ${householdId} and r.enabled = true and r.deleted_at is null
            and a.deleted_at is null and a.status = 'active' and r.title ilike ${`%${complete[1]}%`}
          limit 1
        `;
        if (!reminder) {
          await reply(event.replyToken, `找不到任務「${complete[1]}」。`);
        } else {
          await sql`
            insert into task_completions (id, household_id, animal_id, reminder_id, due_date, completed_by, completed_by_name, source)
            select encode(digest(${reminder.id}::text || ':' || current_date::text, 'sha256'), 'hex'),
                   r.household_id, r.animal_id, r.id, current_date, ${userId}, p.display_name, 'bot'
            from reminders r, profiles p
            where r.id = ${reminder.id} and p.id = ${userId}
            on conflict (id) do nothing
          `;
          await reply(event.replyToken, `已完成「${reminder.title}」。`);
        }
        await sql`insert into line_events (event_id) values (${event.webhookEventId}) on conflict do nothing`;
        continue;
      }

      if (feed || weight) {
        const name = (feed?.[1] ?? weight?.[1]) as string;
        const [animal] = await sql`
          select id, name from animals
          where household_id = ${householdId} and deleted_at is null and status = 'active'
            and lower(name) = lower(${name})
          limit 1
        `;
        if (!animal) {
          await reply(event.replyToken, `找不到居民「${name}」。`);
        } else {
          const type = feed ? 'feeding' : 'weight';
          const value = weight ? Number(weight[2]) : null;
          const unit = weight ? 'g' : null;
          const note = feed?.[2] ?? null;
          await sql`
            insert into records (id, household_id, animal_id, type, occurred_at, value, unit, note, source, created_by, updated_by)
            values (gen_random_uuid(), ${householdId}, ${animal.id}, ${type}, now(), ${value}, ${unit}, ${note}, 'bot', ${userId}, ${userId})
          `;
          await reply(event.replyToken, `已記錄 ${animal.name} 的${feed ? '餵食' : `體重 ${value} g`}。`);
        }
        await sql`insert into line_events (event_id) values (${event.webhookEventId}) on conflict do nothing`;
        continue;
      }

      await reply(
        event.replyToken,
        '可用指令：今日、居民、餵食 <居民> [備註]、體重 <居民> <克數>、完成 <任務>',
      );
      await sql`insert into line_events (event_id) values (${event.webhookEventId}) on conflict do nothing`;
    } catch (error) {
      console.error('line event failed', event?.webhookEventId, error);
    }
  }

  return new Response('ok');
});
