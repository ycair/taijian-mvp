import postgres from 'npm:postgres@3';

const connectionString =
  Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@host.docker.internal:54322/postgres';

export const sql = postgres(connectionString, {
  max: 3,
  prepare: false,
});
