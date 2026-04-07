import { createClient } from '@/lib/supabase/server';

// These must mirror UserRole in src/lib/auth-context.tsx. Server-side equivalent.
export type ServerRole = 'account_manager' | 'designer' | 'scheduler' | 'klaviyo_tech';

// Roles allowed to access the A/B Tests feature.
export const AB_TEST_ALLOWED_SERVER_ROLES: ServerRole[] = ['account_manager', 'klaviyo_tech'];

/**
 * Returns the current authenticated user's role from the user_roles table,
 * or null if they are not logged in / not in the table.
 */
export async function getCurrentUserRole(): Promise<ServerRole | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  return (data?.role as ServerRole) ?? null;
}

/**
 * Returns the current auth user plus their role.
 */
export async function getCurrentUserWithRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_roles')
    .select('role, email')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email || data?.email || null,
    role: (data?.role as ServerRole) ?? null,
  };
}

export function roleAllowedForAbTests(role: ServerRole | null): boolean {
  if (!role) return false;
  return AB_TEST_ALLOWED_SERVER_ROLES.includes(role);
}
