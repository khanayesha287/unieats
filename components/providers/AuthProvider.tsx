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
import type { Session, User } from "@supabase/supabase-js";
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
    return null;
  }
  const { data, error } = await supabaseAuth
    .from("staff_profiles")
    .select("id, email, name, role, canteen_id, active")
    .eq("id", userId)
    .maybeSingle();

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

    let isMounted = true;

    const clearCachedProfile = () => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(PROFILE_CACHE_KEY);
      } catch {
        /* ignore */
      }
    };

    const applySession = async (session: Session | null, initial = false) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        clearCachedProfile();
        if (initial) setLoading(false);
        return;
      }

      const nextProfile = await fetchUserProfile(session.user.id);
      if (!isMounted) return;
      setProfile(nextProfile);
      if (nextProfile && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
        } catch {
          /* ignore */
        }
      }
      if (initial) setLoading(false);
    };

    supabaseAuth.auth
      .getSession()
      .then(({ data: { session } }) => applySession(session, true))
      .catch(() => {
        if (isMounted) {
          setUser(null);
          setProfile(null);
          clearCachedProfile();
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      if (!supabaseAuth) {
        return { error: "Authentication service unavailable" };
      }

      const { data, error } = await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      });


      if (error) {
        return { error: error.message };
      }
      if (!data.user) {
        return { error: "Login failed" };
      }



      const p = await fetchUserProfile(data.user.id);

      if (!p) {
        await supabaseAuth.auth.signOut();
        return { error: "No staff profile found. Contact an administrator." };
      }


      if (!p.active) {
        await supabaseAuth.auth.signOut();
        return { error: "Your account has been deactivated. Contact an administrator." };
      }

      setUser(data.user);
      setProfile(p);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
        } catch {
          /* ignore */
        }
      }

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
