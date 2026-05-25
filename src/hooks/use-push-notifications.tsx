import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lia.push.consent"; // "granted" | "denied" | null
const ASKED_KEY = "lia.push.asked";
const ONESIGNAL_READY_TIMEOUT_MS = 6000;
const PERMISSION_TIMEOUT_MS = 7000;
const PLAYER_ID_RETRIES = 12;
const PLAYER_ID_DELAY_MS = 300;

type Consent = "granted" | "denied" | null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCurrentPermission(): NotificationPermission | "default" {
  return typeof Notification !== "undefined" ? Notification.permission : "default";
}

function getOneSignal(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const current = (window as any).OneSignal;
    if (current) return resolve(current);
    const deferred = (window as any).OneSignalDeferred;
    if (!deferred) return resolve(null);

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, ONESIGNAL_READY_TIMEOUT_MS);

    deferred.push((OS: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(OS);
    });
  });
}

async function waitForPermissionChange(OS: any, timeoutMs: number) {
  if (getCurrentPermission() !== "default") return getCurrentPermission();

  return await new Promise<NotificationPermission | "default">((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      try {
        OS?.Notifications?.removeEventListener?.("permissionChange", onChange);
      } catch {
        // ignore
      }
      resolve(getCurrentPermission());
    };

    const onChange = () => {
      if (getCurrentPermission() !== "default") finish();
    };

    const intervalId = window.setInterval(onChange, 250);
    const timeoutId = window.setTimeout(finish, timeoutMs);

    try {
      OS?.Notifications?.addEventListener?.("permissionChange", onChange);
    } catch {
      // ignore
    }

    onChange();
  });
}

async function waitForPlayerId(OS: any) {
  let playerId: string | undefined = OS?.User?.PushSubscription?.id;
  for (let i = 0; i < PLAYER_ID_RETRIES && !playerId; i++) {
    await sleep(PLAYER_ID_DELAY_MS);
    playerId = OS?.User?.PushSubscription?.id;
  }
  return playerId;
}

export function usePushNotifications() {
  const [consent, setConsent] = useState<Consent>(() => {
    if (typeof window === "undefined") return null;
    return (localStorage.getItem(STORAGE_KEY) as Consent) ?? null;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "default">(
    getCurrentPermission(),
  );
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      const OS = await getOneSignal();
      if (!OS || cancelled) return;

      try {
        const onChange = () => {
          if (cancelled) return;
          setIsSubscribed(!!OS.User?.PushSubscription?.optedIn);
          setPermission(getCurrentPermission());
        };

        onChange();
        OS.User?.PushSubscription?.addEventListener?.("change", onChange);
        OS.Notifications?.addEventListener?.("permissionChange", onChange);

        cleanup = () => {
          OS.User?.PushSubscription?.removeEventListener?.("change", onChange);
          OS.Notifications?.removeEventListener?.("permissionChange", onChange);
        };
      } catch {
        setSupported(false);
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  const enable = useCallback(async () => {
    setLoading(true);

    try {
      const OS = await getOneSignal();
      if (!OS) {
        setSupported(false);
        return;
      }

      let requestError: unknown = null;
      const requestPromise = Promise.resolve(OS.Notifications?.requestPermission?.())
        .catch((error) => {
          requestError = error;
          return null;
        });

      await Promise.race([
        requestPromise,
        waitForPermissionChange(OS, PERMISSION_TIMEOUT_MS),
      ]);

      const permAfterRequest = getCurrentPermission();

      if (permAfterRequest === "default") {
        await waitForPermissionChange(OS, 1500);
      }

      if (requestError) {
        throw requestError;
      }

      try {
        await Promise.race([
          Promise.resolve(OS.User?.PushSubscription?.optIn?.()),
          sleep(2000),
        ]);
      } catch {
        // ignore
      }

      const playerId = await waitForPlayerId(OS);
      const perm = getCurrentPermission();
      const sub = !!OS.User?.PushSubscription?.optedIn || !!playerId;

      setPermission(perm);
      setIsSubscribed(sub);

      if (perm === "granted" && playerId) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();

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
      localStorage.setItem(ASKED_KEY, "1");
      localStorage.setItem(STORAGE_KEY, "denied");
      setConsent("denied");
      setPermission(getCurrentPermission());
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setLoading(true);
    try {
      const OS = await getOneSignal();
      if (OS) {
        try {
          await Promise.race([
            Promise.resolve(OS.User?.PushSubscription?.optOut?.()),
            sleep(2000),
          ]);
        } catch {
          // ignore
        }
      }
      setIsSubscribed(false);
      setPermission(getCurrentPermission());
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
