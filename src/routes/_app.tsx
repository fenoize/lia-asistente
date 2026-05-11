import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { QuickCapture } from "@/components/quick-capture";
import { Skeleton } from "@/components/ui/skeleton";

// In-memory cache: once we've confirmed onboarding for a user in this tab,
// skip the DB roundtrip on every subsequent module navigation.
const onboardedUsers = new Set<string>();

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoading = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const [authGateReady, setAuthGateReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      if (loading) return;

      if (!session) {
        setAuthGateReady(false);
        navigate({ to: "/login", replace: true });
        return;
      }

      if (onboardedUsers.has(session.user.id)) {
        setAuthGateReady(true);
        return;
      }

      setAuthGateReady(false);

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (!profile?.onboarding_completed) {
        navigate({ to: "/onboarding", replace: true });
        return;
      }

      onboardedUsers.add(session.user.id);
      setAuthGateReady(true);
    }

    verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [session, loading, navigate]);

  if (loading || !authGateReady) {
    return (
      <div className="min-h-screen flex w-full" style={{ background: "var(--bg-base)" }}>
        {session ? <AppSidebar /> : null}
        <main
          className="flex-1 min-w-0 overflow-y-auto h-screen"
          style={{ background: "var(--bg-base)" }}
        >
          <div className="alfred-page h-full">
            <div className="alfred-page-shell">
              <div className="space-y-4 px-6 py-6 md:px-8">
                <Skeleton className="h-8 w-40 rounded-full bg-white/5" />
                <Skeleton className="h-24 w-full rounded-xl bg-white/5" />
                <Skeleton className="h-24 w-full rounded-xl bg-white/5" />
                <Skeleton className="h-24 w-full rounded-xl bg-white/5" />
              </div>
            </div>
          </div>
        </main>
        <QuickCapture />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full" style={{ background: "var(--bg-base)" }}>
      <AppSidebar />
      <main
        className="flex-1 min-w-0 overflow-y-auto h-screen relative"
        style={{ background: "var(--bg-base)" }}
      >
        {isLoading && (
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0,
              height: 2,
              background: "linear-gradient(90deg, transparent, #6366f1, transparent)",
              animation: "alfredTopBar 1s linear infinite",
              zIndex: 50,
            }}
          />
        )}
        <div key={pathname} className="alfred-page h-full">
          <div className="alfred-page-shell">
            <Outlet />
          </div>
        </div>
      </main>
      <QuickCapture />
    </div>
  );
}
