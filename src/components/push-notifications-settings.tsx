import { IconBell, IconBellOff } from "@tabler/icons-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushNotificationsSettings() {
  const { isSubscribed, permission, loading, enable, disable, supported, sdkReady } =
    usePushNotifications();

  const blocked = permission === "denied";

  return (
    <section
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 24,
        marginTop: 24,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        Notificaciones push
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: isSubscribed ? "var(--accent-subtle)" : "var(--bg-base)",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isSubscribed ? (
            <IconBell size={20} color="var(--accent-color)" stroke={1.5} />
          ) : (
            <IconBellOff size={20} color="var(--text-tertiary)" stroke={1.5} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
            {isSubscribed ? "Activadas" : "Desactivadas"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
            {!supported
              ? "Tu navegador no admite notificaciones."
              : blocked && !isSubscribed
              ? "Bloqueadas en el navegador. Habilítalas desde el candado de la URL."
              : !sdkReady
              ? "Preparando el servicio de notificaciones en este dispositivo."
              : isSubscribed
              ? "Te avisaremos de reuniones, recordatorios y tareas."
              : "Activa para recibir avisos en este dispositivo."}
          </div>
        </div>
      </div>

      {isSubscribed ? (
        <button
          onClick={disable}
          disabled={loading}
          style={{
            background: "transparent",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-pill)",
            padding: "9px 22px",
            fontSize: 13,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Desactivando…" : "Desactivar"}
        </button>
      ) : (
        <button
          onClick={enable}
          disabled={loading || !supported || blocked || !sdkReady}
          style={{
            background: "var(--accent-color)",
            color: "white",
            borderRadius: "var(--radius-pill)",
            padding: "9px 22px",
            fontSize: 13,
            fontWeight: 500,
            opacity: loading || !supported || blocked || !sdkReady ? 0.5 : 1,
          }}
        >
          {loading ? "Activando…" : sdkReady ? "Activar notificaciones" : "Preparando…"}
        </button>
      )}
    </section>
  );
}
