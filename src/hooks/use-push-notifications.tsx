import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lia.push.consent"; // "granted" | "denied" | null
const ASKED_KEY = "lia.push.asked";

type Consent = "granted" | "denied" | null;

function getOS(): any {
  if (typeof window === "undefined") return null;
  return (window as any).OneSignal ?? null;
}

function isReady(OS: any) {
  return !!OS?.Notifications && !!OS?.User?.PushSubscription;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPermission(): NotificationPermission | "default" {
  return typeof Notification !== "undefined" ? Notification.permission : "default";
}

async function savePlayerId(playerId: string) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    await supabase
      .from("profiles")
      .update({ onesignal_player_id: playerId })
      .eq("id", userId);
  } catch (err) {
    console.error("[push] failed to save player id", err);
  }
}

export function usePushNotifications() {
  const osRef = useRef<any>(getOS());
  const [sdkReady, setSdkReady] = useState(() => isReady(osRef.current));
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "default">(
    getPermission(),
  );
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return "Notification" in window && "serviceWorker" in navigator;
  });

  // Wait for OneSignal SDK to be ready (via OneSignalDeferred)
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const attach = (OS: any) => {
      if (cancelled || !isReady(OS)) return;
      osRef.current = OS;
      setSdkReady(true);

      const refresh = () => {
        if (cancelled) return;
        setIsSubscribed(!!OS.User?.PushSubscription?.optedIn);
        setPermission(getPermission());
      };

      refresh();

      try {
        OS.User.PushSubscription.addEventListener?.("change", refresh);
        OS.Notifications.addEventListener?.("permissionChange", refresh);
      } catch (err) {
        console.warn("[push] failed to attach listeners", err);
      }
    };

    const current = getOS();
    if (isReady(current)) {
      attach(current);
    } else {
      const deferred = ((window as any).OneSignalDeferred =
        (window as any).OneSignalDeferred || []);
      deferred.push((OS: any) => attach(OS));
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    // CRITICAL: call requestPermission synchronously inside the user gesture.
    // Any await before this breaks the gesture chain on mobile Safari/Chrome PWA.
    const OS = osRef.current ?? getOS();

    if (!OS || !isReady(OS)) {
      console.warn("[push] OneSignal SDK not ready yet");
      return;
    }

    setLoading(true);

    // Fire requestPermission IMMEDIATELY without awaiting anything first.
    const requestPromise: Promise<unknown> = (() => {
      try {
        const r = OS.Notifications?.requestPermission?.();
        return Promise.resolve(r).catch((e) => {
          console.error("[push] requestPermission threw", e);
          return null;
        });
      } catch (e) {
        console.error("[push] requestPermission sync throw", e);
        return Promise.resolve(null);
      }
    })();

    try {
      // Wait for the browser permission dialog to resolve (user accepts/denies).
      await requestPromise;

      const perm = getPermission();
      setPermission(perm);
      console.log("[push] permission after request:", perm);

      if (perm !== "granted") {
        localStorage.setItem(STORAGE_KEY, "denied");
        localStorage.setItem(ASKED_KEY, "1");
        setIsSubscribed(false);
        return;
      }

      // Permission granted: opt in to OneSignal (creates subscription).
      try {
        await OS.User?.PushSubscription?.optIn?.();
      } catch (e) {
        console.warn("[push] optIn failed (continuing)", e);
      }

      // Poll for the player/subscription id — may take a few seconds on mobile PWA.
      let playerId: string | undefined = OS.User?.PushSubscription?.id;
      for (let i = 0; i < 20 && !playerId; i++) {
        await sleep(500);
        playerId = OS.User?.PushSubscription?.id;
      }

      console.log("[push] player id:", playerId);

      if (playerId) {
        await savePlayerId(playerId);
        setIsSubscribed(true);
        localStorage.setItem(STORAGE_KEY, "granted");
        localStorage.setItem(ASKED_KEY, "1");
      } else {
        console.warn(
          "[push] permission granted but no subscription id was created. " +
            "The service worker may not be registered correctly.",
        );
        // Still record they tried so we don't loop the prompt
        localStorage.setItem(ASKED_KEY, "1");
        setIsSubscribed(!!OS.User?.PushSubscription?.optedIn);
      }
    } catch (err) {
      console.error("[push] enable error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setLoading(true);
    try {
      const OS = osRef.current ?? getOS();
      if (OS) {
        try {
          await OS.User?.PushSubscription?.optOut?.();
        } catch (e) {
          console.warn("[push] optOut failed", e);
        }
      }
      setIsSubscribed(false);
      setPermission(getPermission());
      localStorage.setItem(STORAGE_KEY, "denied");
      localStorage.setItem(ASKED_KEY, "1");
    } finally {
      setLoading(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(ASKED_KEY, "1");
    localStorage.setItem(STORAGE_KEY, "denied");
  }, []);

  const hasBeenAsked =
    typeof window !== "undefined" && localStorage.getItem(ASKED_KEY) === "1";

  const consent: Consent =
    typeof window !== "undefined"
      ? ((localStorage.getItem(STORAGE_KEY) as Consent) ?? null)
      : null;

  return {
    consent,
    isSubscribed,
    permission,
    loading,
    supported,
    sdkReady,
    hasBeenAsked,
    enable,
    disable,
    dismiss,
  };
}
