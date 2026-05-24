import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Sync OneSignal push subscription id to profile once user is authenticated.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") return;
    const OneSignalDeferred = (window as any).OneSignalDeferred;
    if (!OneSignalDeferred) return;

    let cancelled = false;
    let listenerAttached: any = null;

    OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        try { await OneSignal.login(userId); } catch { /* ignore */ }

        const syncPlayerId = async () => {
          const playerId: string | undefined = OneSignal?.User?.PushSubscription?.id;
          if (!playerId || cancelled) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("onesignal_player_id")
            .eq("id", userId)
            .maybeSingle();
          if (cancelled) return;
          if (profile?.onesignal_player_id !== playerId) {
            await supabase
              .from("profiles")
              .update({ onesignal_player_id: playerId })
              .eq("id", userId);
          }
        };

        await syncPlayerId();
        listenerAttached = syncPlayerId;
        OneSignal.User.PushSubscription.addEventListener("change", syncPlayerId);
      } catch (err) {
        console.error("OneSignal sync error", err);
      }
    });

    return () => {
      cancelled = true;
      try {
        const OS = (window as any).OneSignal;
        if (OS && listenerAttached) {
          OS.User?.PushSubscription?.removeEventListener?.("change", listenerAttached);
        }
      } catch { /* ignore */ }
    };
  }, [session?.user?.id]);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
