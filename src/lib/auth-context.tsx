'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from './supabase/client';

export type UserRole = 'account_manager' | 'designer' | 'scheduler' | 'klaviyo_tech';

// Define which routes each role can access
export const ROLE_ACCESS: Record<UserRole, string[]> = {
  account_manager: [
    '/', '/sop', '/create', '/calendar', '/briefs', '/reports', '/weekly-wrap', '/test-results',
    '/inbox', '/design-queue', '/references', '/chat',
    '/clients', '/team', '/clients/new', '/ab-tests',
  ],
  designer: [
    '/', '/create', '/calendar', '/briefs', '/design-queue', '/chat',
  ],
  scheduler: [
    '/', '/calendar', '/briefs', '/chat',
  ],
  klaviyo_tech: [
    '/', '/calendar', '/briefs', '/reports', '/weekly-wrap', '/test-results', '/chat', '/ab-tests',
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  account_manager: 'Account Manager',
  designer: 'Designer',
  scheduler: 'Scheduler',
  klaviyo_tech: 'Klaviyo Technician',
};

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  needsRoleSelection: boolean;
  setRole: (role: UserRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  canAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<UserRole>('account_manager');
  const [loading, setLoading] = useState(true);
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const supabase = createClient();

  const loadRole = useCallback(async (userId: string, email?: string) => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (data?.role) {
        setRoleState(data.role as UserRole);
        setNeedsRoleSelection(false);
        // Ensure email is up to date
        if (email) {
          await supabase.from('user_roles').update({ email }).eq('user_id', userId);
        }
      } else {
        // New user — needs to pick a role
        setNeedsRoleSelection(true);
        // Create a placeholder record so it shows up in admin
        await supabase.from('user_roles').upsert({
          user_id: userId,
          email: email || '',
          role: 'account_manager',
        }, { onConflict: 'user_id' });
      }
    } catch {
      setRoleState('account_manager');
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase?.auth) {
      setLoading(false);
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user: User | null } | null) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      if (newUser) {
        loadRole(newUser.id, newUser.email || '');
      } else {
        setRoleState('account_manager');
        setNeedsRoleSelection(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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

  const setRole = async (newRole: UserRole) => {
    if (!supabase || !user) return;
    await supabase.from('user_roles').update({ role: newRole }).eq('user_id', user.id);
    setRoleState(newRole);
    setNeedsRoleSelection(false);
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setRoleState('account_manager');
    setNeedsRoleSelection(false);
  };

  const canAccess = (path: string): boolean => {
    const allowedPaths = ROLE_ACCESS[role];
    // Check exact match or prefix match (for dynamic routes like /clients/[id])
    return allowedPaths.some(p => path === p || path.startsWith(p + '/'));
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, needsRoleSelection, setRole, signIn, signUp, signOut, canAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
