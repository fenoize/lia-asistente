import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { QuickCapture } from "@/components/quick-capture";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!profile?.onboarding_completed) throw redirect({ to: "/onboarding" });
  },
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [session, loading, navigate]);

  return (
    <div className="min-h-screen flex w-full" style={{ background: "var(--bg-base)" }}>
      <AppSidebar />
      <main
        className="flex-1 min-w-0 overflow-y-auto h-screen"
        style={{ background: "var(--bg-base)" }}
      >
        <Outlet />
      </main>
      <QuickCapture />
    </div>
  );
}
