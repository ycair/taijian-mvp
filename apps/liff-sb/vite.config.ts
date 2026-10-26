import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const url = env.VITE_SUPABASE_URL ?? '';
    if (!url || /localhost|127\.0\.0\.1/.test(url)) {
      throw new Error(
        'Production LIFF build must set VITE_SUPABASE_URL to the cloud Supabase URL',
      );
    }
    if (!env.VITE_LIFF_ID) {
      throw new Error('Production LIFF build must set VITE_LIFF_ID');
    }
  }
  return {
    plugins: [react()],
    server: { port: 5174 },
    test: { environment: 'node' },
  };
});
