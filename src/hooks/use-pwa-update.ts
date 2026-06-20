import { useCallback, useEffect, useRef, useState } from "react";

interface PwaUpdateState {
  hasUpdate: boolean;
  checking: boolean;
  forcing: boolean;
  update: () => void;
  skipWaiting: () => void;
  forceUpdate: () => Promise<void>;
}

export function usePwaUpdate(): PwaUpdateState {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let isActive = true;

    const handleUpdate = (reg: ServiceWorkerRegistration) => {
      if (!isActive) return;
      if (reg.waiting) {
        waitingRef.current = reg.waiting;
        setHasUpdate(true);
      }
      reg.addEventListener("updatefound", () => {
        if (!isActive) return;
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (!isActive) return;
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            waitingRef.current = newWorker;
            setHasUpdate(true);
          }
        });
      });
    };

    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (!isActive) return;
      regs.forEach(handleUpdate);
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!isActive) return;
      // A new service worker has taken control; page will reload naturally in some cases
    });

    return () => {
      isActive = false;
    };
  }, []);

  const update = useCallback(async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    setChecking(true);
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update()));
      // Give the browser a moment to process updates
      await new Promise((res) => setTimeout(res, 800));
      // Re-check for waiting workers
      const freshRegs = await navigator.serviceWorker.getRegistrations();
      let found = false;
      freshRegs.forEach((r) => {
        if (r.waiting) {
          waitingRef.current = r.waiting;
          found = true;
        }
      });
      setHasUpdate(found);
    } catch (e) {
      console.error("Error checking for updates:", e);
    } finally {
      setChecking(false);
    }
  }, []);

  const skipWaiting = useCallback(() => {
    const w = waitingRef.current;
    if (w) {
      w.postMessage({ type: "SKIP_WAITING" });
      // After skipWaiting, the controllerchange event should fire and refresh
      window.location.reload();
    }
  }, []);

  return { hasUpdate, checking, update, skipWaiting };
}
