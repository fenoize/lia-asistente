import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconVenus, IconMars, IconRefresh, IconReload, IconEyeOff, IconChevronDown } from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PushNotificationsSettings } from "@/components/push-notifications-settings";
import { usePwaUpdate } from "@/hooks/use-pwa-update";
import { useHideAmounts } from "@/hooks/use-hide-amounts";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

type Gender = "feminine" | "masculine";

function SettingsPage() {
  const { user } = useAuth();
  const { hasUpdate, checking, update, skipWaiting } = usePwaUpdate();
  const { hidden: hideAmounts, set: setHideAmounts } = useHideAmounts();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState("");
  const [name, setName] = useState("Lia");
  const [gender, setGender] = useState<Gender>("feminine");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("name, assistant_name, assistant_gender")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setUserName(((data as any).name ?? "").split(" ")[0] || "");
        setName((data as any).assistant_name || "Lia");
        setGender(((data as any).assistant_gender === "masculine" ? "masculine" : "feminine"));
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    const finalName = name.trim() || "Lia";
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ assistant_name: finalName, assistant_gender: gender })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Guardado ✓");
  };

  const greetingPreview =
    gender === "feminine"
      ? `Hola ${userName || "tú"}. Soy ${name.trim() || "Lia"} y estoy lista para ayudarte a organizar tu semana.`
      : `Hola ${userName || "tú"}. Soy ${name.trim() || "Lia"} y estoy listo para ayudarte a organizar tu semana.`;

  return (
    <div className="mx-auto" style={{ maxWidth: 640, padding: "40px 24px" }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          marginBottom: 4,
        }}
      >
        Ajustes
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 32 }}>
        Personaliza tu experiencia.
      </p>

      <section
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "24px",
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
          Tu asistente
        </div>

        <label
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 6,
          }}
        >
          Nombre
        </label>
        <input
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
          placeholder="Ej: Lia, Max, Nova, Alex..."
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            fontSize: 14,
            color: "var(--text-primary)",
            marginBottom: 24,
          }}
        />

        <label
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 8,
          }}
        >
          Personalidad
        </label>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <PersonaCard
            active={gender === "feminine"}
            onClick={() => setGender("feminine")}
            Icon={IconVenus}
            label="Femenina"
            caption="Cercana, cálida, estratégica"
          />
          <PersonaCard
            active={gender === "masculine"}
            onClick={() => setGender("masculine")}
            Icon={IconMars}
            label="Masculina"
            caption="Directo, sólido, estratégico"
          />
        </div>

        <div
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "14px 16px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Vista previa
          </div>
          <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>
            {greetingPreview}
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving || loading}
          style={{
            background: "var(--accent-color)",
            color: "white",
            borderRadius: "var(--radius-pill)",
            padding: "9px 22px",
            fontSize: 13,
            fontWeight: 500,
            opacity: saving || loading ? 0.5 : 1,
          }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </section>

      <PushNotificationsSettings />

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
          Privacidad
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconEyeOff size={20} color="var(--text-tertiary)" stroke={1.5} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
              Ocultar montos
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
              Reemplaza los montos en Finanzas por puntos.
            </div>
          </div>
          <button
            onClick={() => setHideAmounts(!hideAmounts)}
            aria-pressed={hideAmounts}
            style={{
              width: 44,
              height: 26,
              borderRadius: 100,
              background: hideAmounts ? "var(--accent-color)" : "var(--border)",
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: hideAmounts ? 21 : 3,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "white",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>
      </section>


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
          Aplicación
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: hasUpdate ? "var(--accent-subtle)" : "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {hasUpdate ? (
              <IconReload size={20} color="var(--accent-color)" stroke={1.5} />
            ) : (
              <IconRefresh size={20} color="var(--text-tertiary)" stroke={1.5} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
              {hasUpdate ? "Actualización disponible" : "Versión actual"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
              {hasUpdate
                ? "Hay una nueva versión. Reinicia para aplicarla."
                : "Buscando actualizaciones…"}
            </div>
          </div>
        </div>

        {hasUpdate ? (
          <button
            onClick={skipWaiting}
            style={{
              background: "var(--accent-color)",
              color: "white",
              borderRadius: "var(--radius-pill)",
              padding: "9px 22px",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Reiniciar y actualizar
          </button>
        ) : (
          <button
            onClick={update}
            disabled={checking}
            style={{
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              padding: "9px 22px",
              fontSize: 13,
              opacity: checking ? 0.5 : 1,
            }}
          >
            {checking ? "Buscando…" : "Buscar actualizaciones"}
          </button>
        )}
      </section>
    </div>
  );
}

function PersonaCard({
  active,
  onClick,
  Icon,
  label,
  caption,
}: {
  active: boolean;
  onClick: () => void;
  Icon: React.ComponentType<{ size?: number; stroke?: number; color?: string }>;
  label: string;
  caption: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-center transition-colors"
      style={{
        border: `${active ? 2 : 1}px solid ${active ? "var(--accent-color)" : "var(--border)"}`,
        background: active ? "var(--accent-subtle)" : "transparent",
        borderRadius: "var(--radius-lg)",
        padding: active ? "19px" : "20px",
      }}
    >
      <div className="flex items-center justify-center mb-2">
        <Icon
          size={24}
          stroke={1.5}
          color={active ? "var(--accent-color)" : "var(--text-secondary)"}
        />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: active ? "var(--accent-color)" : "var(--text-primary)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 11,
          color: "var(--text-tertiary)",
          lineHeight: 1.4,
        }}
      >
        {caption}
      </div>
    </button>
  );
}
