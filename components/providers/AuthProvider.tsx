"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { StaffProfile } from "@/lib/auth";
import { supabaseAuth } from "@/lib/supabase-auth";

interface AuthContextValue {
  user: User | null;
  profile: StaffProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PROFILE_CACHE_KEY = "unieats-staff-profile";

async function fetchUserProfile(userId: string): Promise<StaffProfile | null> {
  if (!supabaseAuth) {
    console.log('[AUTH DEBUG] fetchUserProfile: supabaseAuth is null');
    return null;
  }
  console.log('[AUTH DEBUG] fetchUserProfile: querying staff_profiles for userId:', userId);
  const { data, error } = await supabaseAuth
    .from("staff_profiles")
    .select("id, email, name, role, canteen_id, active")
    .eq("id", userId)
    .maybeSingle();

  console.log('[AUTH DEBUG] fetchUserProfile result:', { data, error: error?.message ?? null });
  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    canteen_id: data.canteen_id ?? null,
    active: data.active,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const p = await fetchUserProfile(user.id);
    setProfile(p);
    if (p && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    }
  }, [user]);

  useEffect(() => {
    if (!supabaseAuth) {
      setLoading(false);
      return;
    }

    // Hydrate from cache first for instant UI
    if (typeof window !== "undefined") {
      try {
        const cached = window.localStorage.getItem(PROFILE_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as StaffProfile;
          if (parsed && parsed.id) setProfile(parsed);
        }
      } catch {
        /* ignore */
      }
    }

    // Get current session
    supabaseAuth.auth
      .getSession()
      .then(({ data: { session } }) => {
        console.log('[AUTH DEBUG] Init getSession:', { hasSession: !!session, userId: session?.user?.id });
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchUserProfile(session.user.id).then((p) => {
            console.log('[AUTH DEBUG] Init profile fetch done:', { hasProfile: !!p, role: p?.role });
            setProfile(p);
            if (p && typeof window !== "undefined") {
              try {
                window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
              } catch {
                /* ignore */
              }
            }
            setLoading(false);
          });
        } else {
          setProfile(null);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
      console.log('[AUTH DEBUG] onAuthStateChange:', { event: _event, hasUser: !!session?.user, userId: session?.user?.id });
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem(PROFILE_CACHE_KEY);
          } catch {
            /* ignore */
          }
        }
      } else {
        fetchUserProfile(session.user.id).then((p) => {
          setProfile(p);
          if (p && typeof window !== "undefined") {
            try {
              window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
            } catch {
              /* ignore */
            }
          }
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      if (!supabaseAuth) {
        console.log('[AUTH DEBUG] signIn: supabaseAuth is null - service unavailable');
        return { error: "Authentication service unavailable" };
      }

      console.log('[AUTH DEBUG] signIn: calling supabase.signInWithPassword for', email);
      const { data, error } = await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      });

      console.log('[AUTH DEBUG] signIn: Supabase result:', { hasUser: !!data?.user, error: error?.message ?? null });

      if (error) {
        console.log('[AUTH DEBUG] signIn: Supabase auth error:', error.message);
        return { error: error.message };
      }
      if (!data.user) {
        console.log('[AUTH DEBUG] signIn: No user returned from Supabase');
        return { error: "Login failed" };
      }

      console.log('[AUTH DEBUG] signIn: Auth user:', { id: data.user.id, email: data.user.email });

      const session = await supabaseAuth.auth.getSession();
      console.log('[AUTH DEBUG] signIn: Session after login:', { hasSession: !!session?.data?.session });

      console.log('[AUTH DEBUG] signIn: Fetching staff profile...');
      const p = await fetchUserProfile(data.user.id);
      console.log('[AUTH DEBUG] signIn: Staff profile:', p);

      if (!p) {
        console.log('[AUTH DEBUG] signIn: NO staff profile found - signing out');
        await supabaseAuth.auth.signOut();
        return { error: "No staff profile found. Contact an administrator." };
      }

      console.log('[AUTH DEBUG] signIn: Role:', p.role, '| Active:', p.active);

      if (!p.active) {
        console.log('[AUTH DEBUG] signIn: Account is deactivated - signing out');
        await supabaseAuth.auth.signOut();
        return { error: "Your account has been deactivated. Contact an administrator." };
      }

      console.log('[AUTH DEBUG] signIn: Setting user and profile state');
      setUser(data.user);
      setProfile(p);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
        } catch {
          /* ignore */
        }
      }

      console.log('[AUTH DEBUG] signIn: SUCCESS - returning null error');
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    setProfile(null);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(PROFILE_CACHE_KEY);
      } catch {
        /* ignore */
      }
    }
    if (supabaseAuth) await supabaseAuth.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, signIn, signOut, refreshProfile }),
    [user, profile, loading, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
