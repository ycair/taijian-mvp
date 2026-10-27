import { corsHeaders, json } from '../_shared/http.ts';
import { sql } from '../_shared/db.ts';

type PublicRelative = {
  relation: 'parent' | 'child';
  public: boolean;
  name: string | null;
  speciesLabel: string | null;
  avatarColor: string | null;
  avatarPattern: string | null;
  token: string | null;
};

async function publicRelatives(animalId: string): Promise<PublicRelative[]> {
  const rows = await sql`
    select 'parent' as relation, a.name, a.species_label, a.avatar_color, a.avatar_pattern, a.public_token
    from animal_lineage l
    join animals a on a.id = l.parent_id
    where l.child_id = ${animalId} and a.deleted_at is null
    union all
    select 'child', a.name, a.species_label, a.avatar_color, a.avatar_pattern, a.public_token
    from animal_lineage l
    join animals a on a.id = l.child_id
    where l.parent_id = ${animalId} and a.deleted_at is null
  `;
  return rows.map((row: any) => ({
    relation: row.relation,
    public: row.public_token != null,
    name: row.public_token ? row.name : null,
    speciesLabel: row.public_token ? row.species_label : null,
    avatarColor: row.public_token ? row.avatar_color : null,
    avatarPattern: row.public_token ? row.avatar_pattern : null,
    token: row.public_token ?? null,
  }));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET only' }, 405);
  try {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    if (!token) return json({ ok: false, code: 'VALIDATION_ERROR', message: 'token required' }, 400);

    const [resident] = await sql`
      select id, name, species, species_label, morph, sex, avatar_color, avatar_pattern, status
      from animals
      where public_token = ${token}
        and record_visibility = 'public'
        and deleted_at is null
        and status in ('active', 'memorial')
      limit 1
    `;
    if (!resident) return json({ ok: false, code: 'NOT_FOUND', message: 'not found' }, 404);

    const records = await sql`
      select type, occurred_at, value, unit, note, metadata
      from records
      where animal_id = ${resident.id} and deleted_at is null
      order by occurred_at desc
      limit 300
    `;
    const relatives = await publicRelatives(resident.id);

    return json({
      ok: true,
      resident: {
        name: resident.name,
        species: resident.species,
        speciesLabel: resident.species_label,
        morph: resident.morph,
        sex: resident.sex,
        avatarColor: resident.avatar_color,
        avatarPattern: resident.avatar_pattern,
        status: resident.status,
      },
      records: records.map((record: any) => ({
        type: record.type,
        occurredAt: record.occurred_at,
        value: record.value,
        unit: record.unit,
        note: record.note,
        metadata: record.metadata ?? {},
      })),
      relatives: {
        parents: relatives.filter((relative) => relative.relation === 'parent'),
        children: relatives.filter((relative) => relative.relation === 'child'),
      },
    });
  } catch (error) {
    console.error('resident-public failed', error);
    return json({ ok: false, code: 'INTERNAL', message: 'failed' }, 200);
  }
});
