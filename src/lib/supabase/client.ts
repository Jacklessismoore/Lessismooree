import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url === 'your_supabase_url_here') {
    // Return a mock client during build/SSG when env vars aren't configured
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(url, key);
}
