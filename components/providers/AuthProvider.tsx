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

type ProfileLookupResult = {
  profile: StaffProfile | null;
  error: { code?: string; message: string } | null;
};

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

async function fetchUserProfile(userId: string): Promise<ProfileLookupResult> {
  if (!supabaseAuth) {
    return { profile: null, error: { message: "Authentication service is unavailable." } };
  }

  try {
    const { data, error } = await supabaseAuth
      .from("staff_profiles")
      .select("id, email, name, role, canteen_id, active")
      .eq("id", userId)
      .maybeSingle();

    if (error) return { profile: null, error };
    if (!data) return { profile: null, error: null };

    let driverId: string | null = null;
    if (data.role === "driver") {
      const { data: driverProfile, error: driverProfileError } = await supabaseAuth
        .from("staff_profiles")
        .select("driver_id")
        .eq("id", userId)
        .maybeSingle();
      if (driverProfileError) return { profile: null, error: driverProfileError };
      driverId = driverProfile?.driver_id ?? null;
    }

    return {
      profile: {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role,
        canteen_id: data.canteen_id ?? null,
        driver_id: driverId,
        active: data.active,
      },
      error: null,
    };
  } catch (error) {
    return {
      profile: null,
      error: {
        message: error instanceof Error ? error.message : "Unknown profile lookup failure.",
      },
    };
  }
}

function getProfileLookupErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "42501" || /permission denied|row-level security/i.test(error.message)) {
    return "Your staff profile could not be read because of a database permission error. Contact an administrator.";
  }
  if (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /driver_id.*(column|schema cache)|(column|schema cache).*driver_id/i.test(error.message)
  ) {
    return "Staff profile mapping is not available in the database yet. Ask an administrator to apply the rider access migration.";
  }
  return "Unable to load your staff profile. Check your network connection and try again.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabaseAuth));

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const result = await fetchUserProfile(user.id);
    if (result.error) {
      console.error("[UniEats Auth] Staff profile refresh failed:", {
        code: result.error.code,
        message: result.error.message,
      });
      setProfile(null);
      return;
    }
    const p = result.profile;
    setProfile(p?.active ? p : null);
    if (p?.active && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    }
  }, [user]);

  useEffect(() => {
    if (!supabaseAuth) return;

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

      const result = await fetchUserProfile(session.user.id);
      if (!isMounted) return;
      if (result.error) {
        console.error("[UniEats Auth] Staff profile lookup failed:", {
          code: result.error.code,
          message: result.error.message,
        });
        setProfile(null);
        if (initial) setLoading(false);
        return;
      }
      const nextProfile = result.profile;
      setProfile(nextProfile?.active ? nextProfile : null);
      if (nextProfile?.active && typeof window !== "undefined") {
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

      try {
        const { data, error } = await supabaseAuth.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          if (error.code === "invalid_credentials") {
            return { error: "Invalid email or password." };
          }
          if (error.code === "email_not_confirmed") {
            return { error: "Your email address has not been confirmed. Contact an administrator." };
          }
          if (error.code === "too_many_requests") {
            return { error: "Too many login attempts. Wait a few minutes and try again." };
          }
          console.error("[UniEats Auth] Sign-in failed:", {
            code: error.code,
            message: error.message,
          });
          return { error: "Authentication failed. Check your connection and try again." };
        }
        if (!data.user || !data.session) {
          return { error: "Authentication succeeded without an active session. Please try again." };
        }

        const { data: sessionData, error: sessionError } =
          await supabaseAuth.auth.getSession();
        if (
          sessionError ||
          !sessionData.session ||
          sessionData.session.user.id !== data.user.id
        ) {
          console.error("[UniEats Auth] Session verification failed:", {
            code: sessionError?.code,
            message: sessionError?.message,
          });
          await supabaseAuth.auth.signOut();
          return { error: "Your login session could not be established. Please try again." };
        }

        const result = await fetchUserProfile(data.user.id);
        if (result.error) {
          console.error("[UniEats Auth] Staff profile lookup failed after sign-in:", {
            code: result.error.code,
            message: result.error.message,
          });
          await supabaseAuth.auth.signOut();
          return { error: getProfileLookupErrorMessage(result.error) };
        }
        if (!result.profile) {
          await supabaseAuth.auth.signOut();
          return { error: "No staff profile is linked to this account. Contact an administrator." };
        }
        if (!result.profile.active) {
          await supabaseAuth.auth.signOut();
          return { error: "Your staff profile is inactive. Contact an administrator." };
        }
        if (result.profile.role === "driver" && !result.profile.driver_id) {
          await supabaseAuth.auth.signOut();
          return { error: "Your driver account is not linked to a driver record. Contact an administrator." };
        }

        setUser(data.user);
        setProfile(result.profile);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              PROFILE_CACHE_KEY,
              JSON.stringify(result.profile),
            );
          } catch {
            /* ignore */
          }
        }

        return { error: null };
      } catch (error) {
        console.error("[UniEats Auth] Unexpected sign-in failure:", error);
        return {
          error: "Unable to complete sign-in because of a network or authentication service error.",
        };
      }
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
