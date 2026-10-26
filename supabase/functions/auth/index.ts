import { handleAuth } from '../_shared/auth_http.ts';

Deno.serve(handleAuth);
