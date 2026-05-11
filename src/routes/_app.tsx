import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { QuickCapture } from "@/components/quick-capture";

// In-memory cache: once we've confirmed onboarding for a user in this tab,
// skip the DB roundtrip on every subsequent module navigation.
const onboardedUsers = new Set<string>();

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });

    if (onboardedUsers.has(session.user.id)) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!profile?.onboarding_completed) throw redirect({ to: "/onboarding" });
    onboardedUsers.add(session.user.id);
  },
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoading = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [session, loading, navigate]);

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
