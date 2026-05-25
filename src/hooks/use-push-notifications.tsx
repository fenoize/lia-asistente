import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lia.push.consent"; // "granted" | "denied" | null
const ASKED_KEY = "lia.push.asked";

type Consent = "granted" | "denied" | null;

function getOneSignal(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const deferred = (window as any).OneSignalDeferred;
    if (!deferred) return resolve(null);
    deferred.push((OS: any) => resolve(OS));
  });
}

export function usePushNotifications() {
  const [consent, setConsent] = useState<Consent>(() => {
    if (typeof window === "undefined") return null;
    return (localStorage.getItem(STORAGE_KEY) as Consent) ?? null;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "default">(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const OS = await getOneSignal();
      if (!OS || cancelled) return;
      try {
        const sub = !!OS.User?.PushSubscription?.optedIn;
        setIsSubscribed(sub);
        if (typeof Notification !== "undefined") setPermission(Notification.permission);
        const onChange = () => {
          setIsSubscribed(!!OS.User?.PushSubscription?.optedIn);
          if (typeof Notification !== "undefined") setPermission(Notification.permission);
        };
        OS.User.PushSubscription.addEventListener("change", onChange);
        OS.Notifications.addEventListener?.("permissionChange", onChange);
        return () => {
          OS.User.PushSubscription.removeEventListener("change", onChange);
          OS.Notifications.removeEventListener?.("permissionChange", onChange);
        };
      } catch {
        setSupported(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setLoading(true);
    try {
      const OS = await getOneSignal();
      if (!OS) return;
      await OS.Notifications.requestPermission();
      try { await OS.User.PushSubscription.optIn(); } catch { /* ignore */ }

      // On mobile PWA, the subscription id can take a moment to populate.
      let playerId: string | undefined = OS.User?.PushSubscription?.id;
      for (let i = 0; i < 8 && !playerId; i++) {
        await new Promise((r) => setTimeout(r, 250));
        playerId = OS.User?.PushSubscription?.id;
      }

      const perm =
        typeof Notification !== "undefined" ? Notification.permission : "default";
      setPermission(perm);
      const sub = !!OS.User?.PushSubscription?.optedIn || !!playerId;
      setIsSubscribed(sub);

      if (perm === "granted" && playerId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from("profiles")
              .update({ onesignal_player_id: playerId })
              .eq("id", user.id);
          }
        } catch (err) {
          console.error("Failed to save OneSignal player id:", err);
        }
      }

      const result: Consent = perm === "granted" ? "granted" : "denied";
      localStorage.setItem(STORAGE_KEY, result);
      localStorage.setItem(ASKED_KEY, "1");
      setConsent(result);
    } catch (error) {
      console.error("OneSignal permission error:", error);
      try {
        localStorage.setItem(ASKED_KEY, "1");
        localStorage.setItem(STORAGE_KEY, "denied");
        setConsent("denied");
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setLoading(true);
    try {
      const OS = await getOneSignal();
      if (OS) {
        try { await OS.User.PushSubscription.optOut(); } catch { /* ignore */ }
      }
      setIsSubscribed(false);
      localStorage.setItem(STORAGE_KEY, "denied");
      localStorage.setItem(ASKED_KEY, "1");
      setConsent("denied");
    } finally {
      setLoading(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(ASKED_KEY, "1");
    localStorage.setItem(STORAGE_KEY, "denied");
    setConsent("denied");
  }, []);

  const hasBeenAsked =
    typeof window !== "undefined" && localStorage.getItem(ASKED_KEY) === "1";

  return {
    consent,
    isSubscribed,
    permission,
    loading,
    supported,
    hasBeenAsked,
    enable,
    disable,
    dismiss,
  };
}
