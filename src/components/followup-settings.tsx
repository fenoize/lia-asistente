// Control centre for LIA's proactive follow-up engine.

import { useEffect, useState } from "react";
import { IconRadar } from "@tabler/icons-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalizePrefs } from "@/lib/followup/config";
import type { FollowUpPrefs } from "@/lib/followup/types";

const FREQUENCIES: { value: FollowUpPrefs["frequency"]; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "10px 0" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "#e6e6e6" }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: value ? "#6366f1" : "#2a2a2a",
        border: "1px solid #333",
        position: "relative",
        cursor: "pointer",
        transition: "background 160ms ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 22 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 160ms ease",
        }}
      />
    </button>
  );
}

export function FollowUpSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<FollowUpPrefs>(normalizePrefs(null));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase.from("profiles").select("followup_prefs").eq("id", user.id).maybeSingle();
      setPrefs(normalizePrefs((data as { followup_prefs?: unknown } | null)?.followup_prefs));
      setLoaded(true);
    })();
  }, [user?.id]);

  const save = async (next: FollowUpPrefs) => {
    setPrefs(next);
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ followup_prefs: next } as never)
      .eq("id", user.id);
    if (error) toast.error("No pude guardar la preferencia");
  };

  if (!loaded) return null;

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <IconRadar size={17} stroke={1.75} style={{ color: "#a78bfa" }} />
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f2f2f2" }}>Seguimiento proactivo</h2>
      </div>
      <p style={{ fontSize: 13, color: "#777", marginBottom: 8 }}>
        Define cuándo LIA puede intervenir por su cuenta con tus tareas.
      </p>

      <Row label="Intervenciones proactivas" hint="LIA detecta qué necesita atención y te escribe.">
        <Toggle value={prefs.enabled} onChange={(v) => void save({ ...prefs, enabled: v })} />
      </Row>

      <Row label="Frecuencia" hint="Cuánta insistencia toleras.">
        <div style={{ display: "flex", gap: 6 }}>
          {FREQUENCIES.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => void save({ ...prefs, frequency: f.value })}
              style={{
                fontSize: 12,
                padding: "5px 12px",
                borderRadius: 999,
                cursor: "pointer",
                color: prefs.frequency === f.value ? "#fff" : "#999",
                background: prefs.frequency === f.value ? "rgba(99,102,241,0.25)" : "transparent",
                border: `1px solid ${prefs.frequency === f.value ? "rgba(99,102,241,0.5)" : "#2a2a2a"}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Hora preferida" hint="Momento del día para las intervenciones.">
        <select
          value={prefs.preferred_hour}
          onChange={(e) => void save({ ...prefs, preferred_hour: Number(e.target.value) })}
          style={{
            background: "#161616",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            color: "#e6e6e6",
            fontSize: 13,
            padding: "6px 10px",
          }}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </Row>

      <Row label="Máximo de intervenciones por día" hint="Presupuesto diario de atención.">
        <select
          value={prefs.daily_budget}
          onChange={(e) => void save({ ...prefs, daily_budget: Number(e.target.value) })}
          style={{
            background: "#161616",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            color: "#e6e6e6",
            fontSize: 13,
            padding: "6px 10px",
          }}
        >
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Sugerencias para tareas sin fecha" hint='"¿Cuándo hacemos la cotización de Italfrenos?"'>
        <Toggle value={prefs.undated} onChange={(v) => void save({ ...prefs, undated: v })} />
      </Row>

      <Row label="Limpieza de tareas antiguas" hint='"¿La hacemos, la agendamos o la descartamos?"'>
        <Toggle value={prefs.stale_cleanup} onChange={(v) => void save({ ...prefs, stale_cleanup: v })} />
      </Row>
    </section>
  );
}
