import { useEffect, useMemo, useState } from "react";
import { IconBell, IconBellOff } from "@tabler/icons-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function PushNotificationsSettings() {
  const { user } = useAuth();
  const { isSubscribed, permission, loading, enable, disable, supported, sdkReady, playerId } =
    usePushNotifications();
  const [storedPlayerId, setStoredPlayerId] = useState<string | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const blocked = permission === "denied";
  const maskedPlayerId = useMemo(
    () => (playerId ? `${playerId.slice(0, 8)}...` : "—"),
    [playerId],
  );
  const isSavedInProfile = !!playerId && !!storedPlayerId && storedPlayerId === playerId;

  useEffect(() => {
    if (!user) {
      setStoredPlayerId(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setCheckingProfile(true);
      const { data } = await supabase
        .from("profiles")
        .select("onesignal_player_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setStoredPlayerId((data as any)?.onesignal_player_id ?? null);
        setCheckingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, playerId]);

  const testNotification = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-notifications", {
        body: {},
      });

      if (error) {
        setTestResult(`Error: ${error.message}`);
        return;
      }

      setTestResult(`sent: ${data?.sent ?? 0}, skipped: ${data?.skipped ?? 0}`);
    } catch (error) {
      setTestResult(error instanceof Error ? `Error: ${error.message}` : "Error inesperado");
    } finally {
      setTesting(false);
    }
  };

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
          Notificaciones
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

      <div
        style={{
          marginTop: 18,
          paddingTop: 18,
          borderTop: "1px solid var(--border-subtle)",
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
            fontWeight: 600,
          }}
        >
          Diagnóstico
        </div>

        <DiagnosticRow label="Permiso del navegador" value={permission} />
        <DiagnosticRow label="OneSignal inicializado" value={sdkReady ? "Sí" : "No"} />
        <DiagnosticRow label="Player ID actual" value={maskedPlayerId} />
        <DiagnosticRow
          label="Player ID guardado"
          value={checkingProfile ? "Verificando…" : isSavedInProfile ? "Sí" : "No"}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            onClick={testNotification}
            disabled={testing}
            style={{
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              padding: "9px 18px",
              fontSize: 13,
              opacity: testing ? 0.5 : 1,
            }}
          >
            {testing ? "Probando…" : "Probar notificación"}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {testResult ?? "Aún sin prueba manual."}
          </span>
        </div>
      </div>
    </section>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
