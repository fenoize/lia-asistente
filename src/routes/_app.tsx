import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { QuickCapture } from "@/components/quick-capture";
import { LiaSplash } from "@/components/lia-splash";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { ChatStoreProvider } from "@/hooks/use-chat-store";
import { PrefetchStoreProvider, usePrefetchStore } from "@/hooks/use-prefetch-store";
import { PostLoginLoader } from "@/components/post-login-loader";

// In-memory cache: once we've confirmed onboarding for a user in this tab,
// skip the DB roundtrip on every subsequent module navigation.
const onboardedUsers = new Set<string>();
// Module-scope so the post-login loader never re-appears within a tab,
// even if the auth gate above briefly remounts the provider tree.
const prefetchedUserIds = new Set<string>();

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoading = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  // Lazy init: if we've already cleared this user during the tab's lifetime,
  // skip the splash entirely on subsequent renders/remounts.
  const [authGateReady, setAuthGateReady] = useState(
    () => !!session && onboardedUsers.has(session.user.id),
  );


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
    return <LiaSplash />;
  }

  return (
    <PrefetchStoreProvider>
      <ChatStoreProvider>
        <AppContent pathname={pathname} isLoading={isLoading} userId={session!.user.id} />
      </ChatStoreProvider>
    </PrefetchStoreProvider>
  );
}

function AppContent({ pathname, isLoading, userId }: { pathname: string; isLoading: boolean; userId: string }) {
  const [showLoader, setShowLoader] = useState(() => !prefetchedUserIds.has(userId));

  if (showLoader) {
    return (
      <PostLoginLoader
        userId={userId}
        onDone={() => {
          prefetchedUserIds.add(userId);
          setShowLoader(false);
        }}
      />
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
        <MobileTopBar />
        <div
          key={pathname}
          className={pathname === "/chat" ? "alfred-page alfred-chat-route-frame" : "alfred-page h-full"}
        >
          {pathname === "/chat" ? (
            <Outlet />
          ) : (
            <div className="alfred-page-shell">
              <Outlet />
            </div>
          )}
        </div>
      </main>
      <QuickCapture />
      <MobileBottomNav />
    </div>
  );
}
