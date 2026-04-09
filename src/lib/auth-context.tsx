'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from './supabase/client';

export type UserRole =
  | 'none'
  | 'admin'
  | 'account_manager'
  | 'designer'
  | 'scheduler'
  | 'klaviyo_tech';

// Define which routes each role can access.
// - 'none': no access — they see the "pending role" screen
// - 'admin': everything the account manager can see, plus user management
export const ROLE_ACCESS: Record<UserRole, string[]> = {
  none: [],
  admin: [
    '/', '/sop', '/create', '/calendar', '/briefs', '/flow-briefs', '/reports', '/weekly-wrap', '/test-results', '/account-audit',
    '/message-request', '/my-calendar', '/design-queue', '/references', '/chat', '/client-comments',
    '/clients', '/team', '/clients/new', '/ab-tests',
  ],
  account_manager: [
    '/', '/sop', '/create', '/calendar', '/briefs', '/flow-briefs', '/reports', '/weekly-wrap', '/test-results', '/account-audit',
    '/message-request', '/my-calendar', '/design-queue', '/references', '/chat', '/client-comments',
    '/clients', '/team', '/clients/new', '/ab-tests',
  ],
  designer: [
    '/', '/create', '/calendar', '/briefs', '/flow-briefs', '/design-queue', '/chat', '/my-calendar',
  ],
  scheduler: [
    '/', '/calendar', '/briefs', '/flow-briefs', '/chat', '/my-calendar',
  ],
  klaviyo_tech: [
    '/', '/calendar', '/briefs', '/flow-briefs', '/reports', '/weekly-wrap', '/test-results', '/account-audit', '/chat', '/ab-tests', '/client-comments', '/my-calendar',
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  none: 'No role assigned',
  admin: 'Admin',
  account_manager: 'Account Manager',
  designer: 'Designer',
  scheduler: 'Scheduler',
  klaviyo_tech: 'Klaviyo Technician',
};

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  isPendingRole: boolean; // true when role === 'none'
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  canAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<UserRole>('none');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Track which user id we've already loaded role for, so TOKEN_REFRESHED
  // events don't re-fetch the role on every auto-refresh (which caused the
  // client to redundantly write to the DB and could race with other clients,
  // eventually logging the user out mid-session).
  const loadedForUserId = useRef<string | null>(null);

  const loadRole = useCallback(async (userId: string, email?: string) => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (data?.role && isValidRole(data.role)) {
        setRoleState(data.role as UserRole);
      } else if (data) {
        // Row exists but role is unknown — treat as none
        setRoleState('none');
      } else {
        // First sign-in: create the row with role='none' so an admin can
        // assign one. The user can't access anything until then.
        await supabase
          .from('user_roles')
          .upsert(
            {
              user_id: userId,
              email: email || '',
              role: 'none',
            },
            { onConflict: 'user_id' }
          );
        setRoleState('none');
      }
    } catch {
      // On error, play it safe — default to no access
      setRoleState('none');
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase?.auth) {
      setLoading(false);
      return;
    }

    // Prime the state immediately from the existing session so we don't wait
    // for the first onAuthStateChange.
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadedForUserId.current = currentUser.id;
        loadRole(currentUser.id, currentUser.email || '').finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, session: { user: User | null } | null) => {
        const newUser = session?.user ?? null;
        setUser(newUser);

        if (newUser) {
          // Only load the role when this is a genuinely new sign-in, not on
          // every TOKEN_REFRESHED event (which fires hourly and was the root
          // cause of the disconnect-and-logout loop).
          if (loadedForUserId.current !== newUser.id) {
            loadedForUserId.current = newUser.id;
            loadRole(newUser.id, newUser.email || '');
          }
        } else {
          loadedForUserId.current = null;
          setRoleState('none');
        }

        // Only transition out of loading on events that actually have a
        // deterministic outcome — not on TOKEN_REFRESHED where we've already
        // handled loading via getSession above.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadRole]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setRoleState('none');
    loadedForUserId.current = null;
  };

  const canAccess = (path: string): boolean => {
    if (!path) return false;
    const allowedPaths = Array.isArray(ROLE_ACCESS[role]) ? ROLE_ACCESS[role] : [];
    return allowedPaths.some((p) => path === p || path.startsWith(p + '/'));
  };

  const isPendingRole = !!user && role === 'none';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        isPendingRole,
        signIn,
        signUp,
        signOut,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function isValidRole(r: string): r is UserRole {
  return (
    r === 'none' ||
    r === 'admin' ||
    r === 'account_manager' ||
    r === 'designer' ||
    r === 'scheduler' ||
    r === 'klaviyo_tech'
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
