import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const functionsUrl = `${supabaseUrl}/functions/v1`;

const clients = new Map<string, SupabaseClient>();

export function makeClient(token?: string): SupabaseClient {
  const key = token ?? 'anon';
  const cached = clients.get(key);
  if (cached) return cached;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
  clients.set(key, client);
  return client;
}
