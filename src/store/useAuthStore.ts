import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import { Profile } from '@/types/database';
import { useAppStore } from './useAppStore';
import { resolveOrganizationId } from '@/services/api/lendflowApi';

interface AuthState {
  user: any | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, pass: string) => Promise<{ error?: string }>;
  signUp: (email: string, pass: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  initializeAuth: () => Promise<void>;
}

async function syncUserSession(sessionUser: any): Promise<Profile | null> {
  if (!sessionUser) {
    useAppStore.getState().setCurrentOrgId('');
    return null;
  }

  try {
    const orgId = await resolveOrganizationId(undefined, sessionUser.id);
    if (orgId) {
      useAppStore.getState().setCurrentOrgId(orgId);
    }
  } catch (err) {
    console.warn('Failed to resolve organization during auth sync:', err);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sessionUser.id)
    .maybeSingle();

  return profile || null;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,

  initializeAuth: async () => {
    try {
      set({ isLoading: true });
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const profile = await syncUserSession(session.user);
        set({
          user: session.user,
          profile,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ user: null, profile: null, isAuthenticated: false, isLoading: false });
      }

      // Listen for auth state changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const profile = await syncUserSession(session.user);
          set({
            user: session.user,
            profile,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          useAppStore.getState().setCurrentOrgId('');
          set({ user: null, profile: null, isAuthenticated: false, isLoading: false });
        }
      });
    } catch {
      set({ isLoading: false });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        set({ isLoading: false });
        return { error: error.message };
      }

      const profile = await syncUserSession(data.user);

      set({
        user: data.user,
        profile,
        isAuthenticated: true,
        isLoading: false,
      });
      return {};
    } catch (err: any) {
      set({ isLoading: false });
      return { error: err.message || 'Login failed' };
    }
  },

  signUp: async (email, password, fullName) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      if (error) {
        set({ isLoading: false });
        return { error: error.message };
      }

      if (data.user) {
        const profile = await syncUserSession(data.user);
        set({
          user: data.user,
          profile,
          isAuthenticated: true,
          isLoading: false,
        });
      }
      return {};
    } catch (err: any) {
      set({ isLoading: false });
      return { error: err.message || 'Signup failed' };
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    useAppStore.getState().setCurrentOrgId('');
    set({ user: null, profile: null, isAuthenticated: false });
  },
}));
