import { useEffect, useState } from "react";
import { IconBell, IconX } from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushConsentModal() {
  const { user } = useAuth();
  const { hasBeenAsked, enable, dismiss, loading, supported, sdkReady } = usePushNotifications();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !loading) return;

    const timer = setTimeout(() => {
      setOpen(false);
      console.error("Push notification modal timed out after 12 seconds.");
    }, 12000);

    return () => clearTimeout(timer);
  }, [open, loading]);

  useEffect(() => {
    if (!user || !supported) return;
    if (hasBeenAsked) return;
    if (typeof Notification === "undefined") return;
    // If browser already granted or denied at OS level, mark as asked silently
    if (Notification.permission !== "default") {
      localStorage.setItem("lia.push.asked", "1");
      localStorage.setItem(
        "lia.push.consent",
        Notification.permission === "granted" ? "granted" : "denied",
      );
      return;
    }
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [user, hasBeenAsked, supported]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 28,
          maxWidth: 400,
          width: "100%",
          position: "relative",
        }}
      >
        <button
          onClick={() => {
            dismiss();
            setOpen(false);
          }}
          aria-label="Cerrar"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            color: "var(--text-tertiary)",
          }}
        >
          <IconX size={18} />
        </button>

        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "var(--accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <IconBell size={24} color="var(--accent-color)" stroke={1.5} />
        </div>

        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 8,
            letterSpacing: "-0.01em",
          }}
        >
          Activa las notificaciones
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            marginBottom: 22,
          }}
        >
          Recibe avisos de tus reuniones, recordatorios y tareas importantes. Puedes cambiar
          esto cuando quieras desde Ajustes.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              dismiss();
              setOpen(false);
            }}
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              padding: "9px 18px",
              fontSize: 13,
            }}
          >
            Ahora no
          </button>
          <button
            disabled={loading || !sdkReady}
            onClick={async () => {
              try {
                if (typeof Notification !== "undefined" && Notification.permission === "default") {
                  await Notification.requestPermission();
                }

                await enable();
              } catch (err) {
                console.error("push error", err);
              } finally {
                setOpen(false);
              }
            }}
            style={{
              background: "var(--accent-color)",
              color: "white",
              borderRadius: "var(--radius-pill)",
              padding: "9px 22px",
              fontSize: 13,
              fontWeight: 500,
              opacity: loading || !sdkReady ? 0.5 : 1,
            }}
          >
            {loading ? "Activando…" : sdkReady ? "Activar" : "Preparando…"}
          </button>
        </div>
      </div>
    </div>
  );
}
