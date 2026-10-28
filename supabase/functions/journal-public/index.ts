import { corsHeaders, json } from '../_shared/http.ts';
import { sql } from '../_shared/db.ts';
import { verifyAccessTokenFromRequest } from '../_shared/auth_tokens.ts';

const PUBLIC_FIELDS = `
  e.id, e.title, e.body, e.journal_date, e.photos, e.cover_path,
  e.animal_ids, e.visibility, e.share_token, e.published_at, e.author_id,
  p.display_name AS author_name, p.avatar_url AS author_avatar
`;

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function signedPhotoUrl(path: string): Promise<string | null> {
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!base || !key) return null;
  const response = await fetch(
    `${base}/storage/v1/object/sign/journal-photos/${encodePath(path)}`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    },
  );
  if (!response.ok) return null;
  const decoded = await response.json();
  const signed = decoded.signedURL ?? decoded.signedUrl;
  return typeof signed === 'string' ? `${base}/storage/v1${signed}` : null;
}

async function hydrate(row: any, viewerId: string | null): Promise<Record<string, unknown> | null> {
  if (!row) return null;
  const rawPhotos = Array.isArray(row.photos) ? row.photos : [];
  const photos = [];
  for (const photo of rawPhotos) {
    const path = typeof photo?.path === 'string' ? photo.path : '';
    if (!path) continue;
    photos.push({
      path,
      caption: typeof photo.caption === 'string' ? photo.caption : '',
      url: await signedPhotoUrl(path),
    });
  }
  const cover = typeof row.cover_path === 'string' ? row.cover_path : photos[0]?.path;
  const animalIds = Array.isArray(row.animal_ids) ? row.animal_ids : [];
  const residents = animalIds.length
    ? await sql`
        select name, species_label, avatar_color, avatar_pattern, public_token
        from animals
        where id = any(${animalIds}::uuid[])
          and record_visibility = 'public'
          and public_token is not null
          and deleted_at is null
      `
    : [];
  const [following] = viewerId
    ? await sql`select 1 from profile_follows where follower_id = ${viewerId} and following_id = ${row.author_id}`
    : [null];
  const [blocked] = viewerId
    ? await sql`select 1 from profile_blocks where blocker_id = ${viewerId} and blocked_id = ${row.author_id}`
    : [null];
  const [likeCount] = await sql`select count(*)::int as count from journal_likes where entry_id = ${row.id}`;
  const [liked] = viewerId
    ? await sql`select 1 from journal_likes where entry_id = ${row.id} and profile_id = ${viewerId}`
    : [null];
  const comments = await sql`
    select c.id, c.body, c.created_at, p.display_name as author_name, p.avatar_url as author_avatar
    from journal_comments c
    join profiles p on p.id = c.author_id
    where c.entry_id = ${row.id} and c.deleted_at is null
    order by c.created_at asc
    limit 100
  `;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    journalDate: row.journal_date,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar,
    shareToken: row.share_token,
    publishedAt: row.published_at,
    residents: residents.map((resident: any) => ({
      name: resident.name,
      speciesLabel: resident.species_label,
      avatarColor: resident.avatar_color,
      avatarPattern: resident.avatar_pattern,
      token: resident.public_token,
    })),
    photos,
    coverUrl: cover ? await signedPhotoUrl(cover) : null,
    likeCount: likeCount?.count ?? 0,
    liked: !!liked,
    following: !!following,
    blocked: !!blocked,
    commentCount: comments.length,
    comments: comments.map((comment: any) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      authorName: comment.author_name,
    })),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET only' }, 405);
  }
  try {
    const url = new URL(request.url);
    const claims = await verifyAccessTokenFromRequest(request);
    const viewerId = claims?.profileId ?? null;
    const token = url.searchParams.get('token');
    if (token) {
      const [row] = await sql`
        select ${sql.unsafe(PUBLIC_FIELDS)}
        from public.journal_entries e
        join public.profiles p on p.id = e.created_by
        where e.share_token = ${token}
          and e.visibility in ('link', 'public')
          and e.deleted_at is null
          and (${viewerId}::uuid is null or not exists (
            select 1 from profile_blocks b
            where b.blocker_id = ${viewerId} and b.blocked_id = e.author_id
          ))
        limit 1
      `;
      if (!row) return json({ ok: false, code: 'NOT_FOUND', message: 'not found' }, 404);
      return json({ ok: true, entry: await hydrate(row, viewerId) });
    }

    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    const rows = await sql`
      select ${sql.unsafe(PUBLIC_FIELDS)}
      from public.journal_entries e
      join public.profiles p on p.id = e.created_by
      where e.visibility = 'public' and e.deleted_at is null
        and (${viewerId}::uuid is null or not exists (
          select 1 from profile_blocks b
          where b.blocker_id = ${viewerId} and b.blocked_id = e.author_id
        ))
      order by e.published_at desc nulls last, e.created_at desc
      limit ${limit}
    `;
    const entries = [];
    for (const row of rows) entries.push(await hydrate(row, viewerId));
    return json({ ok: true, entries });
  } catch (error) {
    console.error('journal-public failed', error);
    return json({ ok: false, code: 'INTERNAL', message: 'failed' }, 200);
  }
});
